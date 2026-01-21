# Setting Up Outlook OAuth with Personal Microsoft Account

If you **don't have an organizational Azure account**, you can still set up Outlook OAuth using your personal Microsoft account (@outlook.com, @hotmail.com, etc.).

## Quick Start Guide

### Step 1: Create Free Azure Account (If Needed)

1. Go to [Azure Portal](https://portal.azure.com/)
2. Click **"Start free"** or sign in with your personal Microsoft account
3. If you don't have an Azure subscription:
   - Click **"Create a resource"** or **"Start free"**
   - Sign up for a free Azure account (no credit card required for basic features)
   - Verify your email/phone number
   - Complete the signup process

### Step 2: Access App Registrations

**Method A: Via Azure Portal**
1. Go to [Azure Portal](https://portal.azure.com/)
2. Sign in with your personal Microsoft account
3. In the search bar at the top, type **"Azure Active Directory"** or **"Microsoft Entra ID"**
4. Click on it
5. In the left menu, click **"App registrations"**

**Method B: Via Microsoft Entra Portal (Direct)**
1. Go to [Microsoft Entra admin center](https://entra.microsoft.com/)
2. Sign in with your personal Microsoft account
3. Click **"App registrations"** in the left menu

### Step 3: Create New App Registration

1. Click **"New registration"**
2. Fill in the details:
   - **Name**: "Lead Stitch Outlook OAuth" (or any name you prefer)
   - **Supported account types**: Select **"Accounts in any organizational directory and personal Microsoft accounts (e.g. Skype, Xbox)"**
     - ⚠️ **CRITICAL**: This option allows personal accounts to sign in
   - **Redirect URI**: 
     - Platform: **Web**
     - Add both URIs (click "Add URI" after each):
       - `http://localhost:5000/api/email/outlook/oauth/callback` (for local)
       - `https://bk.leadstitch.nl/api/email/outlook/oauth/callback` (for production)
3. Click **"Register"**

### Step 4: Configure API Permissions

1. In your app registration, click **"API permissions"** in the left menu
2. Click **"Add a permission"**
3. Select **"Microsoft Graph"**
4. Select **"Delegated permissions"**
5. Add these permissions:
   - `Mail.Send`
   - `Mail.ReadWrite`
   - `User.Read`
   - `offline_access`
6. Click **"Add permissions"**
7. **Note**: Since you're using a personal account, you won't see "Grant admin consent" - that's fine. Users will consent when they connect.

### Step 5: Create Client Secret

1. Click **"Certificates & secrets"** in the left menu
2. Under **"Client secrets"**, click **"New client secret"**
3. Enter:
   - **Description**: "Lead Stitch OAuth Secret"
   - **Expires**: Select "24 months" (or your preference)
4. Click **"Add"**
5. **IMPORTANT**: Copy the **Value** immediately (you won't see it again!)
6. Save it securely (you'll need it for your `.env` file)

### Step 6: Get Application (Client) ID

1. Go to **"Overview"** in the left menu
2. Copy the **Application (client) ID**
3. Save it (you'll need it for your `.env` file)

### Step 7: Update Your .env File

Add these to your `.env` file:

**For LOCAL development:**
```env
OUTLOOK_CLIENT_ID=your_application_client_id_here
OUTLOOK_CLIENT_SECRET=your_client_secret_value_here
OUTLOOK_REDIRECT_URI=http://localhost:5000/api/email/outlook/oauth/callback
```

**For PRODUCTION:**
```env
OUTLOOK_CLIENT_ID=your_application_client_id_here
OUTLOOK_CLIENT_SECRET=your_client_secret_value_here
OUTLOOK_REDIRECT_URI=https://bk.leadstitch.nl/api/email/outlook/oauth/callback
```

### Step 8: Test the Integration

1. Restart your backend server
2. Go to your Integrations page
3. Click "Outlook / Hotmail"
4. Click "Connect with Outlook OAuth 2.0"
5. Sign in with your personal Microsoft account
6. Grant the requested permissions
7. You should be redirected back with a success message

## Troubleshooting

### "You don't have permission" Error

- Make sure you've created a free Azure subscription
- Try accessing via [Microsoft Entra admin center](https://entra.microsoft.com/) directly
- Wait a few minutes after creating your Azure account for permissions to propagate

### "Account does not exist in tenant" Error

- Go back to your app registration > **Authentication**
- Under **"Supported account types"**, make sure you selected:
  - ✅ **"Accounts in any organizational directory and personal Microsoft accounts"**
- Click **"Save"**
- Wait 1-2 minutes for changes to propagate

### Can't Find "Azure Active Directory"

- Microsoft renamed it to **"Microsoft Entra ID"**
- Search for "Microsoft Entra" in the Azure Portal search bar
- Or go directly to [Microsoft Entra admin center](https://entra.microsoft.com/)

### Free Tier Limitations

- ✅ **App registrations are FREE** - No cost
- ✅ **OAuth flows work on free tier** - No cost
- ✅ **No credit card required** for basic features
- ✅ **Microsoft Graph API** (for sending emails) is **FREE** for basic usage
- ⚠️ Some advanced Azure AD features may require paid subscription (but not needed for OAuth)

## Alternative: Use Microsoft Developer Account

If you have issues with Azure Portal, you can also use:

1. [Microsoft Developer Account](https://developer.microsoft.com/)
2. Sign in with your personal Microsoft account
3. Some OAuth features may be available here as well

## Summary

✅ **You CAN use a personal Microsoft account** to create Azure app registrations
✅ **Free Azure account is sufficient** for OAuth app registrations
✅ **No organizational account needed** - just sign up for free Azure with your personal email
✅ **The app registration will work** with personal Microsoft accounts once configured correctly

The key is making sure you select **"Accounts in any organizational directory and personal Microsoft accounts"** when creating the app registration.
