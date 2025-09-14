import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const login = (userData, sessionToken) => {
    setUser(userData);
    // Set cookie
    document.cookie = `session_token=${sessionToken}; path=/; secure; samesite=none`;
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      document.cookie = 'session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    }
  };

  const checkAuth = async () => {
    try {
      const response = await axios.get(`${API}/profile`, { withCredentials: true });
      if (response.data.user) {
        setUser(response.data.user);
      }
    } catch (error) {
      console.log('Not authenticated');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

// Auth Processing Component
const AuthProcessor = () => {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const processAuth = async () => {
      const hash = location.hash;
      const sessionIdMatch = hash.match(/session_id=([^&]*)/);
      
      if (sessionIdMatch && !processing) {
        setProcessing(true);
        const sessionId = sessionIdMatch[1];
        
        try {
          const response = await axios.post(`${API}/auth/session-data`, {}, {
            headers: { 'X-Session-ID': sessionId }
          });
          
          login(response.data.user, response.data.session_token);
          
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
          
          navigate('/dashboard');
        } catch (error) {
          console.error('Auth processing failed:', error);
          navigate('/');
        }
      }
    };

    processAuth();
  }, [location.hash, login, navigate, processing]);

  if (processing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Authenticating...</p>
        </div>
      </div>
    );
  }

  return null;
};

// Navigation Component
const Navigation = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  return (
    <nav className="bg-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <button 
              onClick={() => navigate('/')}
              className="text-2xl font-bold text-blue-600 hover:text-blue-700 transition-colors"
            >
              Manzafir
            </button>
          </div>
          
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <button 
                  onClick={() => navigate('/packages')}
                  className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Packages
                </button>
                <button 
                  onClick={() => navigate('/matches')}
                  className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Find Companions
                </button>
                <button 
                  onClick={() => navigate('/profile')}
                  className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Profile
                </button>
                <div className="flex items-center space-x-2">
                  {user.picture && (
                    <img src={user.picture} alt="Profile" className="w-8 h-8 rounded-full" />
                  )}
                  <span className="text-gray-700 text-sm">{user.name}</span>
                </div>
                <button 
                  onClick={logout}
                  className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <button 
                onClick={() => {
                  const redirectUrl = encodeURIComponent(`${window.location.origin}/dashboard`);
                  window.location.href = `https://auth.emergentagent.com/?redirect=${redirectUrl}`;
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Login with Google
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

// Home Page Component
const HomePage = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    budget: 'medium',
    starting_location: '',
    group_size: 2,
    travel_preference: 'beaches',
    duration: '7 days'
  });

  const handleRecommendationSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await axios.post(`${API}/recommendations`, formData);
      setRecommendations(response.data);
    } catch (error) {
      console.error('Failed to get recommendations:', error);
      alert('Failed to get recommendations. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="relative h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-800">
        <div className="absolute inset-0 bg-black opacity-20"></div>
        <div className="relative text-center text-white px-4">
          <h1 className="text-6xl md:text-8xl font-bold mb-6 animate-fade-in">
            Explore, Discover, Travel
          </h1>
          <p className="text-xl md:text-2xl mb-8 max-w-3xl mx-auto opacity-90">
            From destination to traveler - discover your next adventure with AI-powered recommendations
          </p>
          {!user && (
            <button 
              onClick={() => {
                const redirectUrl = encodeURIComponent(`${window.location.origin}/dashboard`);
                window.location.href = `https://auth.emergentagent.com/?redirect=${redirectUrl}`;
              }}
              className="bg-white text-blue-600 px-8 py-4 rounded-full text-lg font-semibold hover:bg-gray-100 transform hover:scale-105 transition-all duration-200 shadow-lg"
            >
              Start Your Journey
            </button>
          )}
        </div>
      </div>

      {/* AI Recommendation Form */}
      <div className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">AI-Powered Travel Recommendations</h2>
            <p className="text-xl text-gray-600">Tell us your preferences and let AI find your perfect destination</p>
          </div>

          <form onSubmit={handleRecommendationSubmit} className="bg-gray-50 p-8 rounded-2xl shadow-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Budget</label>
                <select 
                  value={formData.budget}
                  onChange={(e) => setFormData({...formData, budget: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="low">Budget-friendly ($500-1000)</option>
                  <option value="medium">Moderate ($1000-2500)</option>
                  <option value="high">Luxury ($2500+)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Starting Location</label>
                <input 
                  type="text"
                  value={formData.starting_location}
                  onChange={(e) => setFormData({...formData, starting_location: e.target.value})}
                  placeholder="Enter your city/country"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Group Size</label>
                <select 
                  value={formData.group_size}
                  onChange={(e) => setFormData({...formData, group_size: parseInt(e.target.value)})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={1}>Solo traveler</option>
                  <option value={2}>Couple</option>
                  <option value={3}>Small group (3-4)</option>
                  <option value={5}>Family/Large group (5+)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Travel Preference</label>
                <select 
                  value={formData.travel_preference}
                  onChange={(e) => setFormData({...formData, travel_preference: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="beaches">Beaches & Islands</option>
                  <option value="mountains">Mountains & Nature</option>
                  <option value="historical">Historical & Cultural</option>
                  <option value="adventure">Adventure & Sports</option>
                  <option value="cultural">Art & Culture</option>
                  <option value="city">City & Urban</option>
                </select>
              </div>
            </div>

            <div className="mt-6">
              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-4 px-6 rounded-lg text-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 transition-all duration-200"
              >
                {loading ? 'Getting Recommendations...' : 'Get My Recommendations'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Recommendations Display */}
      {recommendations.length > 0 && (
        <div className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h3 className="text-3xl font-bold text-center text-gray-900 mb-12">Your Personalized Recommendations</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {recommendations.map((rec, index) => (
                <div key={index} className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
                  <div className="h-48 bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                    <span className="text-white text-6xl">🏝️</span>
                  </div>
                  <div className="p-6">
                    <h4 className="text-xl font-bold text-gray-900 mb-2">{rec.destination_name}</h4>
                    <p className="text-gray-600 mb-4">{rec.description}</p>
                    <div className="space-y-2">
                      <p className="text-sm"><span className="font-medium">Cost:</span> {rec.estimated_cost}</p>
                      <p className="text-sm"><span className="font-medium">Best time:</span> {rec.best_time_to_visit}</p>
                    </div>
                    <div className="mt-4">
                      <h5 className="font-medium text-gray-900 mb-2">Highlights:</h5>
                      <div className="flex flex-wrap gap-2">
                        {rec.highlights.map((highlight, i) => (
                          <span key={i} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                            {highlight}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Featured Packages Preview */}
      <div className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold text-gray-900 mb-4">Featured Travel Packages</h3>
            <p className="text-xl text-gray-600">Curated experiences for every type of traveler</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { name: 'Tropical Paradise', category: 'Beaches', price: '$2,500', image: '🏖️' },
              { name: 'Mountain Adventure', category: 'Mountains', price: '$1,800', image: '⛰️' },
              { name: 'Cultural Journey', category: 'Historical', price: '$2,200', image: '🏛️' }
            ].map((pkg, index) => (
              <div key={index} className="bg-gray-50 rounded-2xl p-6 hover:shadow-lg transition-shadow duration-300">
                <div className="text-center mb-4">
                  <span className="text-6xl">{pkg.image}</span>
                </div>
                <h4 className="text-xl font-bold text-gray-900 text-center mb-2">{pkg.name}</h4>
                <p className="text-gray-600 text-center mb-4">{pkg.category}</p>
                <p className="text-2xl font-bold text-blue-600 text-center mb-4">{pkg.price}</p>
                <button 
                  onClick={() => navigate('/packages')}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  View Details
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Dashboard Component
const Dashboard = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Welcome back, {user.name}!</h1>
          <p className="text-gray-600 mt-2">Ready for your next adventure?</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div 
            onClick={() => navigate('/')}
            className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-blue-500"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Get Recommendations</h3>
            <p className="text-gray-600">Discover new destinations with AI-powered suggestions</p>
          </div>

          <div 
            onClick={() => navigate('/packages')}
            className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-green-500"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Browse Packages</h3>
            <p className="text-gray-600">Explore curated travel packages for every budget</p>
          </div>

          <div 
            onClick={() => navigate('/matches')}
            className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-purple-500"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Find Travel Buddies</h3>
            <p className="text-gray-600">Connect with like-minded travelers</p>
          </div>

          <div 
            onClick={() => navigate('/profile')}
            className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-orange-500"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Your Profile</h3>
            <p className="text-gray-600">Update your travel preferences and info</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Packages Page Component
const PackagesPage = () => {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPackages = async () => {
      try {
        // Initialize sample data first
        await axios.post(`${API}/init-data`);
        
        const response = await axios.get(`${API}/packages`);
        setPackages(response.data);
      } catch (error) {
        console.error('Failed to fetch packages:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPackages();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Travel Packages</h1>
          <p className="text-gray-600 mt-2">Discover amazing destinations with our curated packages</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {packages.map((pkg) => (
            <div key={pkg.id} className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
              <div className="h-48 bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                <span className="text-white text-6xl">
                  {pkg.category === 'beaches' ? '🏖️' : 
                   pkg.category === 'mountains' ? '⛰️' : 
                   pkg.category === 'historical' ? '🏛️' : '✈️'}
                </span>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-2">{pkg.name}</h3>
                <p className="text-gray-600 mb-4">{pkg.description}</p>
                
                <div className="space-y-2 mb-4">
                  <p className="text-sm"><span className="font-medium">Duration:</span> {pkg.duration}</p>
                  <p className="text-sm"><span className="font-medium">Destinations:</span> {pkg.destinations.join(', ')}</p>
                  <p className="text-2xl font-bold text-blue-600">${pkg.price}</p>
                </div>

                <div className="mb-4">
                  <h4 className="font-medium text-gray-900 mb-2">Highlights:</h4>
                  <div className="flex flex-wrap gap-2">
                    {pkg.highlights.map((highlight, i) => (
                      <span key={i} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                        {highlight}
                      </span>
                    ))}
                  </div>
                </div>

                <button className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">
                  View Details
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Profile Page Component
const ProfilePage = () => {
  const { user, checkAuth } = useContext(AuthContext);
  const [profile, setProfile] = useState({
    travel_style: 'adventurous',
    interests: [],
    budget_preference: 'medium',
    age_range: '25-34',
    bio: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await axios.get(`${API}/profile`, { withCredentials: true });
        if (response.data.profile) {
          setProfile(response.data.profile);
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      }
    };

    if (user) {
      fetchProfile();
    }
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      await axios.post(`${API}/profile`, profile, { withCredentials: true });
      alert('Profile updated successfully!');
    } catch (error) {
      console.error('Failed to save profile:', error);
      alert('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleInterestToggle = (interest) => {
    setProfile(prev => ({
      ...prev,
      interests: prev.interests.includes(interest) 
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest]
    }));
  };

  if (!user) {
    return <Navigate to="/" replace />;
  }

  const availableInterests = ['Adventure', 'Culture', 'Food', 'Nature', 'History', 'Art', 'Music', 'Sports', 'Photography', 'Wildlife'];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Your Profile</h1>
            <p className="text-gray-600 mt-2">Tell us about your travel preferences to get better matches and recommendations</p>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Travel Style</label>
                <select 
                  value={profile.travel_style}
                  onChange={(e) => setProfile({...profile, travel_style: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="adventurous">Adventurous</option>
                  <option value="relaxed">Relaxed</option>
                  <option value="cultural">Cultural Explorer</option>
                  <option value="luxury">Luxury Seeker</option>
                  <option value="budget">Budget Conscious</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Budget Preference</label>
                <select 
                  value={profile.budget_preference}
                  onChange={(e) => setProfile({...profile, budget_preference: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="low">Budget-friendly</option>
                  <option value="medium">Moderate</option>
                  <option value="high">Luxury</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Age Range</label>
                <select 
                  value={profile.age_range}
                  onChange={(e) => setProfile({...profile, age_range: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="18-24">18-24</option>
                  <option value="25-34">25-34</option>
                  <option value="35-44">35-44</option>
                  <option value="45-54">45-54</option>
                  <option value="55+">55+</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Interests</label>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {availableInterests.map((interest) => (
                  <button
                    key={interest}
                    type="button"
                    onClick={() => handleInterestToggle(interest)}
                    className={`p-2 rounded-lg text-sm font-medium transition-colors ${
                      profile.interests.includes(interest)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {interest}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Bio</label>
              <textarea 
                value={profile.bio}
                onChange={(e) => setProfile({...profile, bio: e.target.value})}
                placeholder="Tell other travelers about yourself..."
                rows={4}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <button 
              type="submit"
              disabled={saving}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg text-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

// Travel Matches Page Component
const MatchesPage = () => {
  const { user } = useContext(AuthContext);
  const [matches, setMatches] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const response = await axios.get(`${API}/matches`, { withCredentials: true });
        setMatches(response.data.matches || []);
      } catch (error) {
        console.error('Failed to fetch matches:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchMatches();
    }
  }, [user]);

  const handleAction = async (action) => {
    if (!matches[currentMatchIndex]) return;
    
    setActionLoading(true);
    
    try {
      const response = await axios.post(`${API}/matches/action`, {
        target_user_id: matches[currentMatchIndex].user_id,
        action: action,
        compatibility_score: matches[currentMatchIndex].compatibility_score
      }, { withCredentials: true });

      if (response.data.mutual_match) {
        alert('🎉 It\'s a match! You both liked each other!');
      }

      // Move to next match
      setCurrentMatchIndex(prev => prev + 1);
    } catch (error) {
      console.error('Failed to perform action:', error);
      alert('Action failed. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (matches.length === 0 || currentMatchIndex >= matches.length) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🎯</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">No more matches!</h2>
          <p className="text-gray-600 mb-6">Complete your profile to get better matches.</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Refresh Matches
          </button>
        </div>
      </div>
    );
  }

  const currentMatch = matches[currentMatchIndex];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Find Travel Companions</h1>
          <p className="text-gray-600 mt-2">Swipe to find like-minded travelers</p>
          <div className="mt-2 text-sm text-gray-500">
            {currentMatchIndex + 1} of {matches.length} matches
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          {/* Profile Image */}
          <div className="h-80 bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
            {currentMatch.picture ? (
              <img 
                src={currentMatch.picture} 
                alt={currentMatch.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-white text-8xl">👤</div>
            )}
          </div>

          {/* Profile Info */}
          <div className="p-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-3xl font-bold text-gray-900">{currentMatch.name}</h2>
              <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                {currentMatch.compatibility_score}% match
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Travel Style</h3>
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                  {currentMatch.profile.travel_style}
                </span>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 mb-2">Budget Preference</h3>
                <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">
                  {currentMatch.profile.budget_preference}
                </span>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 mb-2">Age Range</h3>
                <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm">
                  {currentMatch.profile.age_range}
                </span>
              </div>

              {currentMatch.profile.interests && currentMatch.profile.interests.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Interests</h3>
                  <div className="flex flex-wrap gap-2">
                    {currentMatch.profile.interests.map((interest, i) => (
                      <span key={i} className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm">
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {currentMatch.profile.bio && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">About</h3>
                  <p className="text-gray-600">{currentMatch.profile.bio}</p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-4">
              <button 
                onClick={() => handleAction('pass')}
                disabled={actionLoading}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-4 px-6 rounded-2xl text-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <span className="mr-2">👎</span>
                Pass
              </button>
              <button 
                onClick={() => handleAction('like')}
                disabled={actionLoading}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white py-4 px-6 rounded-2xl text-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <span className="mr-2">👍</span>
                Like
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return user ? children : <Navigate to="/" replace />;
};

// Main App Component
function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Navigation />
          <AuthProcessor />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/packages" element={<PackagesPage />} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/matches" element={<ProtectedRoute><MatchesPage /></ProtectedRoute>} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;