/**
 * AWS SES Service - Industry-standard email tracking via webhooks
 * 
 * This service handles AWS SES webhooks for:
 * - Delivery notifications
 * - Bounce tracking
 * - Complaint tracking (spam reports)
 * - Open tracking (via SES event publishing)
 * - Click tracking (via SES event publishing)
 * 
 * Setup:
 * 1. Configure AWS SES with SNS topics
 * 2. Set up webhook endpoints
 * 3. Subscribe SNS topics to webhook endpoints
 */

const crypto = require('crypto');
const {
    EmailTrackingEvents,
    CampaignRecipients,
    EmailCampaigns,
    Op
} = require('../config/model');

class AwsSesService {
    /**
     * Verify SNS message signature
     */
    verifySnsSignature(message, signature) {
        // TODO: Implement SNS signature verification
        // For now, we'll trust the message (in production, always verify)
        return true;
    }

    /**
     * Handle SNS notification (delivery, bounce, complaint)
     */
    async handleSnsNotification(snsMessage) {
        try {
            const message = JSON.parse(snsMessage.Message);
            const notificationType = snsMessage.Type;

            if (notificationType === 'Notification') {
                // Handle SES event
                const eventType = message.eventType; // delivery, bounce, complaint, open, click
                const mail = message.mail;

                // Extract message ID from headers
                const messageId = this.extractMessageId(mail.headers);

                // Find recipient by message ID
                const recipient = await this.findRecipientByMessageId(messageId);

                if (!recipient) {
                    console.warn('⚠️  Recipient not found for message ID:', messageId);
                    return;
                }

                switch (eventType) {
                    case 'Delivery':
                        await this.handleDelivery(recipient, message);
                        break;
                    case 'Bounce':
                        await this.handleBounce(recipient, message);
                        break;
                    case 'Complaint':
                        await this.handleComplaint(recipient, message);
                        break;
                    case 'Open':
                        await this.handleOpen(recipient, message);
                        break;
                    case 'Click':
                        await this.handleClick(recipient, message);
                        break;
                }
            } else if (notificationType === 'SubscriptionConfirmation') {
                // Handle SNS subscription confirmation
                console.log('📧 SNS Subscription Confirmation received');
                // Return the SubscribeURL for confirmation
                return { subscribeUrl: snsMessage.SubscribeURL };
            }
        } catch (error) {
            console.error('Error handling SNS notification:', error);
            throw error;
        }
    }

    /**
     * Extract message ID from email headers
     */
    extractMessageId(headers) {
        if (!headers) return null;

        // Look for X-Message-ID or Message-ID header
        for (const header of headers) {
            if (header.name === 'X-Message-ID' || header.name === 'Message-ID') {
                return header.value;
            }
        }
        return null;
    }

    /**
     * Find recipient by message ID
     */
    async findRecipientByMessageId(messageId) {
        try {
            // Store message ID in email_tracking_events when sending
            // Using Sequelize literal for JSONB query
            const { PsqlSequelize } = require('../config/model');
            const event = await EmailTrackingEvents.findOne({
                where: PsqlSequelize.literal(`event_data->>'messageId' = '${messageId}'`),
                order: [['created_at', 'DESC']],
                attributes: ['recipient_id', 'campaign_id']
            });

            if (event) {
                return {
                    recipientId: event.recipient_id,
                    campaignId: event.campaign_id,
                };
            }

            return null;
        } catch (error) {
            console.error('Error finding recipient by message ID:', error);
            return null;
        }
    }

    /**
     * Handle delivery notification
     */
    async handleDelivery(recipient, message) {
        try {
            const { recipientId, campaignId } = recipient;

            // Update recipient status
            await CampaignRecipients.update(
                {
                    status: 'delivered',
                    delivered_at: new Date()
                },
                { where: { id: recipientId } }
            );

            // Log tracking event
            await EmailTrackingEvents.create({
                campaign_id: campaignId,
                recipient_id: recipientId,
                event_type: 'delivered',
                event_data: {
                    timestamp: message.timestamp,
                    smtpResponse: message.delivery?.smtpResponse,
                }
            });

            // Update campaign stats
            const deliveredCount = await CampaignRecipients.count({
                where: {
                    campaign_id: campaignId,
                    status: 'delivered'
                }
            });

            await EmailCampaigns.update(
                { delivered_count: deliveredCount },
                { where: { id: campaignId } }
            );

            console.log('✅ Email delivered:', recipientId);
        } catch (error) {
            console.error('Error handling delivery:', error);
        }
    }

    /**
     * Handle bounce notification
     */
    async handleBounce(recipient, message) {
        try {
            const { recipientId, campaignId } = recipient;
            const bounce = message.bounce;

            // Determine bounce type
            const bounceType = bounce.bounceType; // Permanent, Transient
            const bounceSubType = bounce.bounceSubType;
            const bounceReason = bounce.bouncedRecipients?.[0]?.diagnosticCode || 'Unknown';

            // Update recipient status
            await CampaignRecipients.update(
                {
                    status: 'bounced',
                    bounced_at: new Date(),
                    error_message: bounceReason.substring(0, 500)
                },
                { where: { id: recipientId } }
            );

            // Log tracking event
            await EmailTrackingEvents.create({
                campaign_id: campaignId,
                recipient_id: recipientId,
                event_type: 'bounced',
                event_data: {
                    bounceType,
                    bounceSubType,
                    bounceReason,
                    timestamp: message.timestamp,
                }
            });

            // Update campaign stats
            const bouncedCount = await CampaignRecipients.count({
                where: {
                    campaign_id: campaignId,
                    status: 'bounced'
                }
            });

            await EmailCampaigns.update(
                { bounced_count: bouncedCount },
                { where: { id: campaignId } }
            );

            console.log('❌ Email bounced:', recipientId, bounceType);
        } catch (error) {
            console.error('Error handling bounce:', error);
        }
    }

    /**
     * Handle complaint (spam report)
     */
    async handleComplaint(recipient, message) {
        try {
            const { recipientId, campaignId } = recipient;
            const complaint = message.complaint;

            // Update recipient status
            await CampaignRecipients.update(
                {
                    status: 'unsubscribed',
                    unsubscribed_at: new Date()
                },
                { where: { id: recipientId } }
            );

            // Log tracking event
            await EmailTrackingEvents.create({
                campaign_id: campaignId,
                recipient_id: recipientId,
                event_type: 'complaint',
                event_data: {
                    complaintType: complaint.complaintFeedbackType,
                    timestamp: message.timestamp,
                }
            });

            // Update campaign stats
            const unsubscribedCount = await CampaignRecipients.count({
                where: {
                    campaign_id: campaignId,
                    status: 'unsubscribed'
                }
            });

            await EmailCampaigns.update(
                { unsubscribed_count: unsubscribedCount },
                { where: { id: campaignId } }
            );

            console.log('⚠️  Email complaint (spam):', recipientId);
        } catch (error) {
            console.error('Error handling complaint:', error);
        }
    }

    /**
     * Handle open event (from SES event publishing)
     */
    async handleOpen(recipient, message) {
        try {
            const { recipientId, campaignId } = recipient;

            // Update recipient status (only if not already opened)
            const recipient = await CampaignRecipients.findByPk(recipientId);
            if (recipient && !recipient.opened_at) {
                await CampaignRecipients.update(
                    {
                        status: 'opened',
                        opened_at: new Date()
                    },
                    { where: { id: recipientId } }
                );
            }

            // Log tracking event
            await EmailTrackingEvents.create({
                campaign_id: campaignId,
                recipient_id: recipientId,
                event_type: 'opened',
                event_data: {
                    ipAddress: message.open?.ipAddress,
                    userAgent: message.open?.userAgent,
                    timestamp: message.timestamp,
                }
            });

            // Update campaign stats
            const openedCount = await CampaignRecipients.count({
                where: {
                    campaign_id: campaignId,
                    opened_at: { [Op.ne]: null }
                },
                distinct: true,
                col: 'recipient_id'
            });

            await EmailCampaigns.update(
                { opened_count: openedCount },
                { where: { id: campaignId } }
            );

            console.log('👁️  Email opened:', recipientId);
        } catch (error) {
            console.error('Error handling open:', error);
        }
    }

    /**
     * Handle click event (from SES event publishing)
     */
    async handleClick(recipient, message) {
        try {
            const { recipientId, campaignId } = recipient;
            const click = message.click;

            // Update recipient status (only if not already clicked)
            const recipient = await CampaignRecipients.findByPk(recipientId);
            if (recipient && !recipient.clicked_at) {
                await CampaignRecipients.update(
                    {
                        status: 'clicked',
                        clicked_at: new Date()
                    },
                    { where: { id: recipientId } }
                );
            }

            // Log tracking event
            await EmailTrackingEvents.create({
                campaign_id: campaignId,
                recipient_id: recipientId,
                event_type: 'clicked',
                event_data: {
                    link: click.link,
                    ipAddress: click.ipAddress,
                    userAgent: click.userAgent,
                    timestamp: message.timestamp,
                }
            });

            // Update campaign stats
            const clickedCount = await CampaignRecipients.count({
                where: {
                    campaign_id: campaignId,
                    clicked_at: { [Op.ne]: null }
                },
                distinct: true,
                col: 'recipient_id'
            });

            await EmailCampaigns.update(
                { clicked_count: clickedCount },
                { where: { id: campaignId } }
            );

            console.log('🖱️  Email clicked:', recipientId);
        } catch (error) {
            console.error('Error handling click:', error);
        }
    }
}

module.exports = new AwsSesService();


