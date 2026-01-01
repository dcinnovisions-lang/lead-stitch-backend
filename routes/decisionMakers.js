const express = require('express');
const router = express.Router();
const decisionMakerController = require('../controllers/decisionMakerController');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// CRUD operations for decision makers
router.get('/requirement/:requirementId', decisionMakerController.getDecisionMakers);
router.post('/', decisionMakerController.createDecisionMaker);
router.put('/:id', decisionMakerController.updateDecisionMaker);
router.delete('/:id', decisionMakerController.deleteDecisionMaker);
router.post('/requirement/:requirementId/finalize', decisionMakerController.finalizeDecisionMakers);

module.exports = router;

