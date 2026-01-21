const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const crypto = require('crypto');
const axios = require('axios');
const { decrypt } = require('../utils/encryption');
const {
    EmailSMTPCredentials,
    CampaignRecipients,
    EmailTrackingPixels,
    EmailLinkTracking,
    EmailTrackingEvents,
    EmailCampaigns,
    EmailBounces,
    EmailUnsubscribes,
    Op
} = require('../config/model');
const {
    emitRecipientUpdate,
    emitCampaignStats
} = require('../socket/socketServer');

/**
 * Email Service - Complete email sending system with nodemailer
 * Features:
 * - SMTP configuration and management
 * - Email sending with attachments
 * - HTML and plain text emails
 * - Template rendering with Handlebars
 * - Open tracking (pixel)
 * - Click tracking (link rewriting)
 * - Bounce handling
 * - Reply detection
 * - Personalization
 * - Rate limiting
 */

class EmailService {
    constructor() {
        this.transporters = new Map(); // Cache transporters per user
        this.trackingEventsHasCampaignColumn = true;
        this.registerHandlebarsAliases();
    }

    registerHandlebarsAliases() {
        if (EmailService.aliasesRegistered) {
            return;
        }

        const aliasMap = {
            First: 'firstName',
            FirstName: 'firstName',
            Last: 'lastName',
            LastName: 'lastName',
            Company: 'company',
            Organization: 'company',
            Position: 'position',
            Title: 'position',
            Email: 'email',
            Name: 'name',
            Location: 'location',
        };

        Object.entries(aliasMap).forEach(([alias, key]) => {
            handlebars.registerHelper(alias, function () {
                const context = this || {};
                const value = context[key] ?? context[alias];
                return value === undefined || value === null ? '' : value;
            });
        });

        EmailService.aliasesRegistered = true;
    }

    /**
     * Get base URL for tracking links (Production Optimized)
     * Uses APP_URL from environment, or falls back to localhost
     */
    getBaseUrl() {
        const appUrl = process.env.APP_URL;

        // Only log in development
        if (process.env.NODE_ENV !== 'production') {
            console.log('🌐 getBaseUrl() called - APP_URL from env:', appUrl);
        }

        if (!appUrl || appUrl === 'http://localhost:5000') {
            // Only warn once per service instance and only in development
            if (!this._baseUrlWarningShown && process.env.NODE_ENV !== 'production') {
                console.warn('⚠️  WARNING: APP_URL is not set or is localhost. Email tracking will only work on the server machine.');
                console.warn('⚠️  To enable tracking from external machines, set APP_URL in your .env file.');
                console.warn('⚠️  For local development, use ngrok: https://ngrok.com/');
                console.warn('⚠️  Example: APP_URL=https://your-ngrok-url.ngrok.io');
                this._baseUrlWarningShown = true;
            }
        }

        let finalUrl = appUrl || 'http://localhost:5000';

        // Ensure URL has protocol (http:// or https://)
        if (finalUrl && !finalUrl.match(/^https?:\/\//i)) {
            // If no protocol, assume https for production, http for localhost
            if (finalUrl.includes('localhost') || finalUrl.includes('127.0.0.1')) {
                finalUrl = `http://${finalUrl}`;
            } else {
                finalUrl = `https://${finalUrl}`;
            }
        }

        // Only log in development
        if (process.env.NODE_ENV !== 'production') {
            console.log('🌐 Using base URL for tracking:', finalUrl);
        }

        return finalUrl;
    }

    /**
     * Get or create SMTP transporter for a user
     */
    async getTransporter(smtpCredentialId) {
        // Check cache first
        if (this.transporters.has(smtpCredentialId)) {
            return this.transporters.get(smtpCredentialId);
        }

        // Fetch SMTP credentials from database
        const creds = await EmailSMTPCredentials.findOne({
            where: {
                id: smtpCredentialId,
                is_active: true
            }
        });

        if (!creds) {
            throw new Error('SMTP credentials not found or inactive');
        }

        // Check if OAuth tokens are available (for Outlook OAuth)
        const hasOAuth = creds.oauth_access_token_encrypted &&
            (creds.provider === 'outlook' ||
                creds.email.includes('@outlook.com') ||
                creds.email.includes('@hotmail.com') ||
                creds.email.includes('@live.com'));

        if (hasOAuth) {
            // Use OAuth-based transporter (Microsoft Graph API)
            return await this.getOAuthTransporter(creds);
        }

        // Fall back to password-based authentication
        // Decrypt password for SMTP authentication
        let password;
        const encryptedPassword = creds.password_encrypted;

        if (!encryptedPassword) {
            throw new Error('No authentication method available. Please configure either OAuth or App Password.');
        }

        // Check if it's bcrypt hash (old format) - bcrypt hashes start with $2a$, $2b$, or $2y$
        if (encryptedPassword && (encryptedPassword.startsWith('$2a$') || encryptedPassword.startsWith('$2b$') || encryptedPassword.startsWith('$2y$'))) {
            throw new Error('SMTP password is stored in old format (bcrypt). Please delete and reconfigure your SMTP credentials. Bcrypt is one-way encryption and cannot be decrypted for SMTP use.');
        }

        // Try to decrypt with AES (new format)
        try {
            password = decrypt(encryptedPassword);
        } catch (error) {
            if (error.message.includes('Invalid encrypted text format')) {
                throw new Error('SMTP password format is invalid. Please delete and reconfigure your SMTP credentials.');
            }
            throw new Error('Failed to decrypt SMTP password. Please reconfigure your SMTP credentials.');
        }

        // Determine secure setting based on port
        // Port 465 = SSL (secure: true)
        // Port 587 = STARTTLS (secure: false, requireTLS: true)
        // Port 25 = Usually STARTTLS
        let secureSetting = creds.smtp_secure;
        let requireTLS = false;

        if (creds.smtp_port === 465) {
            secureSetting = true; // SSL
            requireTLS = false;
        } else if (creds.smtp_port === 587 || creds.smtp_port === 25) {
            secureSetting = false; // STARTTLS
            requireTLS = true;
        }

        // Ensure username is correct format
        // For Gmail and Outlook, username must be the full email address
        let authUsername = creds.username;
        if ((creds.provider === 'gmail' || creds.email.includes('@gmail.com')) && !authUsername.includes('@')) {
            authUsername = creds.email; // Use email as username if username doesn't contain @
        }
        // For Outlook/Hotmail, username MUST be the full email address
        if ((creds.provider === 'outlook' || creds.email.includes('@outlook.com') || creds.email.includes('@hotmail.com') || creds.email.includes('@live.com'))) {
            authUsername = creds.email; // Always use full email as username for Outlook
        }

        // Clean password (remove any spaces that might have been added)
        // Outlook App Passwords might have spaces when copied
        let cleanPassword = password.trim().replace(/\s+/g, '');

        // Debug logging for Outlook
        if (creds.provider === 'outlook' || creds.email.includes('@outlook.com') || creds.email.includes('@hotmail.com')) {
            console.log(`🔵 Outlook SMTP Debug - Email: ${creds.email}, Username: ${authUsername}, Password length: ${cleanPassword.length}, Host: ${creds.smtp_host}, Port: ${creds.smtp_port}, Secure: ${secureSetting}, RequireTLS: ${requireTLS}`);
        }

        // Create transporter
        const transporter = nodemailer.createTransport({
            host: creds.smtp_host,
            port: creds.smtp_port,
            secure: secureSetting, // true for 465 (SSL), false for 587/25 (STARTTLS)
            requireTLS: requireTLS, // Require TLS for STARTTLS connections
            auth: {
                user: authUsername,
                pass: cleanPassword, // Decrypted and cleaned password
            },
            // Outlook-specific options
            ...(creds.provider === 'outlook' || creds.email.includes('@outlook.com') || creds.email.includes('@hotmail.com') ? {
                // Outlook may require these additional options
                connectionTimeout: 10000, // 10 seconds
                greetingTimeout: 10000,
                socketTimeout: 10000,
            } : {}),
            // Additional options for better compatibility
            tls: {
                // Do not fail on invalid certificates (useful for testing)
                rejectUnauthorized: false,
                // Use specific TLS version
                minVersion: 'TLSv1.2',
            },
            // Additional options
            pool: true, // Use connection pooling
            maxConnections: 5,
            maxMessages: 100,
            rateDelta: 1000, // 1 second
            rateLimit: 10, // 10 emails per second
        });

        // Verify connection
        try {
            await transporter.verify();
            console.log(`✅ SMTP connection verified for ${creds.email} (${creds.smtp_host}:${creds.smtp_port})`);
        } catch (error) {
            console.error(`❌ SMTP verification failed for ${creds.email}:`, error.message);
            // Provide more helpful error message
            let errorMsg = error.message;
            let helpfulHint = '';

            if (error.message.includes('wrong version number') || error.message.includes('SSL routines')) {
                errorMsg = `SSL/TLS configuration error. For port 465 use SSL (secure: true), for port 587 use STARTTLS (secure: false). Current: port ${creds.smtp_port}, secure: ${creds.smtp_secure}`;
            } else if (error.message.includes('Invalid login') || error.message.includes('Username and Password not accepted') || error.message.includes('BadCredentials')) {
                if (creds.provider === 'gmail' || creds.email.includes('@gmail.com')) {
                    errorMsg = 'Gmail authentication failed. Common issues:';
                    helpfulHint = '1) Make sure you removed ALL SPACES from your App Password (Gmail shows it with spaces like "abcd efgh ijkl mnop" but you must enter it without spaces like "abcdefghijklmnop"). 2) Ensure you\'re using the 16-character App Password (not your regular password). 3) Verify 2FA is enabled and you generated the App Password correctly. 4) Make sure your username is your full email address.';
                } else {
                    errorMsg = 'Authentication failed. Please check your username and password.';
                    helpfulHint = 'Make sure you are using the correct credentials. Some providers require App Passwords if 2FA is enabled.';
                }
            } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
                errorMsg = `Cannot connect to SMTP server ${creds.smtp_host}:${creds.smtp_port}. Please check the host and port.`;
            }

            const fullError = helpfulHint ? `${errorMsg} ${helpfulHint}` : errorMsg;
            throw new Error(fullError);
        }

        // Cache transporter
        this.transporters.set(smtpCredentialId, transporter);

        // Update last used timestamp
        await EmailSMTPCredentials.update(
            { last_used_at: new Date() },
            { where: { id: smtpCredentialId } }
        );

        return transporter;
    }

    /**
     * Get OAuth-based transporter for Outlook (uses Microsoft Graph API)
     */
    async getOAuthTransporter(creds) {
        // Check if token is expired and refresh if needed
        let accessToken = decrypt(creds.oauth_access_token_encrypted);
        const expiresAt = creds.oauth_expires_at ? new Date(creds.oauth_expires_at) : null;

        // Refresh token if expired or about to expire (within 5 minutes)
        if (expiresAt && (expiresAt.getTime() - Date.now() < 5 * 60 * 1000)) {
            try {
                accessToken = await this.refreshOutlookToken(creds);
            } catch (error) {
                console.error('Failed to refresh Outlook token:', error);
                throw new Error('Outlook OAuth token expired and refresh failed. Please reconnect your Outlook account.');
            }
        }

        // Return a special transporter object that uses Microsoft Graph API
        return {
            type: 'oauth',
            accessToken: accessToken,
            email: creds.email,
            displayName: creds.display_name,
            sendMail: async (mailOptions) => {
                return await this.sendViaMicrosoftGraph(accessToken, mailOptions);
            },
            verify: async () => {
                // Verify by checking token validity with a simple Graph API call
                try {
                    const GRAPH_API_ME = process.env.OUTLOOK_GRAPH_API_ME || 'https://graph.microsoft.com/v1.0/me';
                    await axios.get(GRAPH_API_ME, {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`
                        }
                    });
                    return true;
                } catch (error) {
                    throw new Error('OAuth token is invalid. Please reconnect your Outlook account.');
                }
            }
        };
    }

    /**
     * Refresh Outlook OAuth token
     */
    async refreshOutlookToken(creds) {
        if (!creds.oauth_refresh_token_encrypted) {
            throw new Error('No refresh token available');
        }

        const refreshToken = decrypt(creds.oauth_refresh_token_encrypted);

        const OUTLOOK_CLIENT_ID = process.env.OUTLOOK_CLIENT_ID;
        const OUTLOOK_CLIENT_SECRET = process.env.OUTLOOK_CLIENT_SECRET;
        // Use Microsoft Graph API scopes (not Outlook-specific scopes)
        // Microsoft Graph API supports short format scopes

        const OUTLOOK_SCOPES = process.env.OUTLOOK_OAUTH_SCOPES || 'Mail.Send Mail.ReadWrite User.Read offline_access';
        const MICROSOFT_TOKEN_ENDPOINT = process.env.OUTLOOK_OAUTH_TOKEN_ENDPOINT || 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

        try {
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
            const { encrypt } = require('../utils/encryption');
            const encryptedAccessToken = encrypt(access_token);
            const encryptedRefreshToken = new_refresh_token ? encrypt(new_refresh_token) : creds.oauth_refresh_token_encrypted;

            await creds.update({
                oauth_access_token_encrypted: encryptedAccessToken,
                oauth_refresh_token_encrypted: encryptedRefreshToken,
                oauth_expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
                updated_at: new Date()
            });

            return access_token;
        } catch (error) {
            console.error('Error refreshing Outlook token:', error.response?.data || error.message);
            throw new Error('Failed to refresh Outlook OAuth token. Please reconnect your account.');
        }
    }

    /**
     * Send email via Microsoft Graph API (for OAuth-based Outlook)
     */
    async sendViaMicrosoftGraph(accessToken, mailOptions) {
        // Convert nodemailer mailOptions to Microsoft Graph API format
        const message = {
            message: {
                subject: mailOptions.subject,
                body: {
                    contentType: 'HTML',
                    content: mailOptions.html || mailOptions.text
                },
                toRecipients: this.parseEmailAddresses(mailOptions.to),
                ccRecipients: mailOptions.cc ? this.parseEmailAddresses(mailOptions.cc) : [],
                bccRecipients: mailOptions.bcc ? this.parseEmailAddresses(mailOptions.bcc) : [],
            },
            saveToSentItems: true
        };

        // Add reply-to if specified
        if (mailOptions.replyTo) {
            message.message.replyTo = this.parseEmailAddresses(mailOptions.replyTo);
        }

        try {
            const GRAPH_API_SEND_MAIL = process.env.OUTLOOK_GRAPH_API_SEND_MAIL || 'https://graph.microsoft.com/v1.0/me/sendMail';
            const response = await axios.post(
                GRAPH_API_SEND_MAIL,
                message,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return {
                messageId: response.headers['x-request-id'] || `graph-${Date.now()}`,
                response: 'Email sent via Microsoft Graph API',
                accepted: [mailOptions.to].flat(),
                rejected: []
            };
        } catch (error) {
            console.error('Microsoft Graph API error:', error.response?.data || error.message);
            throw new Error(`Failed to send email via Microsoft Graph: ${error.response?.data?.error?.message || error.message}`);
        }
    }

    /**
     * Parse email addresses from various formats to Microsoft Graph format
     */
    parseEmailAddresses(addresses) {
        if (!addresses) return [];

        const addressList = Array.isArray(addresses) ? addresses : addresses.split(',').map(a => a.trim());

        return addressList.map(addr => {
            // Handle "Name <email@domain.com>" format
            const match = addr.match(/^(.+?)\s*<(.+?)>$/);
            if (match) {
                return {
                    emailAddress: {
                        name: match[1].trim(),
                        address: match[2].trim()
                    }
                };
            }
            // Handle plain email
            return {
                emailAddress: {
                    address: addr.trim()
                }
            };
        });
    }

    /**
     * Compile and render email template with Handlebars
     */
    compileTemplate(templateHtml, variables = {}) {
        try {
            const template = handlebars.compile(templateHtml);
            return template(variables);
        } catch (error) {
            console.error('Template compilation error:', error);
            throw new Error(`Template compilation failed: ${error.message}`);
        }
    }

    /**
     * Add tracking pixel to HTML email (Production-optimized)
     */
    async addTrackingPixel(html, recipientId, campaignId = null) {
        // Generate unique tracking pixel URL
        const pixelId = crypto.randomUUID();
        const baseUrl = this.getBaseUrl();
        const pixelUrl = `${baseUrl}/api/email/track/pixel/${pixelId}`;

        // Only log in development
        if (process.env.NODE_ENV !== 'production') {
            console.log('🔍 Tracking pixel URL generated:', {
                baseUrl,
                pixelUrl,
                recipientId,
                campaignId
            });
        }

        // Get campaign_id if not provided
        if (!campaignId && recipientId) {
            const recipient = await CampaignRecipients.findByPk(recipientId, {
                attributes: ['campaign_id']
            });
            if (recipient) {
                campaignId = recipient.campaign_id;
            }
        }

        // Insert tracking pixel record
        try {
            await EmailTrackingPixels.create({
                id: pixelId,
                recipient_id: recipientId,
                campaign_id: campaignId,
                pixel_url: pixelUrl
            });
        } catch (error) {
            // If campaign_id column doesn't exist, insert without it
            if (error.message.includes('campaign_id') || error.name === 'SequelizeDatabaseError') {
                await EmailTrackingPixels.create({
                    id: pixelId,
                    recipient_id: recipientId,
                    pixel_url: pixelUrl
                });
            } else {
                throw error;
            }
        }

        // Production-optimized tracking pixel
        // Single pixel with maximum compatibility across email clients
        const trackingPixel = `
      <!-- Email Open Tracking Pixel -->
      <img src="${pixelUrl}" width="1" height="1" style="display:block; width:1px; height:1px; border:0; margin:0; padding:0;" alt="" />
    `;

        // Insert before closing body tag, or at the end if no body tag
        if (html.includes('</body>')) {
            return html.replace('</body>', `${trackingPixel}</body>`);
        } else {
            return html + trackingPixel;
        }
    }

    /**
     * Rewrite links in HTML for click tracking
     */
    async rewriteLinksForTracking(html, recipientId, campaignId = null) {
        // Regular expression to find all href links
        const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["']/gi;
        const linkMatches = [];
        let match;

        // Find all links first
        while ((match = linkRegex.exec(html)) !== null) {
            linkMatches.push({
                fullMatch: match[0],
                url: match[1],
                index: match.index,
            });
        }

        // Get campaign_id if not provided
        if (!campaignId && recipientId) {
            const recipient = await CampaignRecipients.findByPk(recipientId, {
                attributes: ['campaign_id']
            });
            if (recipient) {
                campaignId = recipient.campaign_id;
            }
        }

        // Process all links and create tracking URLs
        const linkPromises = linkMatches.map(async (linkMatch) => {
            const { url } = linkMatch;

            // Skip mailto: and tel: links
            if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('#')) {
                return { ...linkMatch, trackedUrl: url };
            }

            // Generate tracked URL
            const linkId = crypto.randomUUID();
            const baseUrl = this.getBaseUrl();
            const trackedUrl = `${baseUrl}/api/email/track/link/${linkId}`;

            console.log('🔗 Tracking link URL generated:', {
                baseUrl,
                trackedUrl,
                originalUrl: url,
                recipientId,
                campaignId
            });

            // Store original URL mapping
            try {
                await EmailLinkTracking.create({
                    id: linkId,
                    recipient_id: recipientId,
                    campaign_id: campaignId,
                    original_url: url,
                    tracked_url: trackedUrl
                });
            } catch (error) {
                // If campaign_id column doesn't exist, insert without it
                if (error.message.includes('campaign_id') || error.name === 'SequelizeDatabaseError') {
                    await EmailLinkTracking.create({
                        id: linkId,
                        recipient_id: recipientId,
                        original_url: url,
                        tracked_url: trackedUrl
                    });
                } else {
                    throw error;
                }
            }

            return { ...linkMatch, trackedUrl };
        });

        const processedLinks = await Promise.all(linkPromises);

        // Replace links in reverse order to maintain indices
        let trackedHtml = html;
        for (let i = processedLinks.length - 1; i >= 0; i--) {
            const link = processedLinks[i];
            if (link.trackedUrl !== link.url) {
                trackedHtml =
                    trackedHtml.substring(0, link.index) +
                    link.fullMatch.replace(link.url, link.trackedUrl) +
                    trackedHtml.substring(link.index + link.fullMatch.length);
            }
        }

        return trackedHtml;
    }

    /**
     * Send email via OAuth (Microsoft Graph API)
     */
    async sendEmailViaOAuth(transporter, {
        smtpCredentialId,
        to,
        subject,
        html,
        text,
        fromName,
        fromEmail,
        replyTo,
        cc = [],
        bcc = [],
        attachments = [],
        recipientId = null,
        campaignId = null,
        personalization = {},
    }) {
        try {
            // Get SMTP credentials for from email
            const creds = await EmailSMTPCredentials.findByPk(smtpCredentialId, {
                attributes: ['email', 'display_name']
            });

            // Prepare email content
            let finalHtml = html || '';
            let finalText = text || '';

            // Personalize content if variables provided
            if (Object.keys(personalization).length > 0) {
                finalHtml = this.compileTemplate(finalHtml, personalization);
                if (finalText) {
                    finalText = this.compileTemplate(finalText, personalization);
                }
            }

            // Add tracking pixel if recipientId provided
            if (recipientId && finalHtml) {
                finalHtml = await this.addTrackingPixel(finalHtml, recipientId, campaignId);
            }

            // Rewrite links for click tracking if recipientId provided
            if (recipientId && finalHtml) {
                finalHtml = await this.rewriteLinksForTracking(finalHtml, recipientId, campaignId);
            }

            // Prepare unsubscribe URL
            const baseUrl = this.getBaseUrl();
            const unsubscribeUrl = recipientId
                ? `${baseUrl}/api/email/unsubscribe?recipientId=${recipientId}`
                : `${baseUrl}/api/email/unsubscribe?email=${encodeURIComponent(to)}`;

            // Ensure we have a plain text version
            const plainText = finalText || this.stripHtml(finalHtml);

            // Prepare mail options for Microsoft Graph API
            const mailOptions = {
                from: fromName
                    ? `"${fromName}" <${creds.email}>`
                    : creds.display_name
                        ? `"${creds.display_name}" <${creds.email}>`
                        : creds.email,
                to: Array.isArray(to) ? to.join(', ') : to,
                subject: this.compileTemplate(subject, personalization),
                html: finalHtml,
                text: plainText,
                replyTo: replyTo || creds.email,
                cc: cc.length > 0 ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined,
                bcc: bcc.length > 0 ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : undefined,
            };

            // Send via Microsoft Graph API
            const info = await transporter.sendMail(mailOptions);

            // Log tracking event
            if (recipientId) {
                await this.logTrackingEvent({
                    campaignId,
                    recipientId,
                    eventType: 'sent',
                    eventData: {
                        messageId: info.messageId,
                        response: info.response,
                        accepted: info.accepted,
                        rejected: info.rejected,
                    },
                });
            }

            return {
                success: true,
                messageId: info.messageId,
                response: info.response,
                accepted: info.accepted,
                rejected: info.rejected,
            };
        } catch (error) {
            console.error('OAuth email sending error:', error);

            // Log failure event
            if (recipientId) {
                await this.logTrackingEvent({
                    campaignId,
                    recipientId,
                    eventType: 'failed',
                    eventData: {
                        error: error.message,
                        code: error.code,
                    },
                });
            }

            throw error;
        }
    }

    /**
     * Send a single email
     */
    async sendEmail({
        smtpCredentialId,
        to,
        subject,
        html,
        text,
        fromName,
        fromEmail,
        replyTo,
        cc = [],
        bcc = [],
        attachments = [],
        recipientId = null, // For tracking
        campaignId = null, // For tracking
        personalization = {},
    }) {
        try {
            // Get transporter (could be OAuth or SMTP)
            const transporter = await this.getTransporter(smtpCredentialId);

            // Check if it's OAuth-based transporter
            if (transporter.type === 'oauth') {
                return await this.sendEmailViaOAuth(transporter, {
                    smtpCredentialId,
                    to,
                    subject,
                    html,
                    text,
                    fromName,
                    fromEmail,
                    replyTo,
                    cc,
                    bcc,
                    attachments,
                    recipientId,
                    campaignId,
                    personalization,
                });
            }

            // Continue with regular SMTP sending...

            // Get SMTP credentials for from email
            const creds = await EmailSMTPCredentials.findByPk(smtpCredentialId, {
                attributes: ['email', 'display_name', 'username']
            });

            // Ensure fromEmail matches SMTP account (required for relay)
            // Use SMTP account email if fromEmail doesn't match
            const finalFromEmail = fromEmail && fromEmail === creds.email
                ? fromEmail
                : creds.email; // Always use SMTP account email to avoid relay errors

            // Prepare email content
            let finalHtml = html || '';
            let finalText = text || '';

            // Personalize content if variables provided
            if (Object.keys(personalization).length > 0) {
                finalHtml = this.compileTemplate(finalHtml, personalization);
                if (finalText) {
                    finalText = this.compileTemplate(finalText, personalization);
                }
            }

            // Add tracking pixel if recipientId provided
            if (recipientId && finalHtml) {
                finalHtml = await this.addTrackingPixel(finalHtml, recipientId, campaignId);
            }

            // Rewrite links for click tracking if recipientId provided
            if (recipientId && finalHtml) {
                finalHtml = await this.rewriteLinksForTracking(finalHtml, recipientId, campaignId);
            }

            // Prepare unsubscribe URL
            const baseUrl = this.getBaseUrl();
            const unsubscribeUrl = recipientId
                ? `${baseUrl}/api/email/unsubscribe?recipientId=${recipientId}`
                : `${baseUrl}/api/email/unsubscribe?email=${encodeURIComponent(to)}`;

            // Ensure we have a plain text version
            const plainText = finalText || this.stripHtml(finalHtml);

            // Prepare email options (production-ready)
            // CRITICAL: from email MUST match SMTP account email to avoid relay errors
            const mailOptions = {
                from: fromName
                    ? `"${fromName}" <${finalFromEmail}>`
                    : creds.display_name
                        ? `"${creds.display_name}" <${finalFromEmail}>`
                        : finalFromEmail,
                to: Array.isArray(to) ? to.join(', ') : to,
                subject: this.compileTemplate(subject, personalization),
                html: finalHtml,
                text: plainText,
                replyTo: replyTo || creds.email,
                cc: cc.length > 0 ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined,
                bcc: bcc.length > 0 ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : undefined,
                attachments: attachments.map(att => ({
                    filename: att.filename,
                    path: att.path,
                    cid: att.cid, // For inline images
                    content: att.content,
                    contentType: att.contentType,
                })),
                // Headers for tracking and deliverability
                headers: {
                    'X-Campaign-ID': campaignId || '',
                    'X-Recipient-ID': recipientId || '',
                    'List-Unsubscribe': `<${unsubscribeUrl}>`,
                    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                    'Precedence': 'bulk',
                    'X-Mailer': 'Lead Stitch Email Campaign',
                    'Message-ID': `<${Date.now()}-${Math.random().toString(36).substring(7)}@${creds.email.split('@')[1] || 'leadstitch.com'}>`,
                },
                // Priority settings
                priority: 'normal',
                // Encoding
                encoding: 'utf8',
            };

            // Log email details for debugging
            console.log('📧 Email details:', {
                from: mailOptions.from,
                to: mailOptions.to,
                subject: mailOptions.subject.substring(0, 50),
                htmlLength: finalHtml.length,
                textLength: plainText.length,
                hasTrackingPixel: finalHtml.includes('track/pixel'),
                hasTrackedLinks: finalHtml.includes('track/link'),
            });

            // Send email
            const info = await transporter.sendMail(mailOptions);

            // Log detailed response
            console.log('📧 Email send response:', {
                messageId: info.messageId,
                response: info.response,
                accepted: info.accepted,
                rejected: info.rejected,
                pending: info.pending,
                responseCode: info.responseCode,
            });

            // Log tracking event
            if (recipientId) {
                await this.logTrackingEvent({
                    campaignId,
                    recipientId,
                    eventType: 'sent',
                    eventData: {
                        messageId: info.messageId,
                        response: info.response,
                        accepted: info.accepted,
                        rejected: info.rejected,
                    },
                });
            }

            // Check if email was actually accepted
            if (info.rejected && info.rejected.length > 0) {
                console.warn('⚠️ Email was rejected:', info.rejected);
                throw new Error(`Email rejected: ${info.rejected.join(', ')}`);
            }

            if (!info.accepted || info.accepted.length === 0) {
                console.warn('⚠️ Email was not accepted by SMTP server');
                throw new Error('Email was not accepted by SMTP server');
            }

            return {
                success: true,
                messageId: info.messageId,
                response: info.response,
                accepted: info.accepted,
                rejected: info.rejected,
            };
        } catch (error) {
            console.error('Email sending error:', error);

            // Log failure event
            if (recipientId) {
                await this.logTrackingEvent({
                    campaignId,
                    recipientId,
                    eventType: 'failed',
                    eventData: {
                        error: error.message,
                        code: error.code,
                    },
                });
            }

            throw error;
        }
    }

    /**
     * Send bulk emails (with rate limiting)
     */
    async sendBulkEmails({
        smtpCredentialId,
        recipients, // Array of { to, subject, html, text, personalization, recipientId }
        campaignId,
        rateLimit = 10, // Emails per second
        batchSize = 50, // Emails per batch
    }) {
        const results = {
            total: recipients.length,
            sent: 0,
            failed: 0,
            errors: [],
        };

        // Process in batches
        for (let i = 0; i < recipients.length; i += batchSize) {
            const batch = recipients.slice(i, i + batchSize);

            // Process batch with rate limiting
            const batchPromises = batch.map((recipient, index) => {
                return new Promise((resolve) => {
                    setTimeout(async () => {
                        try {
                            const result = await this.sendEmail({
                                smtpCredentialId,
                                to: recipient.to,
                                subject: recipient.subject,
                                html: recipient.html,
                                text: recipient.text,
                                recipientId: recipient.recipientId,
                                campaignId,
                                personalization: recipient.personalization || {},
                            });

                            results.sent++;
                            resolve({ success: true, recipient: recipient.to, result });
                        } catch (error) {
                            results.failed++;
                            results.errors.push({
                                recipient: recipient.to,
                                error: error.message,
                            });
                            resolve({ success: false, recipient: recipient.to, error: error.message });
                        }
                    }, (index * 1000) / rateLimit); // Rate limit delay
                });
            });

            await Promise.all(batchPromises);
        }

        return results;
    }

    /**
     * Log tracking event
     */
    async logTrackingEvent({ campaignId, recipientId, eventType, eventData = {} }) {
        const eventJson = JSON.stringify(eventData);
        let inserted = false;

        try {
            // The recipientId is the campaign_recipients.id (campaign_recipient_id)
            // We need to provide all required fields: campaign_recipient_id, campaign_id, and recipient_id
            // For email_tracking_events, recipient_id and campaign_recipient_id are the same (both refer to campaign_recipients.id)
            await EmailTrackingEvents.create({
                campaign_recipient_id: recipientId,
                campaign_id: campaignId,
                recipient_id: recipientId,
                event_type: eventType,
                event_data: eventData
            });
            inserted = true;
        } catch (error) {
            // Handle case where schema might be different (legacy support)
            if (error.name === 'SequelizeDatabaseError') {
                if (error.message.includes('campaign_recipient_id')) {
                    // Try with just campaign_id and recipient_id (older schema)
                    try {
                        await EmailTrackingEvents.create({
                            campaign_id: campaignId,
                            recipient_id: recipientId,
                            event_type: eventType,
                            event_data: eventData
                        });
                        inserted = true;
                    } catch (fallbackError) {
                        console.error('Error logging tracking event (fallback insert failed):', fallbackError);
                    }
                } else if (error.message.includes('campaign_id')) {
                    // Try with just campaign_recipient_id (older schema)
                    try {
                        await EmailTrackingEvents.create({
                            campaign_recipient_id: recipientId,
                            event_type: eventType,
                            event_data: { ...eventData, campaignId }
                        });
                        inserted = true;
                    } catch (fallbackError) {
                        console.error('Error logging tracking event (legacy schema insert failed):', fallbackError);
                    }
                } else {
                    console.error('Error logging tracking event:', error);
                }
            } else {
                console.error('Error logging tracking event:', error);
            }
        }

        if (!inserted) {
            return;
        }

        // Update recipient status in campaign_recipients
        const statusMap = {
            sent: 'sent',
            delivered: 'delivered',
            opened: 'opened',
            clicked: 'clicked',
            bounced: 'bounced',
            replied: 'replied',
            unsubscribed: 'unsubscribed',
            failed: 'failed',
        };

        if (statusMap[eventType]) {
            const updateFields = [];
            const updateValues = [];
            let paramCount = 1;

            if (eventType === 'sent') {
                updateFields.push(`sent_at = CURRENT_TIMESTAMP`);
            }
            if (eventType === 'delivered') {
                updateFields.push(`delivered_at = CURRENT_TIMESTAMP`);
            }
            if (eventType === 'opened') {
                updateFields.push(`opened_at = CURRENT_TIMESTAMP`);
            }
            if (eventType === 'clicked') {
                updateFields.push(`clicked_at = CURRENT_TIMESTAMP`);
            }
            if (eventType === 'bounced') {
                updateFields.push(`bounced_at = CURRENT_TIMESTAMP`);
            }
            if (eventType === 'replied') {
                updateFields.push(`replied_at = CURRENT_TIMESTAMP`);
            }

            // Build update object
            const updateData = {
                status: statusMap[eventType]
            };

            if (eventType === 'sent') {
                updateData.sent_at = new Date();
            }
            if (eventType === 'delivered') {
                updateData.delivered_at = new Date();
            }
            if (eventType === 'opened') {
                updateData.opened_at = new Date();
            }
            if (eventType === 'clicked') {
                updateData.clicked_at = new Date();
            }
            if (eventType === 'bounced') {
                updateData.bounced_at = new Date();
            }
            if (eventType === 'replied') {
                updateData.replied_at = new Date();
            }

            await CampaignRecipients.update(updateData, {
                where: { id: recipientId }
            });
        }
    }

    /**
     * Update recipient status (standalone method)
     * Used to update recipient status without logging a tracking event
     */
    async updateRecipientStatus(recipientId, status) {
        try {
            const statusMap = {
                sent: 'sent',
                delivered: 'delivered',
                opened: 'opened',
                clicked: 'clicked',
                bounced: 'bounced',
                replied: 'replied',
                unsubscribed: 'unsubscribed',
                failed: 'failed',
            };

            if (!statusMap[status]) {
                console.warn(`Invalid status: ${status}. Allowed statuses: ${Object.keys(statusMap).join(', ')}`);
                return;
            }

            const now = new Date();
            const updateData = {
                status: statusMap[status]
            };

            // Set timestamps based on status
            if (status === 'sent') {
                updateData.sent_at = now;
            } else if (status === 'delivered') {
                updateData.delivered_at = now;
            } else if (status === 'opened') {
                updateData.opened_at = now;
            } else if (status === 'clicked') {
                updateData.clicked_at = now;
            } else if (status === 'bounced') {
                updateData.bounced_at = now;
            } else if (status === 'replied') {
                updateData.replied_at = now;
            }

            await CampaignRecipients.update(updateData, {
                where: { id: recipientId }
            });

            // Get campaign_id for stats update
            const recipient = await CampaignRecipients.findByPk(recipientId, {
                attributes: ['campaign_id']
            });

            if (recipient && recipient.campaign_id) {
                // Get updated stats
                const stats = await this.getCampaignStats(recipient.campaign_id);

                // Emit updated stats for real-time updates
                emitCampaignStats(recipient.campaign_id, stats);
            }

        } catch (error) {
            console.error('Error updating recipient status:', error);
            throw error;
        }
    }

    /**
     * Track email open (called when pixel is loaded) - Production Optimized
     */
    async trackEmailOpen(pixelId, ipAddress, userAgent) {
        try {
            const pixel = await EmailTrackingPixels.findByPk(pixelId, {
                attributes: ['id', 'recipient_id', 'campaign_id', 'opened_at', 'opened_count', 'ip_address', 'user_agent']
            });

            if (!pixel) {
                if (process.env.NODE_ENV !== 'production') {
                    console.error('Tracking pixel not found:', pixelId);
                }
                return;
            }

            const isFirstOpen = !pixel.opened_at;
            const now = new Date();

            const updateData = {
                is_opened: true,
                opened_count: (pixel.opened_count || 0) + 1
            };

            // Only set first open timestamp and metadata on first open
            if (isFirstOpen) {
                updateData.opened_at = now;
                updateData.ip_address = ipAddress;
                updateData.user_agent = userAgent;
            }

            // Batch update pixel and recipient status
            const { recipient_id, campaign_id } = pixel;

            // Update pixel and recipient in parallel for better performance
            await Promise.all([
                EmailTrackingPixels.update(updateData, {
                    where: { id: pixelId }
                }),
                // Only update recipient status if first open
                isFirstOpen ? this.updateRecipientStatus(recipient_id, 'opened') : Promise.resolve()
            ]);

            // Log tracking event
            await this.logTrackingEvent({
                campaignId: campaign_id,
                recipientId: recipient_id,
                eventType: 'opened',
                eventData: {
                    ipAddress,
                    userAgent,
                    timestamp: new Date().toISOString(),
                },
            });

            // Only update campaign stats and emit events if first open
            if (isFirstOpen && campaign_id) {
                console.log(`👁️ [TRACKING] Email opened - Campaign: ${campaign_id}, Recipient: ${recipient_id}`);

                // Optimize: Get stats once and use for both update and emit
                const stats = await this.getCampaignStats(campaign_id);

                // Update campaign opened count
                await EmailCampaigns.update(
                    { opened_count: stats.opened },
                    { where: { id: campaign_id } }
                );

                // Emit real-time updates
                console.log(`📡 [REALTIME] Triggering real-time update for email open - Campaign: ${campaign_id}, Recipient: ${recipient_id}`);
                emitRecipientUpdate(campaign_id, recipient_id, 'opened', {
                    timestamp: now.toISOString()
                });

                // Emit updated stats
                emitCampaignStats(campaign_id, stats);
            } else if (!isFirstOpen) {
                console.log(`👁️ [TRACKING] Email opened again (not first time) - Campaign: ${campaign_id}, Recipient: ${recipient_id}, Count: ${updateData.opened_count}`);
            }
        } catch (error) {
            console.error('Error tracking email open:', error);
        }
    }

    /**
     * Track link click (called when tracked link is clicked)
     */
    async trackLinkClick(linkId, ipAddress, userAgent) {
        try {
            const link = await EmailLinkTracking.findByPk(linkId);

            if (!link) {
                console.error('Tracking link not found:', linkId);
                return null;
            }

            const updateData = {
                click_count: (link.click_count || 0) + 1,
                last_clicked_at: new Date()
            };

            if (!link.first_clicked_at) {
                updateData.first_clicked_at = new Date();
            }

            await EmailLinkTracking.update(updateData, {
                where: { id: linkId }
            });

            const { recipient_id, original_url, campaign_id } = link;

            // Update recipient status (only if not already clicked)
            await this.updateRecipientStatus(recipient_id, 'clicked');

            // Log tracking event
            await this.logTrackingEvent({
                campaignId: campaign_id,
                recipientId: recipient_id,
                eventType: 'clicked',
                eventData: {
                    url: original_url,
                    ipAddress,
                    userAgent,
                    timestamp: new Date().toISOString(),
                },
            });

            // Check if this is first click
            const recipient = await CampaignRecipients.findByPk(recipient_id, {
                attributes: ['clicked_at']
            });
            const isFirstClick = !recipient?.clicked_at;

            // Only update campaign stats and emit events if first click
            if (isFirstClick && campaign_id) {
                console.log(`🔗 [TRACKING] Link clicked - Campaign: ${campaign_id}, Recipient: ${recipient_id}, URL: ${original_url.substring(0, 50)}...`);

                // Optimize: Get stats once and use for both update and emit
                const stats = await this.getCampaignStats(campaign_id);

                // Update campaign clicked count
                await EmailCampaigns.update(
                    { clicked_count: stats.clicked },
                    { where: { id: campaign_id } }
                );

                // Emit real-time update
                console.log(`📡 [REALTIME] Triggering real-time update for link click - Campaign: ${campaign_id}, Recipient: ${recipient_id}`);
                emitRecipientUpdate(campaign_id, recipient_id, 'clicked', {
                    link: original_url,
                    timestamp: new Date().toISOString()
                });

                // Emit updated stats
                emitCampaignStats(campaign_id, stats);
            } else if (!isFirstClick) {
                console.log(`🔗 [TRACKING] Link clicked again (not first time) - Campaign: ${campaign_id}, Recipient: ${recipient_id}, Count: ${updateData.click_count}`);
            }

            return original_url;
        } catch (error) {
            console.error('Error tracking link click:', error);
        }
        return null;
    }

    /**
     * Handle email bounce
     */
    async handleBounce(recipientId, bounceType, bounceReason, bounceCode) {
        try {
            // Get recipient info
            const recipient = await CampaignRecipients.findByPk(recipientId, {
                attributes: ['email', 'campaign_id']
            });

            if (!recipient) return;

            const { email, campaign_id } = recipient;

            // Update recipient status
            await this.updateRecipientStatus(recipientId, 'bounced');

            // Insert bounce record (if table exists)
            try {
                await EmailBounces.findOrCreate({
                    where: { recipient_id: recipientId },
                    defaults: {
                        recipient_id: recipientId,
                        email: email,
                        bounce_type: bounceType,
                        bounce_reason: bounceReason,
                        bounce_code: bounceCode,
                        bounced_at: new Date()
                    }
                });
            } catch (err) {
                // Table might not exist, that's okay
                console.log('email_bounces table not found, skipping bounce record insert');
            }

            // Log tracking event
            await this.logTrackingEvent({
                campaignId: campaign_id,
                recipientId,
                eventType: 'bounced',
                eventData: {
                    bounceType,
                    bounceReason,
                    bounceCode,
                },
            });

            // Update campaign stats
            const bouncedCount = await CampaignRecipients.count({
                where: {
                    campaign_id: campaign_id,
                    status: 'bounced'
                }
            });

            await EmailCampaigns.update(
                { bounced_count: bouncedCount },
                { where: { id: campaign_id } }
            );

            // Emit real-time updates
            console.log(`📬 [TRACKING] Email bounced - Campaign: ${campaign_id}, Recipient: ${recipientId}, Type: ${bounceType}`);
            console.log(`📡 [REALTIME] Triggering real-time update for bounce - Campaign: ${campaign_id}, Recipient: ${recipientId}`);
            emitRecipientUpdate(campaign_id, recipientId, 'bounced', {
                bounceType,
                bounceReason,
                timestamp: new Date().toISOString()
            });

            // Get updated stats and emit
            const stats = await this.getCampaignStats(campaign_id);
            emitCampaignStats(campaign_id, stats);
        } catch (error) {
            console.error('Error handling bounce:', error);
        }
    }

    /**
     * Handle unsubscribe
     */
    async handleUnsubscribe(email, recipientId = null) {
        try {
            let campaign_id = null;

            // If recipientId provided, get campaign_id from it
            if (recipientId) {
                const recipient = await CampaignRecipients.findByPk(recipientId, {
                    attributes: ['campaign_id']
                });
                if (recipient) {
                    campaign_id = recipient.campaign_id;
                }
            } else if (email) {
                // Find most recent recipient for this email
                const recipient = await CampaignRecipients.findOne({
                    where: { email: email },
                    order: [['created_at', 'DESC']],
                    attributes: ['id', 'campaign_id']
                });
                if (recipient) {
                    recipientId = recipient.id;
                    campaign_id = recipient.campaign_id;
                }
            }

            if (recipientId) {
                // Update recipient status
                await this.updateRecipientStatus(recipientId, 'unsubscribed');

                // Log tracking event
                if (campaign_id) {
                    await this.logTrackingEvent({
                        campaignId: campaign_id,
                        recipientId,
                        eventType: 'unsubscribed',
                        eventData: {
                            email,
                            timestamp: new Date().toISOString(),
                        },
                    });

                    // Update campaign stats
                    const unsubscribedCount = await CampaignRecipients.count({
                        where: {
                            campaign_id: campaign_id,
                            status: 'unsubscribed'
                        }
                    });

                    await EmailCampaigns.update(
                        { unsubscribed_count: unsubscribedCount },
                        { where: { id: campaign_id } }
                    );
                }
            }

            // Also add to global unsubscribe list (if table exists)
            try {
                await EmailUnsubscribes.findOrCreate({
                    where: { email: email },
                    defaults: {
                        user_id: null, // Will need to be set if available
                        email: email,
                        unsubscribed_at: new Date()
                    }
                });
            } catch (err) {
                // Table might not exist, that's okay
                console.log('email_unsubscribes table not found, skipping global unsubscribe');
            }

            return { success: true, message: 'Successfully unsubscribed' };
        } catch (error) {
            console.error('Error handling unsubscribe:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Handle email reply
     */
    async handleReply(recipientId, replySubject = null, replyBody = null) {
        try {
            const recipient = await CampaignRecipients.findByPk(recipientId, {
                attributes: ['email', 'campaign_id']
            });

            if (!recipient) return;

            const { email, campaign_id } = recipient;

            // Update recipient status
            await this.updateRecipientStatus(recipientId, 'replied');

            // Log tracking event
            await this.logTrackingEvent({
                campaignId: campaign_id,
                recipientId,
                eventType: 'replied',
                eventData: {
                    email,
                    replySubject,
                    replyBody: replyBody ? replyBody.substring(0, 500) : null, // Limit body length
                    timestamp: new Date().toISOString(),
                },
            });

            // Update campaign stats
            const repliedCount = await CampaignRecipients.count({
                where: {
                    campaign_id: campaign_id,
                    status: 'replied'
                }
            });

            await EmailCampaigns.update(
                { replied_count: repliedCount },
                { where: { id: campaign_id } }
            );

            // Emit real-time updates
            console.log(`💬 [TRACKING] Email replied - Campaign: ${campaign_id}, Recipient: ${recipientId}, Subject: ${replySubject || 'N/A'}`);
            console.log(`📡 [REALTIME] Triggering real-time update for reply - Campaign: ${campaign_id}, Recipient: ${recipientId}`);
            emitRecipientUpdate(campaign_id, recipientId, 'replied', {
                replySubject,
                timestamp: new Date().toISOString()
            });

            // Get updated stats and emit
            const stats = await this.getCampaignStats(campaign_id);
            emitCampaignStats(campaign_id, stats);
        } catch (error) {
            console.error('Error handling reply:', error);
        }
    }

    /**
     * Strip HTML tags to create plain text version
     */
    stripHtml(html) {
        if (!html) return '';
        let text = html
            .replace(/<style[^>]*>.*?<\/style>/gi, '')
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/<img[^>]*>/gi, '[Image]')
            .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '$2 ($1)')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<\/h[1-6]>/gi, '\n\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&apos;/g, "'")
            .replace(/&mdash;/g, '—')
            .replace(/&ndash;/g, '–')
            .replace(/&hellip;/g, '...')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        // Ensure minimum content
        if (text.length < 10) {
            text = 'Please view this email in an HTML-enabled email client.';
        }

        return text;
    }

    /**
     * Test SMTP connection
     */
    async testSMTPConnection(smtpCredentialId) {
        try {
            const transporter = await this.getTransporter(smtpCredentialId);

            // For OAuth transporters, use the verify method
            if (transporter.type === 'oauth') {
                await transporter.verify();
                return { success: true, message: 'OAuth connection verified successfully' };
            }

            // For regular SMTP
            await transporter.verify();
            return { success: true, message: 'SMTP connection successful' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * Helper function to get campaign statistics (Production Optimized)
     * Uses efficient SQL aggregation for better performance
     */
    async getCampaignStats(campaignId) {
        try {
            // Optimized query - single aggregation query
            const [stats] = await CampaignRecipients.findAll({
                where: { campaign_id: campaignId },
                attributes: [
                    [CampaignRecipients.sequelize.fn('COUNT', CampaignRecipients.sequelize.col('id')), 'total'],
                    [
                        CampaignRecipients.sequelize.fn(
                            'COUNT',
                            CampaignRecipients.sequelize.literal("CASE WHEN status = 'sent' OR sent_at IS NOT NULL OR status = 'delivered' OR delivered_at IS NOT NULL OR status = 'opened' OR opened_at IS NOT NULL OR status = 'clicked' OR clicked_at IS NOT NULL OR status = 'replied' OR replied_at IS NOT NULL THEN 1 END")
                        ),
                        'sent'
                    ],
                    [
                        CampaignRecipients.sequelize.fn(
                            'COUNT',
                            CampaignRecipients.sequelize.literal("CASE WHEN delivered_at IS NOT NULL OR status = 'delivered' THEN 1 END")
                        ),
                        'delivered'
                    ],
                    [
                        CampaignRecipients.sequelize.fn(
                            'COUNT',
                            CampaignRecipients.sequelize.literal("CASE WHEN opened_at IS NOT NULL OR status = 'opened' THEN 1 END")
                        ),
                        'opened'
                    ],
                    [
                        CampaignRecipients.sequelize.fn(
                            'COUNT',
                            CampaignRecipients.sequelize.literal("CASE WHEN clicked_at IS NOT NULL OR status = 'clicked' THEN 1 END")
                        ),
                        'clicked'
                    ],
                    [
                        CampaignRecipients.sequelize.fn(
                            'COUNT',
                            CampaignRecipients.sequelize.literal("CASE WHEN replied_at IS NOT NULL OR status = 'replied' THEN 1 END")
                        ),
                        'replied'
                    ],
                    [
                        CampaignRecipients.sequelize.fn(
                            'COUNT',
                            CampaignRecipients.sequelize.literal("CASE WHEN bounced_at IS NOT NULL OR status = 'bounced' THEN 1 END")
                        ),
                        'bounced'
                    ],
                    [
                        CampaignRecipients.sequelize.fn(
                            'COUNT',
                            CampaignRecipients.sequelize.literal("CASE WHEN status = 'failed' OR error_message IS NOT NULL THEN 1 END")
                        ),
                        'failed'
                    ]
                ],
                raw: true
            });

            return {
                total: parseInt(stats?.total || 0),
                sent: parseInt(stats?.sent || 0),
                delivered: parseInt(stats?.delivered || 0),
                opened: parseInt(stats?.opened || 0),
                clicked: parseInt(stats?.clicked || 0),
                replied: parseInt(stats?.replied || 0),
                bounced: parseInt(stats?.bounced || 0),
                failed: parseInt(stats?.failed || 0)
            };
        } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
                console.error('Error getting campaign stats:', error);
            }
            return {
                total: 0,
                sent: 0,
                delivered: 0,
                opened: 0,
                clicked: 0,
                replied: 0,
                bounced: 0,
                failed: 0
            };
        }
    }

    /**
     * Send test email
     */
    async sendTestEmail(smtpCredentialId, toEmail) {
        try {
            const result = await this.sendEmail({
                smtpCredentialId,
                to: toEmail,
                subject: 'Test Email from Lead Stitch',
                html: `
                    <html>
                        <body>
                        <h2>Test Email</h2>
                        <p>This is a test email from Lead Stitch platform.</p>
                        <p>If you received this email, your SMTP configuration is working correctly!</p>
                        <hr>
                        <p style="color: #666; font-size: 12px;">Sent at: ${new Date().toLocaleString()}</p>
                        </body>
                    </html>
                `,
                text: 'This is a test email from Lead Stitch platform. If you received this email, your SMTP configuration is working correctly!',
            });

            return { success: true, message: 'Test email sent successfully', result };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }
}

EmailService.aliasesRegistered = false;

module.exports = new EmailService();

