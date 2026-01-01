const express = require('express');
const router = express.Router();
const leadsController = require('../controllers/leadsController');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// Get all leads for user (not grouped)
router.get('/all', leadsController.getAllLeads);

// Get leads grouped by requirement (only closed requirements)
router.get('/grouped', leadsController.getLeadsGroupedByRequirement);

// Get single lead by ID
router.get('/:id', leadsController.getLeadById);

// Create new lead (manual entry)
router.post('/', leadsController.createLead);

// Update lead
router.put('/:id', leadsController.updateLead);

// Delete lead
router.delete('/:id', leadsController.deleteLead);

module.exports = router;

