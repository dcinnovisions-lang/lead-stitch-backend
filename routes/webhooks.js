/**
 * Webhooks Routes - For AWS SES SNS notifications
 * 
 * These endpoints receive webhooks from AWS SES via SNS for:
 * - Delivery notifications
 * - Bounce tracking
 * - Complaint tracking
 * - Open/Click events (if configured)
 */

const express = require('express');
const router = express.Router();
const awsSesService = require('../services/awsSesService');

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

module.exports = router;


