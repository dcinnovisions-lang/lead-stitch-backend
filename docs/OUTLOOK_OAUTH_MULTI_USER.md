# Outlook OAuth for Multiple Users - How It Works

## Quick Answer

**Azure App Registration:** ✅ **ONE TIME** (done by admin/developer)  
**User OAuth Connection:** ✅ **ONCE PER USER** (each user connects their own Outlook account)

## Detailed Explanation

### Step 1: Azure App Registration (ONE TIME - Admin Setup)

**Who does this:** Admin or Developer  
**How many times:** **ONCE** for the entire application  
**What it does:** Creates a single Azure app that all users will use

**Steps:**
1. Admin creates Azure app registration
2. Configures redirect URIs (local + production)
3. Sets up API permissions
4. Creates client secret
5. Gets Client ID and Secret
6. Adds them to `.env` file

**Result:** One Azure app registration that serves ALL users

### Step 2: User OAuth Connection (ONCE PER USER)

**Who does this:** Each individual user  
**How many times:** **ONCE per user** (when they first connect their Outlook)  
**What it does:** Each user authorizes the app to access THEIR OWN Outlook account

**User Flow:**
1. User goes to Integrations page
2. Clicks "Outlook / Hotmail"
3. Clicks "Connect with Outlook OAuth 2.0"
4. Signs in with THEIR Microsoft account
5. Grants permissions
6. OAuth tokens are saved in database (linked to their `user_id`)

**Result:** Each user has their own OAuth tokens stored securely

## How It Works Technically

### Database Storage

Each user's OAuth credentials are stored separately in the `email_smtp_credentials` table:

```sql
user_id | email                    | oauth_access_token_encrypted | oauth_refresh_token_encrypted
--------|--------------------------|------------------------------|------------------------------
user-1  | john@outlook.com         | [encrypted token]            | [encrypted token]
user-2  | jane@hotmail.com         | [encrypted token]            | [encrypted token]
user-3  | bob@outlook.com          | [encrypted token]            | [encrypted token]
```

**Key Points:**
- Each row is linked to a specific `user_id`
- Each user has their own OAuth tokens
- Tokens are encrypted before storage
- Users can only access their own email accounts

### Why Each User Needs to Connect

1. **Security:** Each user must authorize access to their own email
2. **Privacy:** Users control which accounts the app can access
3. **Microsoft Requirement:** OAuth requires user consent
4. **Account Isolation:** User A cannot send emails from User B's account

## Common Scenarios

### Scenario 1: First User Setup

1. **Admin:** Creates Azure app registration (ONE TIME)
2. **User 1:** Connects their Outlook account (OAuth flow)
3. **User 1:** Can now send emails from their Outlook account

### Scenario 2: Additional Users

1. **User 2:** Goes to Integrations page
2. **User 2:** Clicks "Connect with Outlook OAuth 2.0"
3. **User 2:** Signs in with their own Microsoft account
4. **User 2:** Grants permissions
5. **User 2:** Can now send emails from their Outlook account

**Note:** User 2 doesn't need to set up Azure - it's already done!

### Scenario 3: User Reconnecting

If a user's token expires or they want to reconnect:

1. **User:** Goes to Integrations page
2. **User:** Clicks "Connect with Outlook OAuth 2.0" again
3. **User:** Signs in (may need to grant permissions again)
4. **System:** Updates their existing credentials with new tokens

## What Users See

### First Time Connection:
1. User clicks "Connect with Outlook OAuth 2.0"
2. Redirected to Microsoft login page
3. Signs in with their Microsoft account
4. Sees permission request: "Lead Stitch wants to access your mail"
5. Clicks "Accept"
6. Redirected back to app with success message

### Subsequent Uses:
- User's Outlook account is already connected
- They can send emails immediately
- No need to reconnect unless token expires

## Token Refresh (Automatic)

**Good News:** Users don't need to reconnect every time!

- Tokens automatically refresh when they expire
- Happens in the background
- Users don't see this process
- Only need to reconnect if refresh fails

## Summary

| Step | Who | How Many Times | When |
|------|-----|----------------|------|
| Azure App Registration | Admin/Developer | **ONCE** | Initial setup |
| User OAuth Connection | Each User | **ONCE per user** | When user first connects |
| Token Refresh | System (Automatic) | As needed | When tokens expire |

## FAQ

### Q: Do I need to create a new Azure app for each user?
**A:** No! One Azure app registration serves all users.

### Q: Does each user need to set up Azure?
**A:** No! Only the admin/developer sets up Azure once. Users just connect their accounts.

### Q: Can users see each other's emails?
**A:** No! Each user's OAuth tokens are separate and encrypted. User A can only access User A's email.

### Q: What if a user wants to disconnect?
**A:** They can delete their credentials from the Integrations page, or you can add a "Disconnect" button.

### Q: Can one user connect multiple Outlook accounts?
**A:** Yes! The system stores credentials per `user_id` and `email`, so a user can connect multiple Outlook accounts.

### Q: What happens if a user's token expires?
**A:** The system automatically refreshes it. If refresh fails, the user will need to reconnect (one-time action).

## Best Practices

1. **Admin Setup:**
   - Create Azure app registration once
   - Use the same app for all environments (dev/prod)
   - Keep Client ID and Secret secure

2. **User Experience:**
   - Users only need to connect once
   - Make it clear this is a one-time setup
   - Show connection status on Integrations page

3. **Security:**
   - OAuth tokens are encrypted in database
   - Each user's tokens are isolated
   - Tokens automatically refresh

## Example User Journey

**Day 1 - User Registration:**
- User signs up for Lead Stitch
- User goes to Integrations
- User connects Outlook (one-time OAuth flow)
- ✅ Done! User can now send emails

**Day 30 - User Sends Campaign:**
- User creates email campaign
- System uses their stored OAuth tokens
- Emails sent from their Outlook account
- ✅ No reconnection needed!

**Day 90 - Token Expires:**
- System detects expired token
- Automatically refreshes using refresh token
- User continues using the app
- ✅ Seamless experience!

**Day 180 - Refresh Token Expires:**
- System tries to refresh but refresh token expired
- User sees "Reconnect Outlook" message
- User clicks and goes through OAuth again (one-time)
- ✅ Reconnected!
