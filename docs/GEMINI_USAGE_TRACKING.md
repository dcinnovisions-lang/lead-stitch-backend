# Gemini API Usage Tracking

This feature allows you to track your Gemini API usage, monitor free tier status, and check billing information directly from your application.

## Features

- ✅ **Usage Tracking**: Track API requests, tokens used, and daily/monthly usage
- ✅ **Free Tier Monitoring**: See how much of your free tier quota you've used and what's remaining
- ✅ **Billing Information**: Check if you've exceeded free tier and need to pay
- ✅ **Dual Mode**: Uses Google Cloud Monitoring API when configured, falls back to local tracking

## Setup

### Option 1: Google Cloud Monitoring (Recommended - Most Accurate)

For accurate usage data from Google Cloud:

1. **Enable Billing (REQUIRED)**
   - ⚠️ **Important**: Google Cloud Monitoring API requires billing to be enabled, even for free tier usage
   - Go to [Google Cloud Console > Billing](https://console.cloud.google.com/billing)
   - Link a billing account to your project (you won't be charged unless you exceed free tier limits)
   - See [ENABLE_BILLING_FOR_MONITORING.md](./ENABLE_BILLING_FOR_MONITORING.md) for detailed instructions

2. **Create/Select Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Use the same project where your Gemini API is enabled

3. **Enable Cloud Monitoring API**
   - Navigate to [Cloud Monitoring API](https://console.cloud.google.com/apis/library/monitoring.googleapis.com)
   - Click "Enable"

4. **Create Service Account**
   - Go to [IAM & Admin > Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
   - Click "Create Service Account"
   - Name it (e.g., "gemini-usage-tracker")
   - Grant role: **Monitoring Viewer**
   - Click "Done"

5. **Download Service Account Key**
   - Click on the created service account
   - Go to "Keys" tab
   - Click "Add Key" > "Create new key"
   - Choose JSON format
   - Download the JSON file
   - Save it securely (e.g., `./config/google-service-account.json`)

6. **Configure Environment Variables**
   ```env
   GOOGLE_CLOUD_PROJECT_ID=your-project-id-123456
   GOOGLE_APPLICATION_CREDENTIALS=./config/google-service-account.json
   ```

7. **Install Dependencies**
   ```bash
   npm install google-auth-library
   ```

### Option 2: Local Tracking (Fallback - Works Out of the Box)

If you don't configure Google Cloud credentials, the system automatically uses local tracking:
- Tracks all Gemini API calls made through this application
- Data resets on server restart
- Less accurate (only tracks calls from this app, not all usage)

## API Endpoints

All endpoints require authentication (JWT token).

### Get Comprehensive Usage Data

```http
GET /api/gemini-usage?timeRange=28d
```

**Query Parameters:**
- `timeRange` (optional): `7d`, `28d`, `90d` (default: `28d`)

**Response:**
```json
{
  "success": true,
  "data": {
    "timeRange": "28d",
    "cloudUsage": {
      "totalRequests": 150,
      "dailyUsage": {
        "2025-12-01": 10,
        "2025-12-02": 15,
        ...
      },
      "source": "google_cloud_monitoring"
    },
    "localUsage": {
      "totalRequests": 150,
      "requestsByDate": {...},
      "source": "local_tracking"
    },
    "freeTierStatus": {
      "dailyUsage": 25,
      "monthlyUsage": 150,
      "dailyLimitExceeded": false,
      "monthlyLimitExceeded": false,
      "dailyRemaining": 1475,
      "monthlyRemaining": 49850
    },
    "billing": {
      "hasBilling": false,
      "message": "No billing account linked (using free tier)"
    },
    "freeTierInfo": {
      "dailyLimit": 1500,
      "monthlyLimit": 50000
    }
  }
}
```

### Get Quick Summary

```http
GET /api/gemini-usage/summary
```

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalRequests": 150,
      "source": "google_cloud",
      "freeTierStatus": {...}
    }
  }
}
```

### Get Billing Information

```http
GET /api/gemini-usage/billing
```

**Response:**
```json
{
  "success": true,
  "data": {
    "hasBilling": false,
    "message": "No billing account linked (using free tier)"
  },
  "note": "For detailed billing information, visit: https://aistudio.google.com/u/0/usage"
}
```

## Usage in Frontend

### Example: React Component

```jsx
import { useEffect, useState } from 'react';
import axios from 'axios';

function GeminiUsageWidget() {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get('/api/gemini-usage/summary', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUsage(response.data.data);
      } catch (error) {
        console.error('Failed to fetch usage:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsage();
  }, []);

  if (loading) return <div>Loading...</div>;

  const status = usage.summary.freeTierStatus;

  return (
    <div>
      <h3>Gemini API Usage</h3>
      <p>Total Requests: {usage.summary.totalRequests}</p>
      <p>Daily Usage: {status.dailyUsage} / {status.dailyLimit}</p>
      <p>Monthly Usage: {status.monthlyUsage} / {status.monthlyLimit}</p>
      {status.dailyLimitExceeded && (
        <div style={{ color: 'red' }}>
          ⚠️ Daily limit exceeded!
        </div>
      )}
      {status.monthlyLimitExceeded && (
        <div style={{ color: 'red' }}>
          ⚠️ Monthly limit exceeded! Billing may apply.
        </div>
      )}
    </div>
  );
}
```

## Free Tier Limits

Gemini API free tier typically includes:
- **Daily Limit**: 1,500 requests per day
- **Monthly Limit**: 50,000 requests per month
- **Rate Limits**: 15 requests per minute (RPM)

Note: These limits may change. Check [Google AI Studio](https://aistudio.google.com) for current limits.

## Viewing Usage in Google AI Studio

You can also view usage directly in Google AI Studio:
- Visit: https://aistudio.google.com/u/0/usage
- Select your project
- View usage graphs, rate limits, and billing information

## Troubleshooting

### "Google Cloud credentials not configured"
- **Solution**: Either configure Google Cloud credentials (Option 1) or use local tracking (Option 2 - automatic fallback)

### "Service account file not found"
- **Solution**: Check that `GOOGLE_APPLICATION_CREDENTIALS` path is correct (can be relative or absolute)

### "google-auth-library not installed"
- **Solution**: Run `npm install google-auth-library`

### Local tracking shows 0 requests
- **Solution**: Local tracking only counts API calls made after server start. Restart the server or wait for new API calls.

## Security Notes

- Never commit service account JSON files to git
- Add `*.json` service account files to `.gitignore`
- Store service account keys securely
- Service account only needs "Monitoring Viewer" role (read-only access)
