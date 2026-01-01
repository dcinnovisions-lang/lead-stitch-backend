const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const { authenticateToken } = require('../middleware/auth');

// CORS middleware for tracking endpoints (public access from email clients)
const cors = require('cors');
const trackingCors = cors({
  origin: '*', // Allow all origins for email tracking (email clients)
  methods: ['GET', 'POST'],
  credentials: false
});

// Email Tracking Routes (public - no auth required for tracking)
// These must be defined BEFORE the authenticateToken middleware
router.get('/track/pixel/:pixelId', trackingCors, emailController.trackEmailOpen);
router.get('/track/link/:linkId', trackingCors, emailController.trackLinkClick);
router.get('/unsubscribe', trackingCors, emailController.handleUnsubscribe);
router.post('/unsubscribe', trackingCors, emailController.handleUnsubscribe);

// All other routes require authentication
router.use(authenticateToken);

// SMTP Credentials Routes
router.get('/smtp', emailController.getSMTPCredentials);
router.get('/smtp/providers', emailController.getSMTPProviders);
router.get('/smtp/:id', emailController.getSMTPCredential);
router.post('/smtp', emailController.createSMTPCredentials);
router.put('/smtp/:id', emailController.updateSMTPCredentials);
router.delete('/smtp/:id', emailController.deleteSMTPCredentials);

// SMTP Testing Routes
router.post('/smtp/:id/test-connection', emailController.testSMTPConnection);
router.post('/smtp/:id/test-email', emailController.sendTestEmail);

// Template Routes
router.get('/templates', emailController.getTemplates);
router.get('/templates/:id', emailController.getTemplate);
router.post('/templates', emailController.createTemplate);
router.put('/templates/:id', emailController.updateTemplate);
router.delete('/templates/:id', emailController.deleteTemplate);

module.exports = router;

