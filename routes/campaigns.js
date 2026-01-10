const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaignController');
const { authenticateToken } = require('../middleware/auth');
const { checkApprovalStatus } = require('../middleware/checkApprovalStatus');

// All routes require authentication and approval
router.use(authenticateToken);
router.use(checkApprovalStatus);

// Campaign Routes
router.get('/', campaignController.getCampaigns);
router.get('/:id', campaignController.getCampaign);
router.post('/', campaignController.createCampaign);
router.put('/:id', campaignController.updateCampaign);
router.delete('/:id', campaignController.deleteCampaign);

// Campaign Recipients
router.get('/:id/recipients', campaignController.getCampaignRecipients);

// Send Campaign
router.post('/:id/send', campaignController.sendCampaign);

module.exports = router;


