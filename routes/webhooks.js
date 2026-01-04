/**
 * Webhooks Routes - For AWS SES SNS notifications and email reply detection
 * 
 * These endpoints receive webhooks from:
 * - AWS SES via SNS for delivery, bounce, complaint notifications
 * - Email providers for reply detection
 * - Third-party email forwarding services
 */

const express = require('express');
const router = express.Router();
const awsSesService = require('../services/awsSesService');
const replyDetectionService = require('../services/replyDetectionService');

// AWS SES SNS webhook endpoint
router.post('/aws-ses', async (req, res) => {
  try {
    // AWS SNS sends notifications as JSON
    const snsMessage = req.body;

    // Handle subscription confirmation
    if (snsMessage.Type === 'SubscriptionConfirmation') {
      console.log('📧 SNS Subscription Confirmation received');
      const result = await awsSesService.handleSnsNotification(snsMessage);
      
      // Return subscribe URL for manual confirmation if needed
      return res.json({
        success: true,
        message: 'Subscription confirmation received',
        subscribeUrl: result?.subscribeUrl,
      });
    }

    // Handle notification
    await awsSesService.handleSnsNotification(snsMessage);

    // Always return 200 to acknowledge receipt
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    // Still return 200 to prevent retries
    res.status(200).json({ success: false, error: error.message });
  }
});

/**
 * Email reply webhook endpoint
 * Receives email data from various sources and detects replies
 * 
 * Expected payload:
 * {
 *   from: "replier@example.com",
 *   to: "your-email@your-domain.com",
 *   subject: "Re: Your original subject",
 *   body: "This is the reply text",
 *   messageId: "original-message-id",
 *   inReplyTo: "original@message.id",
 *   references: "original@message.id"
 * }
 */
router.post('/email-reply', async (req, res) => {
  try {
    const replyData = req.body;

    if (!replyData.from || !replyData.to) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: from, to'
      });
    }

    // Process reply detection
    const processed = await replyDetectionService.detectReplyFromIncoming(replyData);

    res.status(200).json({
      success: true,
      message: processed ? 'Reply detected and processed' : 'Email received but not identified as reply',
      processed
    });
  } catch (error) {
    console.error('Reply webhook error:', error);
    res.status(200).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Generic email webhook endpoint
 * For forwarded emails or provider-specific webhook formats
 */
router.post('/email-webhook', async (req, res) => {
  try {
    const webhookData = req.body;

    // Try to process as reply
    const processed = await replyDetectionService.processEmailWebhook(webhookData);

    res.status(200).json({
      success: true,
      message: 'Webhook processed',
      type: processed ? 'reply' : 'other'
    });
  } catch (error) {
    console.error('Email webhook error:', error);
    res.status(200).json({
      success: false,
      error: error.message
    });
});

module.exports = router;


