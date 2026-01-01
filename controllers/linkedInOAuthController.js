const axios = require('axios');
const crypto = require('crypto');
const { LinkedInCredentials } = require('../config/model');

// LinkedIn OAuth configuration
const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const LINKEDIN_REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:5173/integrations/linkedin/callback';
const LINKEDIN_SCOPES = 'openid profile email'; // Request basic profile and email

// Generate OAuth authorization URL
exports.getLinkedInAuthUrl = (req, res) => {
    try {
        const userId = req.user.userId;

        // Generate state parameter for CSRF protection
        const state = crypto.randomBytes(32).toString('hex');

        // Store state in session or database (for production, use Redis or session store)
        // For now, we'll include userId in state (encoded)
        const stateWithUserId = Buffer.from(JSON.stringify({ userId, state })).toString('base64');

        const authUrl = `https://www.linkedin.com/oauth/v2/authorization?` +
            `response_type=code&` +
            `client_id=${LINKEDIN_CLIENT_ID}&` +
            `redirect_uri=${encodeURIComponent(LINKEDIN_REDIRECT_URI)}&` +
            `state=${stateWithUserId}&` +
            `scope=${encodeURIComponent(LINKEDIN_SCOPES)}`;

        res.json({
            success: true,
            authUrl: authUrl,
            state: stateWithUserId
        });
    } catch (error) {
        console.error('Error generating LinkedIn auth URL:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate authorization URL'
        });
    }
};

// Handle OAuth callback - exchange code for token
exports.handleLinkedInCallback = async (req, res) => {
    try {
        const { code, state, error } = req.query;

        if (error) {
            return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/integrations?error=${encodeURIComponent(error)}`);
        }

        if (!code) {
            return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/integrations?error=no_code`);
        }

        // Decode state to get userId
        let userId;
        try {
            const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
            userId = stateData.userId;
        } catch (e) {
            return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/integrations?error=invalid_state`);
        }

        // Exchange authorization code for access token
        const tokenResponse = await axios.post(
            'https://www.linkedin.com/oauth/v2/accessToken',
            new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: LINKEDIN_REDIRECT_URI,
                client_id: LINKEDIN_CLIENT_ID,
                client_secret: LINKEDIN_CLIENT_SECRET,
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );

        const { access_token, refresh_token, expires_in } = tokenResponse.data;

        // Get user profile information
        const profileResponse = await axios.get('https://api.linkedin.com/v2/userinfo', {
            headers: {
                'Authorization': `Bearer ${access_token}`,
            },
        });

        const { email, name, sub } = profileResponse.data;

        // Store OAuth tokens in database
        const oauthData = {
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresIn: expires_in,
            tokenType: 'Bearer',
            expiresAt: new Date(Date.now() + expires_in * 1000).toISOString(),
            linkedInUserId: sub,
            email: email,
            name: name,
            scopes: LINKEDIN_SCOPES,
        };

        // Check if credentials already exist
        const existing = await LinkedInCredentials.findOne({
            where: { user_id: userId }
        });

        if (existing) {
            // Update existing credentials
            await existing.update({
                email: email,
                session_data: JSON.stringify(oauthData),
                is_active: true,
                updated_at: new Date()
            });
        } else {
            // Insert new credentials
            await LinkedInCredentials.create({
                user_id: userId,
                email: email,
                password_encrypted: null,
                session_data: JSON.stringify(oauthData),
                is_active: true
            });
        }

        // Redirect to frontend with success
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/integrations?linkedin_connected=true`);
    } catch (error) {
        console.error('Error handling LinkedIn callback:', error.response?.data || error.message);
        const errorMessage = error.response?.data?.error_description || error.message || 'Unknown error';
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/integrations?error=${encodeURIComponent(errorMessage)}`);
    }
};

// Refresh access token
exports.refreshLinkedInToken = async (req, res) => {
    try {
        const userId = req.user.userId;

        // Get current credentials
        const credential = await LinkedInCredentials.findOne({
            where: {
                user_id: userId,
                is_active: true
            },
            attributes: ['session_data']
        });

        if (!credential) {
            return res.status(404).json({
                success: false,
                message: 'LinkedIn credentials not found'
            });
        }

        const sessionData = JSON.parse(credential.session_data);
        const refreshToken = sessionData.refreshToken;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'No refresh token available'
            });
        }

        // Exchange refresh token for new access token
        const tokenResponse = await axios.post(
            'https://www.linkedin.com/oauth/v2/accessToken',
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: LINKEDIN_CLIENT_ID,
                client_secret: LINKEDIN_CLIENT_SECRET,
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );

        const { access_token, expires_in } = tokenResponse.data;

        // Update session data
        sessionData.accessToken = access_token;
        sessionData.expiresIn = expires_in;
        sessionData.expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

        await credential.update({
            session_data: JSON.stringify(sessionData),
            updated_at: new Date()
        });

        res.json({
            success: true,
            message: 'Token refreshed successfully'
        });
    } catch (error) {
        console.error('Error refreshing LinkedIn token:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to refresh token'
        });
    }
};

