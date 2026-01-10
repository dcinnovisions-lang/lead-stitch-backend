const express = require('express');
const router = express.Router();
const businessRequirementController = require('../controllers/businessRequirementController');
const { authenticateToken } = require('../middleware/auth');
const { checkApprovalStatus } = require('../middleware/checkApprovalStatus');

// All routes require authentication and approval
router.use(authenticateToken);
router.use(checkApprovalStatus);

router.post('/', businessRequirementController.create);
router.post('/identify-industry', businessRequirementController.identifyIndustry);
router.get('/', businessRequirementController.getAll);
router.get('/:id', businessRequirementController.getById);
router.delete('/:id', businessRequirementController.delete);
router.post('/:id/identify-decision-makers', businessRequirementController.identifyDecisionMakers);

module.exports = router;

