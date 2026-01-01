const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const ticketController = require('../controllers/ticketController');

// All ticket routes require authentication
router.use(authenticateToken);

// Create ticket with file upload
router.post('/', ticketController.upload, ticketController.createTicket);

// Get user's tickets
router.get('/', ticketController.getUserTickets);

// Get single ticket
router.get('/:id', ticketController.getTicket);

// Update ticket
router.put('/:id', ticketController.updateTicket);

// Add comment with file upload
router.post('/:id/comments', ticketController.upload, ticketController.addComment);

// Close ticket
router.post('/:id/close', ticketController.closeTicket);

// Download attachment
router.get('/attachments/:id', ticketController.downloadAttachment);

module.exports = router;

