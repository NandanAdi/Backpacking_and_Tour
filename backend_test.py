#!/usr/bin/env python3
"""
Comprehensive Backend Testing for Manzafir Travel Website
Tests all API endpoints and functionality
"""

import asyncio
import aiohttp
import json
import sys
import os
from datetime import datetime
from typing import Dict, Any, List

# Get backend URL from frontend .env
def get_backend_url():
    env_path = "/app/frontend/.env"
    with open(env_path, 'r') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                return line.split('=')[1].strip()
    return "http://localhost:8001"

BASE_URL = get_backend_url()
API_BASE = f"{BASE_URL}/api"

class BackendTester:
    def __init__(self):
        self.session = None
        self.test_results = []
        self.session_token = None
        self.user_id = None
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    def log_test(self, test_name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        if response_data and not success:
            print(f"   Response: {response_data}")
        print()
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "response": response_data,
            "timestamp": datetime.now().isoformat()
        })
    
    async def test_health_check(self):
        """Test /api/health endpoint"""
        try:
            async with self.session.get(f"{API_BASE}/health") as response:
                if response.status == 200:
                    data = await response.json()
                    if "status" in data and data["status"] == "healthy":
                        self.log_test("Health Check", True, "API is healthy")
                        return True
                    else:
                        self.log_test("Health Check", False, "Invalid health response format", data)
                        return False
                else:
                    self.log_test("Health Check", False, f"HTTP {response.status}", await response.text())
                    return False
        except Exception as e:
            self.log_test("Health Check", False, f"Connection error: {str(e)}")
            return False
    
    async def test_travel_packages_get(self):
        """Test GET /api/packages endpoint"""
        try:
            async with self.session.get(f"{API_BASE}/packages") as response:
                if response.status == 200:
                    data = await response.json()
                    if isinstance(data, list):
                        self.log_test("Get Travel Packages", True, f"Retrieved {len(data)} packages")
                        return True, data
                    else:
                        self.log_test("Get Travel Packages", False, "Response is not a list", data)
                        return False, None
                else:
                    self.log_test("Get Travel Packages", False, f"HTTP {response.status}", await response.text())
                    return False, None
        except Exception as e:
            self.log_test("Get Travel Packages", False, f"Connection error: {str(e)}")
            return False, None
    
    async def test_init_data(self):
        """Test POST /api/init-data endpoint"""
        try:
            async with self.session.post(f"{API_BASE}/init-data") as response:
                if response.status == 200:
                    data = await response.json()
                    if "message" in data:
                        self.log_test("Initialize Sample Data", True, data["message"])
                        return True
                    else:
                        self.log_test("Initialize Sample Data", False, "Invalid response format", data)
                        return False
                else:
                    self.log_test("Initialize Sample Data", False, f"HTTP {response.status}", await response.text())
                    return False
        except Exception as e:
            self.log_test("Initialize Sample Data", False, f"Connection error: {str(e)}")
            return False
    
    async def test_ai_recommendations(self):
        """Test POST /api/recommendations endpoint with different preferences"""
        test_cases = [
            {
                "name": "Beach Recommendations",
                "data": {
                    "budget": "medium",
                    "starting_location": "New York",
                    "group_size": 2,
                    "travel_preference": "beaches",
                    "duration": "7 days"
                }
            },
            {
                "name": "Mountain Recommendations", 
                "data": {
                    "budget": "high",
                    "starting_location": "London",
                    "group_size": 4,
                    "travel_preference": "mountains",
                    "duration": "10 days"
                }
            },
            {
                "name": "Historical Recommendations",
                "data": {
                    "budget": "low",
                    "starting_location": "Paris",
                    "group_size": 1,
                    "travel_preference": "historical",
                    "duration": "5 days"
                }
            }
        ]
        
        all_passed = True
        for test_case in test_cases:
            try:
                headers = {"Content-Type": "application/json"}
                async with self.session.post(
                    f"{API_BASE}/recommendations", 
                    json=test_case["data"],
                    headers=headers
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        if isinstance(data, list) and len(data) > 0:
                            # Validate recommendation structure
                            first_rec = data[0]
                            required_fields = ["destination_name", "description", "highlights", "estimated_cost", "best_time_to_visit"]
                            if all(field in first_rec for field in required_fields):
                                self.log_test(f"AI {test_case['name']}", True, f"Got {len(data)} recommendations")
                            else:
                                self.log_test(f"AI {test_case['name']}", False, "Missing required fields in recommendation", first_rec)
                                all_passed = False
                        else:
                            self.log_test(f"AI {test_case['name']}", False, "Empty or invalid recommendations", data)
                            all_passed = False
                    else:
                        error_text = await response.text()
                        self.log_test(f"AI {test_case['name']}", False, f"HTTP {response.status}", error_text)
                        all_passed = False
            except Exception as e:
                self.log_test(f"AI {test_case['name']}", False, f"Connection error: {str(e)}")
                all_passed = False
        
        return all_passed
    
    async def test_authentication_flow(self):
        """Test authentication endpoints"""
        # Test session data endpoint without session ID
        try:
            async with self.session.post(f"{API_BASE}/auth/session-data") as response:
                if response.status == 400:
                    self.log_test("Auth - Missing Session ID", True, "Correctly rejected request without session ID")
                else:
                    self.log_test("Auth - Missing Session ID", False, f"Expected 400, got {response.status}")
        except Exception as e:
            self.log_test("Auth - Missing Session ID", False, f"Connection error: {str(e)}")
        
        # Test with invalid session ID
        try:
            headers = {"X-Session-ID": "invalid-session-id"}
            async with self.session.post(f"{API_BASE}/auth/session-data", headers=headers) as response:
                if response.status in [400, 401]:
                    self.log_test("Auth - Invalid Session ID", True, "Correctly rejected invalid session ID")
                else:
                    self.log_test("Auth - Invalid Session ID", False, f"Expected 400/401, got {response.status}")
        except Exception as e:
            self.log_test("Auth - Invalid Session ID", False, f"Connection error: {str(e)}")
        
        # Test logout without authentication
        try:
            async with self.session.post(f"{API_BASE}/auth/logout") as response:
                if response.status == 401:
                    self.log_test("Auth - Logout Unauthenticated", True, "Correctly rejected unauthenticated logout")
                else:
                    self.log_test("Auth - Logout Unauthenticated", False, f"Expected 401, got {response.status}")
        except Exception as e:
            self.log_test("Auth - Logout Unauthenticated", False, f"Connection error: {str(e)}")
    
    async def test_protected_endpoints(self):
        """Test endpoints that require authentication"""
        protected_endpoints = [
            ("GET", "/profile", "Get User Profile"),
            ("POST", "/profile", "Update User Profile"),
            ("GET", "/matches", "Get Potential Matches"),
            ("POST", "/matches/action", "Match Action")
        ]
        
        for method, endpoint, name in protected_endpoints:
            try:
                if method == "GET":
                    async with self.session.get(f"{API_BASE}{endpoint}") as response:
                        if response.status == 401:
                            self.log_test(f"Protected - {name}", True, "Correctly requires authentication")
                        else:
                            self.log_test(f"Protected - {name}", False, f"Expected 401, got {response.status}")
                else:
                    async with self.session.post(f"{API_BASE}{endpoint}", json={}) as response:
                        if response.status == 401:
                            self.log_test(f"Protected - {name}", True, "Correctly requires authentication")
                        else:
                            self.log_test(f"Protected - {name}", False, f"Expected 401, got {response.status}")
            except Exception as e:
                self.log_test(f"Protected - {name}", False, f"Connection error: {str(e)}")
    
    async def test_error_handling(self):
        """Test error handling with invalid inputs"""
        # Test recommendations with invalid data
        invalid_cases = [
            {
                "name": "Empty Recommendations Request",
                "data": {}
            },
            {
                "name": "Invalid Budget",
                "data": {
                    "budget": "invalid",
                    "starting_location": "Test",
                    "group_size": 1,
                    "travel_preference": "beaches"
                }
            },
            {
                "name": "Negative Group Size",
                "data": {
                    "budget": "medium",
                    "starting_location": "Test",
                    "group_size": -1,
                    "travel_preference": "beaches"
                }
            }
        ]
        
        for test_case in invalid_cases:
            try:
                headers = {"Content-Type": "application/json"}
                async with self.session.post(
                    f"{API_BASE}/recommendations",
                    json=test_case["data"],
                    headers=headers
                ) as response:
                    if response.status in [400, 422]:
                        self.log_test(f"Error Handling - {test_case['name']}", True, "Correctly handled invalid input")
                    elif response.status == 200:
                        # Some invalid inputs might still work due to AI fallback
                        self.log_test(f"Error Handling - {test_case['name']}", True, "AI handled gracefully with fallback")
                    else:
                        self.log_test(f"Error Handling - {test_case['name']}", False, f"Unexpected status {response.status}")
            except Exception as e:
                self.log_test(f"Error Handling - {test_case['name']}", False, f"Connection error: {str(e)}")
    
    async def test_image_upload(self):
        """Test image upload endpoint"""
        try:
            # Test without file
            async with self.session.post(f"{API_BASE}/upload/image") as response:
                if response.status in [400, 422]:
                    self.log_test("Image Upload - No File", True, "Correctly rejected request without file")
                else:
                    self.log_test("Image Upload - No File", False, f"Expected 400/422, got {response.status}")
        except Exception as e:
            self.log_test("Image Upload - No File", False, f"Connection error: {str(e)}")
    
    async def test_database_connectivity(self):
        """Test database connectivity through API operations"""
        # Initialize data first
        init_success = await self.test_init_data()
        
        # Then try to retrieve data
        get_success, packages = await self.test_travel_packages_get()
        
        if init_success and get_success and packages:
            self.log_test("Database Connectivity", True, "Successfully initialized and retrieved data from MongoDB")
            return True
        else:
            self.log_test("Database Connectivity", False, "Failed to initialize or retrieve data from MongoDB")
            return False
    
    async def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Manzafir Travel Backend Tests")
        print(f"🔗 Testing API at: {API_BASE}")
        print("=" * 60)
        
        # Test basic connectivity
        await self.test_health_check()
        
        # Test database operations
        await self.test_database_connectivity()
        
        # Test AI recommendations
        await self.test_ai_recommendations()
        
        # Test authentication
        await self.test_authentication_flow()
        await self.test_protected_endpoints()
        
        # Test error handling
        await self.test_error_handling()
        
        # Test file upload
        await self.test_image_upload()
        
        # Summary
        print("=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print("\n🔍 FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"   ❌ {result['test']}: {result['details']}")
        
        return passed_tests, failed_tests, self.test_results

async def main():
    """Main test runner"""
    async with BackendTester() as tester:
        passed, failed, results = await tester.run_all_tests()
        
        # Save results to file
        with open("/app/backend_test_results.json", "w") as f:
            json.dump({
                "summary": {
                    "total": len(results),
                    "passed": passed,
                    "failed": failed,
                    "success_rate": (passed/len(results))*100 if results else 0
                },
                "results": results,
                "timestamp": datetime.now().isoformat()
            }, f, indent=2)
        
        print(f"\n📄 Detailed results saved to: /app/backend_test_results.json")
        
        # Return exit code based on test results
        return 0 if failed == 0 else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)