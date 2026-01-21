const axios = require('axios');
const crypto = require('crypto');
const { EmailSMTPCredentials } = require('../config/model');
const { encrypt } = require('../utils/encryption');

// Microsoft OAuth configuration
const OUTLOOK_CLIENT_ID = process.env.OUTLOOK_CLIENT_ID;
const OUTLOOK_CLIENT_SECRET = process.env.OUTLOOK_CLIENT_SECRET;
const OUTLOOK_REDIRECT_URI = process.env.OUTLOOK_REDIRECT_URI;
// Use Microsoft Graph API scopes (not Outlook-specific scopes)
// Microsoft Graph API supports short format scopes
const OUTLOOK_SCOPES = 'Mail.Send Mail.ReadWrite User.Read offline_access';
const MICROSOFT_AUTHORITY = 'https://login.microsoftonline.com/common';
const MICROSOFT_TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

/**
 * Helper function to construct frontend URL without double slashes
 */
function getFrontendUrl(path = '') {
    const baseUrl = (process.env.FRONTEND_URL).replace(/\/+$/, ''); // Remove trailing slashes
    const cleanPath = path.startsWith('/') ? path : `/${path}`; // Ensure path starts with /
    return `${baseUrl}${cleanPath}`;
}

/**
 * Generate OAuth authorization URL for Outlook
 */
exports.getOutlookAuthUrl = (req, res) => {
    try {
        const userId = req.user.userId;

        if (!OUTLOOK_CLIENT_ID || !OUTLOOK_CLIENT_SECRET) {
            return res.status(500).json({
                success: false,
                message: 'Outlook OAuth is not configured. Please set OUTLOOK_CLIENT_ID and OUTLOOK_CLIENT_SECRET in environment variables.'
            });
        }

        // Generate state parameter for CSRF protection
        const state = crypto.randomBytes(32).toString('hex');

        // Store state with userId (encoded)
        const stateWithUserId = Buffer.from(JSON.stringify({ userId, state })).toString('base64');

        const authUrl = `${MICROSOFT_AUTHORITY}/oauth2/v2.0/authorize?` +
            `client_id=${OUTLOOK_CLIENT_ID}&` +
            `response_type=code&` +
            `redirect_uri=${encodeURIComponent(OUTLOOK_REDIRECT_URI)}&` +
            `response_mode=query&` +
            `scope=${encodeURIComponent(OUTLOOK_SCOPES)}&` +
            `prompt=select_account&` + // Force account selection
            `state=${stateWithUserId}`;

        res.json({
            success: true,
            authUrl: authUrl,
            state: stateWithUserId
        });
    } catch (error) {
        console.error('Error generating Outlook auth URL:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate authorization URL'
        });
    }
};

/**
 * Handle OAuth callback - exchange code for token
 */
exports.handleOutlookCallback = async (req, res) => {
    try {
        const { code, state, error, error_description } = req.query;

        if (error) {
            const errorMsg = error_description || error || 'Unknown error';
            console.error('Outlook OAuth error:', errorMsg);
            return res.redirect(getFrontendUrl(`integrations?outlook_error=${encodeURIComponent(errorMsg)}`));
        }

        if (!code) {
            return res.redirect(getFrontendUrl('integrations?outlook_error=no_code'));
        }

        // Decode state to get userId
        let userId;
        try {
            const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
            userId = stateData.userId;
        } catch (e) {
            console.error('Invalid state parameter:', e);
            return res.redirect(getFrontendUrl('integrations?outlook_error=invalid_state'));
        }

        // Exchange authorization code for access token
        const tokenResponse = await axios.post(
            MICROSOFT_TOKEN_ENDPOINT,
            new URLSearchParams({
                client_id: OUTLOOK_CLIENT_ID,
                client_secret: OUTLOOK_CLIENT_SECRET,
                code: code,
                redirect_uri: OUTLOOK_REDIRECT_URI,
                grant_type: 'authorization_code',
                scope: OUTLOOK_SCOPES
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );

        const { access_token, refresh_token, expires_in, token_type } = tokenResponse.data;

        // Get user profile information to get email
        const profileResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
            headers: {
                'Authorization': `Bearer ${access_token}`,
            },
        });

        const { mail, userPrincipalName } = profileResponse.data;
        const email = mail || userPrincipalName;

        if (!email) {
            return res.redirect(getFrontendUrl('integrations?outlook_error=no_email'));
        }

        // Prepare OAuth token data
        const oauthData = {
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresIn: expires_in,
            tokenType: token_type || 'Bearer',
            expiresAt: new Date(Date.now() + expires_in * 1000).toISOString(),
            email: email,
        };

        // Encrypt OAuth tokens
        const encryptedAccessToken = encrypt(access_token);
        const encryptedRefreshToken = refresh_token ? encrypt(refresh_token) : null;

        // Check if credentials already exist for this email and user
        const existing = await EmailSMTPCredentials.findOne({
            where: {
                user_id: userId,
                email: email,
                provider: 'outlook'
            }
        });

        if (existing) {
            // Update existing credentials with OAuth tokens
            await existing.update({
                password_encrypted: null, // Clear password since we're using OAuth
                smtp_host: 'smtp-mail.outlook.com',
                smtp_port: 587,
                smtp_secure: false,
                username: email,
                oauth_access_token_encrypted: encryptedAccessToken,
                oauth_refresh_token_encrypted: encryptedRefreshToken,
                oauth_expires_at: oauthData.expiresAt,
                is_verified: true,
                is_active: true,
                updated_at: new Date()
            });
        } else {
            // Create new credentials with OAuth tokens
            await EmailSMTPCredentials.create({
                user_id: userId,
                provider: 'outlook',
                email: email,
                smtp_host: 'smtp-mail.outlook.com',
                smtp_port: 587,
                smtp_secure: false,
                username: email,
                password_encrypted: null, // No password needed for OAuth
                oauth_access_token_encrypted: encryptedAccessToken,
                oauth_refresh_token_encrypted: encryptedRefreshToken,
                oauth_expires_at: oauthData.expiresAt,
                is_verified: true,
                is_active: true
            });
        }

        // Redirect to frontend with success
        res.redirect(getFrontendUrl(`integrations?outlook_connected=true&email=${encodeURIComponent(email)}`));
    } catch (error) {
        console.error('Error handling Outlook callback:', error.response?.data || error.message);
        const errorMessage = error.response?.data?.error_description || error.message || 'Unknown error';
        res.redirect(getFrontendUrl(`integrations?outlook_error=${encodeURIComponent(errorMessage)}`));
    }
};

/**
 * Refresh Outlook access token
 */
exports.refreshOutlookToken = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { credentialId } = req.body;

        if (!credentialId) {
            return res.status(400).json({
                success: false,
                message: 'credentialId is required'
            });
        }

        // Get credential
        const credential = await EmailSMTPCredentials.findOne({
            where: {
                id: credentialId,
                user_id: userId,
                provider: 'outlook'
            }
        });

        if (!credential) {
            return res.status(404).json({
                success: false,
                message: 'Outlook credential not found'
            });
        }

        if (!credential.oauth_refresh_token_encrypted) {
            return res.status(400).json({
                success: false,
                message: 'No refresh token available. Please reconnect your Outlook account.'
            });
        }

        const { decrypt } = require('../utils/encryption');
        const refreshToken = decrypt(credential.oauth_refresh_token_encrypted);

        // Refresh the token
        const tokenResponse = await axios.post(
            MICROSOFT_TOKEN_ENDPOINT,
            new URLSearchParams({
                client_id: OUTLOOK_CLIENT_ID,
                client_secret: OUTLOOK_CLIENT_SECRET,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
                scope: OUTLOOK_SCOPES
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );

        const { access_token, refresh_token: new_refresh_token, expires_in } = tokenResponse.data;

        // Update credentials with new tokens
        const encryptedAccessToken = encrypt(access_token);
        const encryptedRefreshToken = new_refresh_token ? encrypt(new_refresh_token) : credential.oauth_refresh_token_encrypted;

        await credential.update({
            oauth_access_token_encrypted: encryptedAccessToken,
            oauth_refresh_token_encrypted: encryptedRefreshToken,
            oauth_expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
            updated_at: new Date()
        });

        res.json({
            success: true,
            message: 'Token refreshed successfully'
        });
    } catch (error) {
        console.error('Error refreshing Outlook token:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: error.response?.data?.error_description || error.message || 'Failed to refresh token'
        });
    }
};
