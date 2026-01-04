const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaignController');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// Campaign Routes
router.get('/', campaignController.getCampaigns);
router.get('/:id', campaignController.getCampaign);
router.post('/', campaignController.createCampaign);
router.put('/:id', campaignController.updateCampaign);
router.delete('/:id', campaignController.deleteCampaign);

// Campaign Recipients
router.get('/:id/recipients', campaignController.getCampaignRecipients);

// Mark recipient as replied
router.post('/:id/recipients/:recipientId/reply', campaignController.markRecipientReplied);

// Send Campaign
router.post('/:id/send', campaignController.sendCampaign);

module.exports = router;


