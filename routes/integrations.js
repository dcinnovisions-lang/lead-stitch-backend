const express = require('express');
const router = express.Router();
const integrationsController = require('../controllers/integrationsController');
const linkedInOAuthController = require('../controllers/linkedInOAuthController');
const { authenticateToken } = require('../middleware/auth');

// LinkedIn OAuth routes (callback doesn't require auth token, uses state)
router.get('/linkedin/oauth/url', authenticateToken, linkedInOAuthController.getLinkedInAuthUrl);
router.get('/linkedin/oauth/callback', linkedInOAuthController.handleLinkedInCallback);
router.post('/linkedin/oauth/refresh', authenticateToken, linkedInOAuthController.refreshLinkedInToken);

// Legacy routes (for backward compatibility)
router.use(authenticateToken);
router.get('/linkedin', integrationsController.getLinkedInCredentials);
router.post('/linkedin/verify', integrationsController.verifyLinkedInCredentials);
router.post('/linkedin/capture-session', integrationsController.captureLinkedInSession);
router.post('/linkedin', integrationsController.saveLinkedInCredentials);
router.put('/linkedin', integrationsController.updateLinkedInCredentials);
router.delete('/linkedin', integrationsController.deleteLinkedInCredentials);

// Get credentials for scraping (used internally)
router.get('/linkedin/scraping', integrationsController.getLinkedInCredentialsForScraping);

module.exports = router;

