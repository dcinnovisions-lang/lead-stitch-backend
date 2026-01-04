/**
 * Reply Detection Service
 * 
 * Handles automatic detection of email replies through multiple mechanisms:
 * 1. AWS SES receipts (if configured)
 * 2. Webhook from email providers
 * 3. Manual marking via API
 * 4. Future: IMAP/Gmail API polling
 */

const emailService = require('./emailService');
const { CampaignRecipients, EmailCampaigns } = require('../config/model');

class ReplyDetectionService {
    /**
     * Detect reply from incoming email
     * Used when receiving emails via webhook (AWS SES receipt, Gmail API, etc.)
     * 
     * @param {Object} emailData - Email data from webhook
     *   - from: sender email
     *   - to: recipient email
     *   - subject: email subject
     *   - body: email body
     *   - messageId: original message ID being replied to
     *   - inReplyTo: In-Reply-To header
     *   - references: References header
     * @returns {Promise<boolean>} - True if reply was processed
     */
    async detectReplyFromIncoming(emailData) {
        try {
            const { from, to, subject, body, messageId, inReplyTo, references } = emailData;

            if (!from || !to) {
                console.warn('⚠️ [REPLY] Missing from/to in email data');
                return false;
            }

            // FIX: Check if this is a reply BEFORE querying database (early exit optimization)
            const isReply = inReplyTo || references || this.isLikelyReply(subject, body);
            if (!isReply) {
                console.warn(`⚠️ [REPLY] Email doesn't appear to be a reply. Subject: ${subject}`);
                return false;
            }

            // Try to find the recipient by email
            const recipient = await CampaignRecipients.findOne({
                where: {
                    email: to // Find recipient who received the original email
                },
                attributes: ['id', 'campaign_id', 'email', 'status'],
                order: [['created_at', 'DESC']] // Get most recent matching recipient
            });

            if (!recipient) {
                console.warn(`⚠️ [REPLY] No recipient found for email: ${to}`);
                return false;
            }

            // FIX: Check if already replied (prevent duplicate/race condition)
            if (recipient.status === 'replied') {
                console.warn(`⚠️ [REPLY] Recipient already marked as replied: ${recipient.id}`);
                return false;
            }

            // Mark recipient as replied
            await emailService.handleReply(
                recipient.id,
                subject,
                body ? body.substring(0, 1000) : null
            );

            console.log(`💬 [REPLY] Automatic reply detected - Campaign: ${recipient.campaign_id}, Recipient: ${recipient.id}, From: ${from}`);
            return true;
        } catch (error) {
            console.error('Error detecting reply:', error);
            return false;
        }
    }

    /**
     * Heuristic check if email is likely a reply
     * Used as fallback when headers don't indicate reply
     */
    isLikelyReply(subject, body) {
        // Check subject line
        if (subject) {
            const replyPatterns = /^(Re:|FW:|Fwd:|\[REPLY\])/i;
            if (replyPatterns.test(subject)) {
                return true;
            }
        }

        // Check body for reply patterns
        if (body) {
            const replyBodyPatterns = /^(On .* wrote:|-----Original Message-----|_+Start of forwarded|thanks|appreciate|interested|following up|per|regarding)/im;
            if (replyBodyPatterns.test(body)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Process webhook from AWS SES or other email service
     * Called by webhook handler in routes/webhooks.js
     */
    async processEmailWebhook(webhookData) {
        try {
            const { source, destination, messageId, headers, body } = webhookData;

            const replyData = {
                from: source,
                to: destination?.[0],
                subject: this.extractHeader(headers, 'Subject'),
                body: body,
                messageId: messageId,
                inReplyTo: this.extractHeader(headers, 'In-Reply-To'),
                references: this.extractHeader(headers, 'References')
            };

            return await this.detectReplyFromIncoming(replyData);
        } catch (error) {
            console.error('Error processing email webhook:', error);
            return false;
        }
    }

    /**
     * Extract header value from email headers
     */
    extractHeader(headers, headerName) {
        if (!headers) return null;

        if (Array.isArray(headers)) {
            const header = headers.find(h => h.name === headerName || h.Name === headerName);
            return header?.value || header?.Value || null;
        }

        // If headers is object
        return headers[headerName] || headers[headerName.toLowerCase()] || null;
    }

    /**
     * Mark recipient as replied via manual API call
     * This is called from campaignController when user manually marks reply
     * 
     * @param {string} recipientId - Recipient ID
     * @param {string} replySubject - Subject of reply (optional)
     * @param {string} replyBody - Body of reply (optional)
     */
    async markAsReplied(recipientId, replySubject, replyBody) {
        try {
            const recipient = await CampaignRecipients.findByPk(recipientId);

            if (!recipient) {
                console.error(`❌ [REPLY] Recipient not found: ${recipientId}`);
                return false;
            }

            // Check if already replied
            if (recipient.status === 'replied') {
                console.warn(`⚠️ [REPLY] Recipient already marked as replied: ${recipientId}`);
                return false;
            }

            // Use emailService to handle the reply
            await emailService.handleReply(recipientId, replySubject, replyBody);

            console.log(`💬 [REPLY] Manual reply marked - Recipient: ${recipientId}`);
            return true;
        } catch (error) {
            console.error('Error marking as replied:', error);
            return false;
        }
    }

    /**
     * Check for replies since last check (for polling-based detection)
     * Can be used with scheduled job to poll for new replies
     * 
     * @param {string} campaignId - Campaign ID
     * @param {Date} lastCheckTime - Last time we checked for replies
     */
    async checkForNewReplies(campaignId, lastCheckTime) {
        try {
            // This would integrate with IMAP/Gmail API in future
            // For now, this is a placeholder for polling-based reply detection
            console.log(`🔍 [REPLY] Checking for new replies since ${lastCheckTime} for campaign ${campaignId}`);
            
            // TODO: Implement IMAP polling or Gmail API integration
            // - Connect to Gmail IMAP with OAuth credentials
            // - Search for new emails in sent folder's thread
            // - Detect replies in conversation thread
            
            return [];
        } catch (error) {
            console.error('Error checking for new replies:', error);
            return [];
        }
    }

    /**
     * Initialize automatic reply detection
     * Sets up webhooks and polling if configured
     */
    async initialize() {
        try {
            console.log('🚀 Initializing Reply Detection Service');
            
            // TODO: Set up scheduled job for periodic reply checks if needed
            // if (process.env.ENABLE_REPLY_POLLING === 'true') {
            //     this.startReplyPolling();
            // }

            console.log('✅ Reply Detection Service initialized');
        } catch (error) {
            console.error('Error initializing reply detection:', error);
        }
    }
}

module.exports = new ReplyDetectionService();
