const linkedInVerificationService = require('../services/linkedInVerificationService');
const axios = require('axios');
const { encrypt, decrypt } = require('../utils/encryption');
const { LinkedInCredentials } = require('../config/model');

// Get LinkedIn credentials for current user
exports.getLinkedInCredentials = async (req, res) => {
    try {
        const userId = req.user.userId;

        const credential = await LinkedInCredentials.findOne({
            where: { user_id: userId },
            attributes: ['id', 'email', 'is_active', 'last_used_at', 'created_at', 'updated_at']
        });

        if (!credential) {
            return res.json({ exists: false, credentials: null });
        }

        res.json({
            exists: true,
            credentials: {
                id: credential.id,
                email: credential.email,
                isActive: credential.is_active,
                lastUsedAt: credential.last_used_at,
                createdAt: credential.created_at,
                updatedAt: credential.updated_at,
            }
        });
    } catch (error) {
        console.error('Get LinkedIn credentials error:', error);
        res.status(500).json({
            success: false,
            message: 'Unable to retrieve LinkedIn credentials. Please try again later or contact support if the problem persists.'
        });
    }
};

// Capture LinkedIn session from popup (called after user logs in)
exports.captureLinkedInSession = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { cookies, email, password, url } = req.body;

        if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No cookies provided. Please ensure you are logged into LinkedIn.'
            });
        }

        // Verify the session is valid by making a test request to LinkedIn
        const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        try {
            // Test if session is valid by accessing LinkedIn feed
            const testResponse = await axios.get('https://www.linkedin.com/feed/', {
                headers: {
                    'Cookie': cookieString,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                },
                maxRedirects: 5,
                validateStatus: (status) => status < 500,
            });

            // Check if we got redirected to login (session invalid) or got feed (session valid)
            const isSessionValid = testResponse.status === 200 &&
                !testResponse.request.res.responseUrl?.includes('/login') &&
                (testResponse.data?.includes?.('feed') || testResponse.data?.includes?.('voyager'));

            if (!isSessionValid) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid session. Please log in to LinkedIn again and try again.',
                });
            }

            // Extract email from LinkedIn profile if not provided
            let linkedInEmail = email;
            if (!linkedInEmail) {
                try {
                    // Try to get email from LinkedIn profile/settings
                    const profileResponse = await axios.get('https://www.linkedin.com/me/', {
                        headers: {
                            'Cookie': cookieString,
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        },
                        maxRedirects: 5,
                        validateStatus: (status) => status < 500,
                    });

                    // Try to extract email from HTML (LinkedIn may show email in profile)
                    const htmlContent = profileResponse.data || '';
                    const emailMatch = htmlContent.match(/["']email["']\s*:\s*["']([^"']+)["']/) ||
                        htmlContent.match(/mailto:([^\s"']+)/);

                    if (emailMatch && emailMatch[1]) {
                        linkedInEmail = emailMatch[1];
                        console.log('Extracted email from LinkedIn profile:', linkedInEmail);
                    }
                } catch (e) {
                    console.log('Could not extract email from profile:', e.message);
                }
            }

            // If still no email, try to get from account settings
            if (!linkedInEmail) {
                try {
                    const settingsResponse = await axios.get('https://www.linkedin.com/mypreferences/d/email', {
                        headers: {
                            'Cookie': cookieString,
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        },
                        maxRedirects: 5,
                        validateStatus: (status) => status < 500,
                    });

                    const htmlContent = settingsResponse.data || '';
                    const emailMatch = htmlContent.match(/<input[^>]*type=["']email["'][^>]*value=["']([^"']+)["']/) ||
                        htmlContent.match(/["']emailAddress["']\s*:\s*["']([^"']+)["']/);

                    if (emailMatch && emailMatch[1]) {
                        linkedInEmail = emailMatch[1];
                        console.log('Extracted email from LinkedIn settings:', linkedInEmail);
                    }
                } catch (e) {
                    console.log('Could not extract email from settings:', e.message);
                }
            }

            // Convert cookies array to object and string format
            const cookiesObject = {};
            cookies.forEach(cookie => {
                cookiesObject[cookie.name] = cookie.value;
            });

            const sessionData = {
                cookies: cookiesObject,
                cookieString: cookieString,
                capturedAt: new Date().toISOString(),
                url: url || 'https://www.linkedin.com',
            };

            // Encrypt password if provided
            let passwordEncrypted = null;
            if (password) {
                passwordEncrypted = encrypt(password);
            }

            // Check if credentials already exist
            const existing = await LinkedInCredentials.findOne({
                where: { user_id: userId },
                attributes: ['id', 'password_encrypted']
            });

            if (existing) {
                // Update existing credentials with new session, email, and password
                const updateData = {
                    email: linkedInEmail || existing.email,
                    session_data: JSON.stringify(sessionData),
                    is_active: true,
                    updated_at: new Date()
                };

                if (passwordEncrypted) {
                    updateData.password_encrypted = passwordEncrypted;
                }

                await existing.update(updateData);
            } else {
                // Insert new credentials with email, password (if provided), and session
                await LinkedInCredentials.create({
                    user_id: userId,
                    email: linkedInEmail || 'captured@linkedin.com',
                    password_encrypted: passwordEncrypted,
                    session_data: JSON.stringify(sessionData),
                    is_active: true
                });
            }

            res.json({
                success: true,
                message: 'LinkedIn credentials (email, password, and session) captured and saved successfully!',
                email: linkedInEmail,
                hasPassword: !!password,
                sessionValid: true,
            });
        } catch (verifyError) {
            console.error('Session verification error:', verifyError);
            return res.status(400).json({
                success: false,
                message: 'Failed to verify LinkedIn session. Please ensure you are logged in and try again.',
            });
        }
    } catch (error) {
        console.error('Capture LinkedIn session error:', error);

        // Handle specific error types
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            return res.status(500).json({
                success: false,
                message: 'Unable to connect to LinkedIn. Please check your internet connection and try again.'
            });
        }

        if (error.response?.status === 401 || error.response?.status === 403) {
            return res.status(400).json({
                success: false,
                message: 'LinkedIn session expired or invalid. Please log in to LinkedIn again and try again.'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Unable to save LinkedIn credentials at this time. Please try again in a few moments. If the problem continues, please contact support.'
        });
    }
};

// Verify LinkedIn credentials (legacy - for password-based verification)
exports.verifyLinkedInCredentials = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Verify credentials with LinkedIn
        const verificationResult = await linkedInVerificationService.verifyCredentials(email, password);

        res.json(verificationResult);
    } catch (error) {
        console.error('Verify LinkedIn credentials error:', error);

        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            return res.status(500).json({
                success: false,
                message: 'Unable to connect to LinkedIn. Please check your internet connection and try again.'
            });
        }

        if (error.response?.status === 401 || error.response?.status === 403) {
            return res.status(400).json({
                success: false,
                message: 'Invalid LinkedIn credentials. Please check your email and password and try again.'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Unable to verify LinkedIn credentials. Please try again later or contact support if the problem persists.'
        });
    }
};

// Save or update LinkedIn credentials
exports.saveLinkedInCredentials = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { email, password, sessionData: incomingSessionData } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        if (!password) {
            return res.status(400).json({
                success: false,
                message: 'Password is required'
            });
        }

        // Encrypt password (reversible)
        let passwordEncrypted;
        try {
            passwordEncrypted = encrypt(password);
        } catch (err) {
            console.error('LinkedIn password encryption error:', err);
            return res.status(500).json({
                success: false,
                message: 'Failed to securely store password. Please try again.'
            });
        }

        // Check if credentials already exist
        const existing = await LinkedInCredentials.findOne({
            where: { user_id: userId }
        });

        // Prepare session data
        const finalSessionData = incomingSessionData || {
            cookies: {},
            cookieString: '',
            capturedAt: new Date().toISOString(),
            url: 'https://www.linkedin.com',
        };

        if (existing) {
            // Update existing credentials
            await existing.update({
                email: email,
                password_encrypted: passwordEncrypted,
                session_data: JSON.stringify(finalSessionData),
                is_active: true,
                updated_at: new Date()
            });
        } else {
            // Insert new credentials
            await LinkedInCredentials.create({
                user_id: userId,
                email: email,
                password_encrypted: passwordEncrypted,
                session_data: JSON.stringify(finalSessionData),
                is_active: true
            });
        }

        res.json({
            success: true,
            message: 'LinkedIn credentials saved securely. Please ensure they are correct before starting scraping.',
            email: email,
            verified: false
        });
    } catch (error) {
        console.error('Save LinkedIn credentials error:', error);

        // Handle database errors
        if (error.code === '23505') { // Unique constraint violation
            return res.status(400).json({
                success: false,
                message: 'LinkedIn credentials already exist for this account. Please update them instead.'
            });
        }

        if (error.code === '23503') { // Foreign key violation
            return res.status(400).json({
                success: false,
                message: 'Invalid user account. Please log out and log in again.'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Unable to save LinkedIn credentials at this time. Please try again in a few moments. If the problem continues, please contact support.'
        });
    }
};

// Update LinkedIn credentials
exports.updateLinkedInCredentials = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { email, password, sessionData } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        const credential = await LinkedInCredentials.findOne({
            where: { user_id: userId }
        });

        if (!credential) {
            return res.status(404).json({ message: 'LinkedIn credentials not found' });
        }

        const updateData = {
            email: email,
            updated_at: new Date()
        };

        if (password) {
            try {
                updateData.password_encrypted = encrypt(password);
            } catch (err) {
                console.error('LinkedIn password encryption error (update):', err);
                return res.status(500).json({ message: 'Failed to securely update password' });
            }
        }

        if (sessionData) {
            updateData.session_data = JSON.stringify(sessionData);
        }

        await credential.update(updateData);

        res.json({ message: 'LinkedIn credentials updated successfully' });
    } catch (error) {
        console.error('Update LinkedIn credentials error:', error);

        if (error.code === '23505') { // Unique constraint violation
            return res.status(400).json({
                success: false,
                message: 'This email is already associated with another account. Please use a different email.'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Unable to update LinkedIn credentials at this time. Please try again in a few moments. If the problem continues, please contact support.'
        });
    }
};

// Delete LinkedIn credentials
exports.deleteLinkedInCredentials = async (req, res) => {
    try {
        const userId = req.user.userId;

        await LinkedInCredentials.destroy({
            where: { user_id: userId }
        });

        res.json({ message: 'LinkedIn credentials deleted successfully' });
    } catch (error) {
        console.error('Delete LinkedIn credentials error:', error);
        res.status(500).json({
            success: false,
            message: 'Unable to delete LinkedIn credentials at this time. Please try again in a few moments. If the problem continues, please contact support.'
        });
    }
};

// Get LinkedIn credentials for scraping (includes password and session)
exports.getLinkedInCredentialsForScraping = async (req, res) => {
    try {
        const userId = req.user.userId;

        // Prevent caching so clients always get the latest decrypted password
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        const stored = await LinkedInCredentials.findOne({
            where: {
                user_id: userId,
                is_active: true
            },
            attributes: ['email', 'password_encrypted', 'session_data']
        });

        if (!stored) {
            return res.status(404).json({ message: 'LinkedIn credentials not found' });
        }

        if (!stored.password_encrypted) {
            return res.status(400).json({
                message: 'Stored LinkedIn password is missing. Please re-enter your LinkedIn credentials.',
            });
        }

        let decryptedPassword;
        try {
            decryptedPassword = decrypt(stored.password_encrypted);
        } catch (err) {
            console.error('Failed to decrypt LinkedIn password for scraping payload:', err);
            return res.status(400).json({
                message: 'Unable to decrypt stored LinkedIn password. Please re-save your LinkedIn credentials.',
            });
        }

        res.json({
            email: stored.email,
            password: decryptedPassword,
            sessionData: stored.session_data,
        });
    } catch (error) {
        console.error('Get LinkedIn credentials for scraping error:', error);
        res.status(500).json({
            success: false,
            message: 'Unable to retrieve LinkedIn credentials for scraping. Please ensure your credentials are saved and try again. If the problem continues, please contact support.'
        });
    }
};
