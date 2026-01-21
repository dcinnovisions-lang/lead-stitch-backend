# Outlook OAuth 2.0 Setup Guide

This guide will help you set up Outlook OAuth 2.0 integration for personal Microsoft accounts (@outlook.com, @hotmail.com, etc.).

## Important: One-Time Setup vs Per-User Setup

**Azure App Registration:** ✅ **ONE TIME** - Done once by admin/developer for the entire application  
**User OAuth Connection:** ✅ **ONCE PER USER** - Each user connects their own Outlook account one time

**For details on how OAuth works with multiple users, see:** [OUTLOOK_OAUTH_MULTI_USER.md](./OUTLOOK_OAUTH_MULTI_USER.md)

## Problem: "Account does not exist in tenant" Error

If you see this error:
> "Selected user account does not exist in tenant 'Microsoft Services' and cannot access the application..."

This means your Azure app registration is configured for **single-tenant** (organizational accounts only), but you're trying to sign in with a **personal Microsoft account**.

## Solution: Configure App for Multi-Tenant + Personal Accounts

### Step 0: Access Azure Portal with Personal Account

**If you don't have an organizational Azure account**, you can still create app registrations using your personal Microsoft account:

1. Go to [Azure Portal](https://portal.azure.com/)
2. Sign in with your **personal Microsoft account** (@outlook.com, @hotmail.com, etc.)
3. You may need to create a free Azure account if you don't have one:
   - Click "Start free" or "Create a resource"
   - Follow the prompts to set up a free Azure subscription
   - The free tier is sufficient for app registrations

**Alternative: Use Microsoft Entra (Azure AD) Portal directly:**
- Go to [Microsoft Entra admin center](https://entra.microsoft.com/) or [Azure AD Portal](https://aad.portal.azure.com/)
- Sign in with your personal Microsoft account
- Navigate to **App registrations**

### Step 1: Create/Update Azure App Registration

1. Go to [Azure Portal](https://portal.azure.com/) or [Microsoft Entra admin center](https://entra.microsoft.com/)
2. Sign in with your **personal Microsoft account** (if not already signed in)
3. Navigate to **Azure Active Directory** > **App registrations**
   - If you don't see "Azure Active Directory", look for **"Microsoft Entra ID"** (newer name)
4. Either:
   - **Create new**: Click "New registration"
   - **Update existing**: Find your app and click on it

### Step 2: Configure Supported Account Types

1. Click on **"Authentication"** in the left menu
2. Under **"Supported account types"**, select:
   - ✅ **"Accounts in any organizational directory and personal Microsoft accounts (e.g. Skype, Xbox)"**
   
   ⚠️ **IMPORTANT**: Do NOT select:
   - ❌ "Accounts in this organizational directory only" (single-tenant)
   - ❌ "Accounts in any organizational directory" (multi-tenant, but no personal accounts)

3. Click **"Save"**

### Step 3: Configure Redirect URI

1. Still in the **"Authentication"** section
2. Under **"Platform configurations"**, click **"Add a platform"** > **"Web"**
3. Add your redirect URIs (you can add multiple):
   - **Development**: `http://localhost:5000/api/email/outlook/oauth/callback`
   - **Production**: `https://bk.leadstitch.nl/api/email/outlook/oauth/callback`
   - Click **"Add URI"** after each one
4. Click **"Save"** to save all redirect URIs

### Step 4: Configure API Permissions

1. Click **"API permissions"** in the left menu
2. Click **"Add a permission"**
3. Select **"Microsoft Graph"**
4. Select **"Delegated permissions"**
5. Add the following permissions (all as **Delegated permissions**):
   - `Mail.Send` (Microsoft Graph)
   - `Mail.ReadWrite` (Microsoft Graph)
   - `User.Read` (Microsoft Graph)
   - `offline_access` (Microsoft Graph)
6. Click **"Add permissions"**
7. If you're an admin, click **"Grant admin consent for [Your Organization]"** to pre-approve for all users

### Step 5: Create Client Secret

1. Click **"Certificates & secrets"** in the left menu
2. Under **"Client secrets"**, click **"New client secret"**
3. Enter a description (e.g., "Lead Stitch OAuth")
4. Select expiration (recommended: 24 months)
5. Click **"Add"**
6. **IMPORTANT**: Copy the **Value** immediately (you won't be able to see it again)
7. Save it securely

### Step 6: Get Application (Client) ID

1. Go to **"Overview"** in the left menu
2. Copy the **Application (client) ID**

### Step 7: Update Environment Variables

Add to your `.env` file:

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

## Testing

1. Restart your backend server
2. Go to Integrations page
3. Click "Outlook / Hotmail"
4. Click "Connect with Outlook OAuth 2.0"
5. Sign in with your personal Microsoft account (@outlook.com, @hotmail.com, etc.)
6. Grant permissions
7. You should be redirected back and see a success message

## Using Personal Microsoft Account (No Organizational Account)

If you **don't have an organizational Azure account**, you can still set this up:

### Option 1: Use Free Azure Account (Recommended)

1. Go to [Azure Portal](https://portal.azure.com/)
2. Sign in with your personal Microsoft account
3. If prompted, create a free Azure account (no credit card required for basic features)
4. Navigate to **Microsoft Entra ID** (or **Azure Active Directory**) > **App registrations**
5. Follow the setup steps above

### Option 2: Use Microsoft Entra Portal Directly

1. Go to [Microsoft Entra admin center](https://entra.microsoft.com/)
2. Sign in with your personal Microsoft account
3. Navigate to **App registrations**
4. Click **"New registration"**
5. Follow the setup steps above

### Important Notes for Personal Accounts:

- ✅ You can create app registrations with a personal Microsoft account
- ✅ The free Azure tier is sufficient for OAuth app registrations
- ✅ No credit card required for basic app registration features
- ⚠️ Some advanced features may require a paid subscription, but OAuth app registration is free
- ⚠️ If you see "You don't have permission", try creating a free Azure subscription first

## Troubleshooting

### Still seeing "account does not exist in tenant" error?

1. **Double-check account types**: Go to Authentication > Supported account types
   - Must be: "Accounts in any organizational directory and personal Microsoft accounts"
2. **Wait a few minutes**: Azure changes can take 1-5 minutes to propagate
3. **Try incognito/private window**: Clear any cached authentication
4. **Check redirect URI**: Must match exactly (including http vs https, trailing slashes, etc.)

### "Invalid client" error?

- Check that `OUTLOOK_CLIENT_ID` matches your Application (client) ID exactly
- Check that `OUTLOOK_CLIENT_SECRET` matches the secret value (not the secret ID)

### "Redirect URI mismatch" error?

- The redirect URI in your `.env` must **exactly match** the one in Azure Portal
- Check for trailing slashes, http vs https, etc.

### Token refresh not working?

- Make sure `offline_access` permission is added
- Check that refresh token is being saved in the database

## Supported Account Types

✅ **Works with:**
- Personal Microsoft accounts (@outlook.com, @hotmail.com, @live.com)
- Office 365 business accounts
- Azure AD organizational accounts

❌ **Does NOT work with:**
- Accounts in a tenant that doesn't allow external users
- Accounts that require MFA but haven't completed it

## Security Notes

- Client secrets should be rotated regularly (every 6-12 months)
- Use different app registrations for development and production
- Never commit `.env` files with real secrets to version control
- OAuth tokens are encrypted before storage in the database
