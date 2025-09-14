from fastapi import FastAPI, APIRouter, HTTPException, File, UploadFile, Form, Request, Response, Cookie
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import os
import logging
import uuid
import json
import httpx
import cloudinary
import cloudinary.uploader
from pathlib import Path

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure Cloudinary
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True
)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# FastAPI app setup
app = FastAPI(title="Manzafir Travel API", version="1.0.0")
api_router = APIRouter(prefix="/api")

# Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    picture: Optional[str] = None
    preferences: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserSession(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TravelPackage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    destinations: List[str]
    price: float
    duration: str
    images: List[str] = []
    highlights: List[str] = []
    category: str  # beaches, mountains, historical, etc.
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RecommendationRequest(BaseModel):
    budget: str  # low, medium, high
    starting_location: str
    group_size: int
    travel_preference: str  # beaches, mountains, historical, adventure, cultural
    duration: Optional[str] = "7 days"

class TravelRecommendation(BaseModel):
    destination_name: str
    description: str
    image_url: str
    highlights: List[str]
    estimated_cost: str
    best_time_to_visit: str

class UserProfile(BaseModel):
    user_id: str
    travel_style: str
    interests: List[str]
    budget_preference: str
    age_range: str
    bio: Optional[str] = None

class TravelMatch(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user1_id: str
    user2_id: str
    compatibility_score: int
    match_status: str  # pending, liked, passed, matched
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Authentication helper
async def get_current_user(request: Request) -> Optional[str]:
    """Get current user from session token"""
    # Check cookie first
    session_token = request.cookies.get("session_token")
    
    # Fallback to Authorization header
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        return None
    
    # Find active session
    session = await db.user_sessions.find_one({
        "session_token": session_token,
        "expires_at": {"$gt": datetime.now(timezone.utc)}
    })
    
    if session:
        return session["user_id"]
    return None

# Authentication routes
@api_router.post("/auth/session-data")
async def process_session_data(request: Request):
    """Process session ID from Emergent Auth"""
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        raise HTTPException(status_code=400, detail="Session ID required")
    
    try:
        # Call Emergent Auth API
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
            
        if response.status_code != 200:
            raise HTTPException(status_code=400, detail="Invalid session")
        
        user_data = response.json()
        
        # Check if user exists
        existing_user = await db.users.find_one({"email": user_data["email"]})
        
        if not existing_user:
            # Create new user
            new_user = User(
                email=user_data["email"],
                name=user_data["name"],
                picture=user_data.get("picture")
            )
            await db.users.insert_one(new_user.dict())
            user_id = new_user.id
        else:
            user_id = existing_user["id"]
        
        # Create session
        session_token = user_data["session_token"]
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        
        user_session = UserSession(
            user_id=user_id,
            session_token=session_token,
            expires_at=expires_at
        )
        
        await db.user_sessions.insert_one(user_session.dict())
        
        return {
            "user": user_data,
            "session_token": session_token,
            "user_id": user_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Authentication failed: {str(e)}")

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    user_id = await get_current_user(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session_token = request.cookies.get("session_token")
    
    # Delete session from database
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    
    # Clear cookie
    response.delete_cookie("session_token", path="/")
    
    return {"message": "Logged out successfully"}

# Travel recommendation routes
@api_router.post("/recommendations", response_model=List[TravelRecommendation])
async def get_travel_recommendations(request: RecommendationRequest):
    """Get AI-powered travel recommendations"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        # Initialize LLM chat
        chat = LlmChat(
            api_key=os.getenv("EMERGENT_LLM_KEY"),
            session_id=str(uuid.uuid4()),
            system_message="""You are a travel expert AI that provides personalized travel recommendations. 
            You should respond with exactly 3 travel recommendations in JSON format. Each recommendation should include:
            - destination_name: Name of the destination
            - description: Brief compelling description (2-3 sentences)
            - highlights: List of 3-4 key attractions/activities
            - estimated_cost: Cost range based on budget
            - best_time_to_visit: Best time to visit
            
            Always respond with valid JSON array format."""
        ).with_model("openai", "gpt-4o-mini")
        
        # Create recommendation prompt
        prompt = f"""Please provide 3 personalized travel recommendations based on these preferences:
        
        Budget: {request.budget}
        Starting Location: {request.starting_location}
        Group Size: {request.group_size} people
        Travel Preference: {request.travel_preference}
        Duration: {request.duration}
        
        Focus on destinations that match the travel preference ({request.travel_preference}) and are suitable for the budget level ({request.budget}).
        Consider the group size and starting location for practical travel planning.
        
        Respond only with a JSON array of 3 recommendations, no additional text."""
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        # Parse AI response
        try:
            recommendations_data = json.loads(response)
            recommendations = []
            
            for rec in recommendations_data:
                # Add placeholder image for now
                rec["image_url"] = "https://res.cloudinary.com/dqixczuzs/image/upload/v1/placeholder/travel_destination.jpg"
                recommendations.append(TravelRecommendation(**rec))
            
            return recommendations
            
        except json.JSONDecodeError:
            # Fallback if AI doesn't return proper JSON
            fallback_recs = [
                TravelRecommendation(
                    destination_name="Bali, Indonesia",
                    description="A tropical paradise perfect for relaxation and adventure.",
                    image_url="https://res.cloudinary.com/dqixczuzs/image/upload/v1/placeholder/bali.jpg",
                    highlights=["Beautiful beaches", "Ancient temples", "Rice terraces", "Volcano hiking"],
                    estimated_cost="$800-1200 per person",
                    best_time_to_visit="April to October"
                ),
                TravelRecommendation(
                    destination_name="Santorini, Greece",
                    description="Stunning Greek island with iconic white buildings and blue domes.",
                    image_url="https://res.cloudinary.com/dqixczuzs/image/upload/v1/placeholder/santorini.jpg",
                    highlights=["Sunset views", "Wine tasting", "Ancient ruins", "Beach clubs"],
                    estimated_cost="$1000-1500 per person",
                    best_time_to_visit="May to October"
                ),
                TravelRecommendation(
                    destination_name="Kyoto, Japan",
                    description="Ancient capital with traditional temples and beautiful gardens.",
                    image_url="https://res.cloudinary.com/dqixczuzs/image/upload/v1/placeholder/kyoto.jpg",
                    highlights=["Traditional temples", "Cherry blossoms", "Tea ceremonies", "Historic districts"],
                    estimated_cost="$900-1300 per person",
                    best_time_to_visit="March to May, September to November"
                )
            ]
            return fallback_recs[:3]
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get recommendations: {str(e)}")

# Travel packages routes
@api_router.get("/packages", response_model=List[TravelPackage])
async def get_travel_packages():
    """Get all travel packages"""
    packages = await db.travel_packages.find().to_list(length=None)
    return [TravelPackage(**package) for package in packages]

@api_router.post("/packages", response_model=TravelPackage)
async def create_travel_package(package: TravelPackage):
    """Create a new travel package"""
    await db.travel_packages.insert_one(package.dict())
    return package

# User profile routes
@api_router.get("/profile")
async def get_user_profile(request: Request):
    """Get user profile"""
    user_id = await get_current_user(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user = await db.users.find_one({"id": user_id})
    profile = await db.user_profiles.find_one({"user_id": user_id})
    
    return {
        "user": user,
        "profile": profile
    }

@api_router.post("/profile")
async def update_user_profile(profile: UserProfile, request: Request):
    """Update user profile"""
    user_id = await get_current_user(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    profile.user_id = user_id
    
    # Upsert profile
    await db.user_profiles.replace_one(
        {"user_id": user_id},
        profile.dict(),
        upsert=True
    )
    
    return {"message": "Profile updated successfully"}

# Travel matching routes
@api_router.get("/matches")
async def get_potential_matches(request: Request):
    """Get potential travel matches for user"""
    user_id = await get_current_user(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get user profile
    user_profile = await db.user_profiles.find_one({"user_id": user_id})
    if not user_profile:
        return {"matches": [], "message": "Please complete your profile first"}
    
    # Find other users with profiles (excluding current user and already matched/passed)
    existing_matches = await db.travel_matches.find({
        "$or": [
            {"user1_id": user_id},
            {"user2_id": user_id}
        ]
    }).to_list(length=None)
    
    processed_user_ids = {match["user2_id"] if match["user1_id"] == user_id else match["user1_id"] for match in existing_matches}
    processed_user_ids.add(user_id)
    
    potential_matches = await db.user_profiles.find({
        "user_id": {"$nin": list(processed_user_ids)}
    }).to_list(length=10)
    
    # Calculate compatibility scores
    matches_with_scores = []
    for match in potential_matches:
        # Get user info
        user_info = await db.users.find_one({"id": match["user_id"]})
        
        # Simple compatibility algorithm
        score = 50  # Base score
        
        # Travel style compatibility
        if match.get("travel_style") == user_profile.get("travel_style"):
            score += 20
        
        # Common interests
        user_interests = set(user_profile.get("interests", []))
        match_interests = set(match.get("interests", []))
        common_interests = len(user_interests.intersection(match_interests))
        score += common_interests * 5
        
        # Budget compatibility
        if match.get("budget_preference") == user_profile.get("budget_preference"):
            score += 15
        
        score = min(100, score)  # Cap at 100
        
        matches_with_scores.append({
            "user_id": match["user_id"],
            "name": user_info.get("name", "Unknown"),
            "picture": user_info.get("picture"),
            "profile": match,
            "compatibility_score": score
        })
    
    # Sort by compatibility score
    matches_with_scores.sort(key=lambda x: x["compatibility_score"], reverse=True)
    
    return {"matches": matches_with_scores[:5]}

@api_router.post("/matches/action")
async def match_action(request: Request, action_data: Dict[str, Any]):
    """Perform match action (like/pass)"""
    user_id = await get_current_user(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    target_user_id = action_data.get("target_user_id")
    action = action_data.get("action")  # "like" or "pass"
    
    if not target_user_id or not action:
        raise HTTPException(status_code=400, detail="Missing required fields")
    
    # Create match record
    match_record = TravelMatch(
        user1_id=user_id,
        user2_id=target_user_id,
        compatibility_score=action_data.get("compatibility_score", 0),
        match_status=action
    )
    
    await db.travel_matches.insert_one(match_record.dict())
    
    # Check if it's a mutual match
    mutual_match = None
    if action == "like":
        mutual_match = await db.travel_matches.find_one({
            "user1_id": target_user_id,
            "user2_id": user_id,
            "match_status": "like"
        })
    
    is_mutual = bool(mutual_match)
    
    return {
        "message": "Action recorded",
        "mutual_match": is_mutual
    }

# Image upload routes
@api_router.post("/upload/image")
async def upload_image(file: UploadFile = File(...), folder: Optional[str] = Form("travel")):
    """Upload image to Cloudinary"""
    try:
        # Validate file type
        if not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Upload to Cloudinary
        result = cloudinary.uploader.upload(
            file.file,
            folder=folder,
            resource_type="auto",
            use_filename=True,
            unique_filename=True
        )
        
        return {
            "success": True,
            "url": result.get("secure_url"),
            "public_id": result.get("public_id")
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

# Initialize sample data
@api_router.post("/init-data")
async def initialize_sample_data():
    """Initialize sample travel packages"""
    sample_packages = [
        TravelPackage(
            name="Tropical Paradise - Maldives",
            description="Luxury overwater villas in crystal clear waters with world-class diving and pristine beaches.",
            destinations=["Maldives", "Male", "Hulhumale"],
            price=2500.0,
            duration="7 days / 6 nights",
            images=["https://res.cloudinary.com/dqixczuzs/image/upload/v1/sample/maldives1.jpg"],
            highlights=["Overwater villas", "Snorkeling & diving", "Spa treatments", "Sunset dinners"],
            category="beaches"
        ),
        TravelPackage(
            name="Himalayan Adventure - Nepal",
            description="Trek through stunning mountain landscapes and experience rich Buddhist culture in the heart of the Himalayas.",
            destinations=["Kathmandu", "Pokhara", "Annapurna Base Camp"],
            price=1200.0,
            duration="12 days / 11 nights",
            images=["https://res.cloudinary.com/dqixczuzs/image/upload/v1/sample/nepal1.jpg"],
            highlights=["Mountain trekking", "Buddhist temples", "Local culture", "Sunrise views"],
            category="mountains"
        ),
        TravelPackage(
            name="Historic Wonders - Egypt",
            description="Explore ancient pyramids, tombs, and temples while cruising the legendary Nile River.",
            destinations=["Cairo", "Luxor", "Aswan", "Abu Simbel"],
            price=1800.0,
            duration="10 days / 9 nights",
            images=["https://res.cloudinary.com/dqixczuzs/image/upload/v1/sample/egypt1.jpg"],
            highlights=["Great Pyramids", "Nile cruise", "Valley of Kings", "Ancient temples"],
            category="historical"
        )
    ]
    
    # Check if packages already exist
    existing_count = await db.travel_packages.count_documents({})
    
    if existing_count == 0:
        for package in sample_packages:
            await db.travel_packages.insert_one(package.dict())
        return {"message": f"Initialized {len(sample_packages)} sample packages"}
    else:
        return {"message": f"Database already has {existing_count} packages"}

# Health check
@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc)}

# Include router
app.include_router(api_router)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()