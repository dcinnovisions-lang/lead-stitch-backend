# How to Enable Billing for Google Cloud Monitoring

## Why Billing is Required

Google Cloud Monitoring API requires a billing account to be linked to your project, even if you're using the free tier. This is a Google Cloud requirement - **you won't be charged** unless you exceed the free tier limits.

## Step-by-Step Guide

### Step 1: Access Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Make sure you're in the correct project: **gen-lang-client-0345589803**

### Step 2: Navigate to Billing

1. Click on the **hamburger menu** (☰) in the top left
2. Go to **Billing** (or search for "Billing" in the search bar)
3. You'll see a list of projects and their billing status

### Step 3: Link a Billing Account

**Option A: If you already have a billing account:**

1. Click on **"Link a billing account"** or **"Manage billing accounts"**
2. Select your existing billing account
3. Click **"Set account"** or **"Link"**

**Option B: If you need to create a billing account:**

1. Click **"Create billing account"**
2. Fill in the required information:
   - **Account name**: Give it a name (e.g., "My Project Billing")
   - **Country/Region**: Select your country
   - **Currency**: Select your currency
3. Click **"Submit and enable billing"**
4. You'll need to provide payment information (credit card)
   - **Note**: You won't be charged unless you exceed free tier limits
   - Google provides $300 free credit for new accounts

### Step 4: Verify Billing is Enabled

1. Go back to your project dashboard
2. Check the top bar - you should see your billing account name
3. Or go to **Billing** > **Account management** and verify your project is linked

### Step 5: Verify Monitoring API Access

1. Go to [Cloud Monitoring API](https://console.cloud.google.com/apis/library/monitoring.googleapis.com)
2. Make sure it shows **"API enabled"**
3. If not, click **"Enable"**

### Step 6: Test Your Setup

1. Restart your backend server
2. Make a request to the usage tracking endpoint
3. Check the logs - you should see:
   ```
   ✅ Using Google Cloud Monitoring (most accurate)
   ```
   Instead of:
   ```
   ⚠️ Using local usage tracking
   ```

## Important Notes

### Free Tier Limits (You Won't Be Charged)

- **Gemini API Free Tier**: 
  - 15 requests per minute
  - 1,500 requests per day
  - 50,000 requests per month
- **Cloud Monitoring Free Tier**:
  - 150 MB of logs ingestion per month
  - 50 MB of metrics per month
  - 5 GB of trace data per month

**You won't be charged unless you exceed these limits.**

### Troubleshooting

**Error: "Billing account not found"**
- Make sure you're in the correct Google Cloud project
- Verify the billing account is active

**Error: "Permission denied"**
- Make sure your Google account has "Billing Account Administrator" or "Billing Account User" role
- Contact your organization's billing administrator

**Still seeing "Using local tracking" after enabling billing:**
1. Wait 2-3 minutes for changes to propagate
2. Restart your backend server
3. Check that `GOOGLE_CLOUD_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS` are set correctly in your `.env` file
4. Verify the service account has "Monitoring Viewer" role

## Alternative: Use Local Tracking (No Billing Required)

If you don't want to enable billing, the system will automatically use local tracking:
- ✅ Works immediately, no setup required
- ✅ Tracks all API calls made through your application
- ❌ Data resets on server restart
- ❌ Only tracks calls from this app, not all Gemini API usage

## Quick Checklist

- [ ] Billing account created/linked to project
- [ ] Cloud Monitoring API enabled
- [ ] Service account has "Monitoring Viewer" role
- [ ] Environment variables set in `.env`:
  - `GOOGLE_CLOUD_PROJECT_ID=gen-lang-client-0345589803`
  - `GOOGLE_APPLICATION_CREDENTIALS=./config/google-service-account.json`
- [ ] Backend server restarted
- [ ] Tested usage tracking endpoint

## Need Help?

- [Google Cloud Billing Documentation](https://cloud.google.com/billing/docs)
- [Cloud Monitoring Pricing](https://cloud.google.com/stackdriver/pricing)
- [Gemini API Pricing](https://ai.google.dev/pricing)
