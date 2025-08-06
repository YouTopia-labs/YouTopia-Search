# API Key Setup Instructions

## API Ninjas World Time API

The time functionality now uses API Ninjas World Time API instead of the unreliable World Time API.

### Setup Steps:

1. Go to [api-ninjas.com](https://api-ninjas.com)
2. Sign up for a free account
3. Get your API key from the dashboard
4. Replace `'YOUR_API_KEY'` in `js/main.js` (line ~1650) with your actual API key

### Features:

- **Comprehensive Indian City Support**: All major Indian cities (Delhi, Mumbai, Bangalore, etc.) are mapped to Asia/Kolkata timezone
- **Delhi → Kolkata Time**: When you search for "Delhi time", it correctly returns Kolkata's time (IST)
- **International Cities**: Supports major cities worldwide
- **Fallback Support**: If a city isn't in the mapping, it tries the API directly

### Example Queries:
- "What time is it in Delhi?" → Returns Asia/Kolkata time (IST)
- "Current time in Mumbai" → Returns Asia/Kolkata time (IST)
- "Time in New York" → Returns America/New_York time (EST/EDT)

### Free Tier:
- API Ninjas offers 50,000 free requests per month
- No credit card required for signup
- Perfect for personal projects