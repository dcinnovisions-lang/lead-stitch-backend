# Usage Tracking Troubleshooting Guide

## Problem: "Except billing, nothing is showing"

This guide will help you debug why the Summary and Detailed Usage tabs are empty.

## Step-by-Step Fix

### Step 1: Check Browser Console for Errors

1. **Open Developer Tools**
   - Press `F12` or `Right-click → Inspect`
   - Go to the **Console** tab

2. **Look for Error Messages**
   - Look for red error messages starting with `❌` or `Error`
   - Common errors:
     - `403 Forbidden` → Admin authentication issue
     - `500 Internal Server Error` → Backend API error
     - `Network Error` → Backend server not running

3. **Check Network Tab**
   - Go to **Network** tab in Developer Tools
   - Click "Refresh" on the Usage Tracking page
   - Look for requests to `/api/gemini-usage/*`
   - Check if they return status `200` or an error

### Step 2: Verify Backend API is Working

1. **Check Backend Server is Running**
   ```bash
   # In backend directory
   cd backend
   npm run dev
   # or
   npm start
   ```

2. **Test API Endpoints Manually**
   
   Open your browser or use curl/Postman to test:
   
   ```bash
   # Replace YOUR_TOKEN with your actual JWT token
   # Replace localhost:5000 with your backend URL
   
   # Test Summary Endpoint
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        http://localhost:5000/api/gemini-usage/summary
   
   # Test Full Usage Endpoint
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        http://localhost:5000/api/gemini-usage?timeRange=28d
   
   # Test Billing Endpoint
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        http://localhost:5000/api/gemini-usage/billing
   ```

3. **Check Backend Logs**
   - Look at your backend server console
   - You should see logs like:
     - `📊 Fetching Gemini API usage...`
     - `✅ API Responses:` with data
   - If you see errors, check the error message

### Step 3: Verify Admin Authentication

1. **Check if you're logged in as Admin**
   - Go to `/admin/dashboard`
   - If redirected to login or `/dashboard`, you're not an admin
   - Only users with `role: 'admin'` can access usage tracking

2. **Verify JWT Token**
   - Open Browser Developer Tools → Application → Local Storage
   - Look for `token` key
   - Copy the token value
   - Use a JWT decoder (like jwt.io) to check:
     - Token is not expired
     - Contains user info with `role: 'admin'`

3. **Check Backend Middleware**
   - File: `backend/routes/geminiUsage.js`
   - Should have:
     ```javascript
     router.use(authenticateToken);
     router.use(requireAdmin);
     ```

### Step 4: Check Data Availability

**The usage tracking page shows data from two sources:**

1. **Google Cloud Monitoring** (if configured)
   - Requires `GOOGLE_CLOUD_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS` in `.env`
   - Shows ALL Gemini API usage

2. **Local Tracking** (fallback)
   - Automatically tracks API calls made through your application
   - Only shows usage AFTER you start making API calls
   - Data resets when server restarts

**To see data in local tracking:**
- Make at least one Gemini API call through your application
- For example: Create a business requirement that uses Gemini
- Then refresh the Usage Tracking page

### Step 5: Common Issues and Solutions

#### Issue 1: "No data available" - Empty tabs

**Cause:** No API calls have been made yet, or tracking isn't working.

**Solution:**
1. Make a Gemini API call through your app:
   - Go to Business Requirements page
   - Create a new requirement that uses Gemini API
2. Wait a few seconds
3. Refresh the Usage Tracking page
4. Data should appear in "Local Usage"

#### Issue 2: API returns 403 Forbidden

**Cause:** User is not an admin, or token is invalid.

**Solution:**
1. Log out and log in as an admin user
2. Verify user role in database:
   ```sql
   SELECT id, email, role FROM users WHERE email = 'your_email@example.com';
   ```
   Should show `role = 'admin'`
3. If not admin, run admin creation script:
   ```bash
   cd backend
   node scripts/createAdminUser.js
   ```

#### Issue 3: API returns 500 Error

**Cause:** Backend error, likely in `geminiUsageService.js`

**Solution:**
1. Check backend console for error stack trace
2. Common causes:
   - Google Cloud credentials file not found
   - Invalid service account JSON
   - Missing `google-auth-library` package
3. Fix:
   ```bash
   # Install missing package
   cd backend
   npm install google-auth-library
   
   # Or disable Google Cloud (use local tracking only)
   # Remove/comment these lines in .env:
   # GOOGLE_CLOUD_PROJECT_ID=...
   # GOOGLE_APPLICATION_CREDENTIALS=...
   ```

#### Issue 4: "Loading..." spinner never stops

**Cause:** API call is hanging or timing out.

**Solution:**
1. Check backend server is running
2. Check network tab - is the request pending?
3. Check backend logs for errors
4. Try refreshing the page
5. Check API timeout settings in `config/api.js`

### Step 6: Enable Debug Mode

**In Frontend (`UsageTracking.jsx`):**
The component now has console.log statements. Check browser console for:
- `🔄 Fetching usage data...`
- `✅ API Responses:` with full response data
- `❌ Error fetching usage data:` with error details

**In Backend:**
Check server console for:
- `📊 Fetching Gemini API usage...`
- `✅` or `❌` emoji indicators
- Error stack traces

### Step 7: Verify Data Structure

**Expected API Response Structure:**

```json
{
  "success": true,
  "data": {
    "timeRange": "28d",
    "cloudUsage": {
      "totalRequests": 150,
      "dailyUsage": { "2025-12-01": 10, ... },
      "source": "google_cloud_monitoring"
    },
    "localUsage": {
      "totalRequests": 150,
      "requestsByDate": { ... },
      "source": "local_tracking"
    },
    "freeTierStatus": {
      "dailyUsage": 25,
      "monthlyUsage": 150,
      "dailyLimit": 1500,
      "monthlyLimit": 50000,
      "dailyLimitExceeded": false,
      "monthlyLimitExceeded": false,
      "dailyRemaining": 1475,
      "monthlyRemaining": 49850
    }
  }
}
```

**If response structure is different, the frontend won't display data correctly.**

### Step 8: Quick Verification Checklist

- [ ] Backend server is running on port 5000
- [ ] User is logged in as admin
- [ ] JWT token is valid and not expired
- [ ] Browser console shows no errors
- [ ] Network tab shows API requests returning 200
- [ ] At least one Gemini API call has been made (for local tracking)
- [ ] Google Cloud credentials configured (for cloud tracking) OR local tracking is working
- [ ] Backend console shows successful API responses

### Step 9: Testing the Fix

After making changes:

1. **Clear Browser Cache**
   - Press `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
   - Or clear cache in browser settings

2. **Reload the Page**
   - Navigate to `/admin/usagetracking`
   - Click "Refresh" button

3. **Check Console**
   - Should see `✅ API Responses:` with data
   - No red errors

4. **Verify Tabs Work**
   - Click "Summary" tab → Should show usage cards
   - Click "Detailed Usage" tab → Should show daily breakdown
   - Click "Billing" tab → Should show billing info

### Step 10: Still Not Working?

If nothing above works:

1. **Check Backend Routes**
   - Verify `backend/app.js` includes:
     ```javascript
     app.use('/api/gemini-usage', require('./routes/geminiUsage'));
     ```

2. **Check Frontend Routes**
   - Verify `frontend/src/App.jsx` includes:
     ```jsx
     <Route path="/admin/usagetracking" ... />
     ```

3. **Restart Everything**
   ```bash
   # Stop backend (Ctrl+C)
   # Restart backend
   cd backend
   npm run dev
   
   # Stop frontend (Ctrl+C)
   # Restart frontend
   cd frontend
   npm run dev
   ```

4. **Check Dependencies**
   ```bash
   # Backend
   cd backend
   npm install
   
   # Frontend
   cd frontend
   npm install
   ```

5. **Check .env File**
   ```bash
   # Backend .env should have:
   GEMINI_API_KEY=your_key_here
   # Optional (for cloud tracking):
   GOOGLE_CLOUD_PROJECT_ID=your_project_id
   GOOGLE_APPLICATION_CREDENTIALS=./config/service-account.json
   ```

## Summary

The most common reasons for empty tabs:

1. **No data yet** → Make some Gemini API calls first
2. **Not admin** → Login as admin user
3. **Backend error** → Check server console
4. **Network issue** → Backend not running or wrong URL
5. **Token expired** → Logout and login again

The fix I implemented:
- ✅ Added error handling and display
- ✅ Added empty state messages
- ✅ Added loading states
- ✅ Made tabs show content even with partial data
- ✅ Added console logging for debugging
- ✅ Added retry button on errors

Now the page should always show something, even if it's just a helpful message explaining why there's no data!
