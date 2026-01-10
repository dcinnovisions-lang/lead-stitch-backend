const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { checkApprovalStatusAdmin } = require('../middleware/checkApprovalStatus');
const userApprovalController = require('../controllers/userApprovalController');

/**
 * User Approval Routes
 * All routes require admin authentication
 */

// Get approval statistics
router.get(
    '/stats',
    authenticateToken,
    checkApprovalStatusAdmin,
    userApprovalController.getApprovalStats
);

// Get pending users with filtering
router.get(
    '/',
    authenticateToken,
    checkApprovalStatusAdmin,
    userApprovalController.getPendingUsers
);

// Get single user details
router.get(
    '/:userId',
    authenticateToken,
    checkApprovalStatusAdmin,
    userApprovalController.getUserDetails
);

// Approve user
router.post(
    '/:userId/approve',
    authenticateToken,
    checkApprovalStatusAdmin,
    userApprovalController.approveUser
);

// Reject user
router.post(
    '/:userId/reject',
    authenticateToken,
    checkApprovalStatusAdmin,
    userApprovalController.rejectUser
);

// Bulk approve users
router.post(
    '/bulk/approve',
    authenticateToken,
    checkApprovalStatusAdmin,
    userApprovalController.bulkApproveUsers
);

module.exports = router;
