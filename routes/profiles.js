const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

router.post('/scrape', profileController.startScraping);
router.get('/scraping-status/:jobId', profileController.getScrapingStatus);
router.get('/', profileController.getProfiles);
router.post('/enrich-emails', profileController.enrichWithEmails);
// More specific routes must come before generic :id route
router.put('/:id/email', profileController.updateEmailAddress);
router.get('/:id', profileController.getProfileById);

module.exports = router;

