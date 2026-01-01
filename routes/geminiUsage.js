const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminAuth');
const geminiUsageController = require('../controllers/geminiUsageController');

// All routes require authentication AND admin role
router.use(authenticateToken);
router.use(requireAdmin);

// Usage Tracking Routes
router.get('/', geminiUsageController.getUsage);
router.get('/summary', geminiUsageController.getUsageSummary);
router.get('/billing', geminiUsageController.getBilling);

module.exports = router;

