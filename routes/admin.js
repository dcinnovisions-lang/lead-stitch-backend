const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminAuth');
const adminController = require('../controllers/adminController');

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

// User Management
router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUser);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);

// System Monitoring
router.get('/system/health', adminController.getSystemHealth);
router.get('/system/stats', adminController.getPlatformStats);
router.get('/system/queue', adminController.getQueueStatus);

// Campaign Monitoring
router.get('/campaigns', adminController.getCampaigns);

// Scraping Monitoring
router.get('/scraping/stats', adminController.getScrapingStats);

// System Settings
router.get('/settings', adminController.getSettings);
router.get('/settings/:key', adminController.getSetting);
router.put('/settings/:key', adminController.updateSetting);

// Ticket Management
const adminTicketController = require('../controllers/adminTicketController');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '../uploads/tickets');
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|csv|xlsx|xls/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, PDFs, and documents are allowed.'));
    }
  }
}).array('attachments', 5); // Max 5 files

router.get('/tickets', adminTicketController.getAllTickets);
router.get('/tickets/stats', adminTicketController.getTicketStats);
router.get('/tickets/:id', adminTicketController.getTicket);
router.put('/tickets/:id', adminTicketController.updateTicket);
router.post('/tickets/:id/assign', adminTicketController.assignTicket);
router.post('/tickets/:id/comment', upload, adminTicketController.addComment);
router.put('/tickets/:id/status', adminTicketController.updateTicketStatus);
router.put('/tickets/:id/priority', adminTicketController.updateTicketPriority);
router.delete('/tickets/:id', adminTicketController.deleteTicket);

module.exports = router;

