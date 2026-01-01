const { Tickets, TicketComments, TicketAttachments, Users } = require('../config/model');
const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const multer = require('multer');
const ticketNotificationService = require('../services/ticketNotificationService');

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
    // Allow common file types
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

// Generate unique ticket number
function generateTicketNumber() {
  const prefix = 'TKT';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Create a new ticket
 */
exports.createTicket = async (req, res) => {
  try {
    const { subject, description, category, priority } = req.body;
    const userId = req.user.userId;

    if (!subject || !description) {
      return res.status(400).json({ message: 'Subject and description are required' });
    }

    const ticketNumber = generateTicketNumber();
    
    const ticket = await Tickets.create({
      user_id: userId,
      ticket_number: ticketNumber,
      subject,
      description,
      category: category || 'other',
      priority: priority || 'medium',
      status: 'open',
    });

    // Handle file uploads if any
    if (req.files && req.files.length > 0) {
      const attachments = req.files.map(file => ({
        ticket_id: ticket.id,
        user_id: userId,
        file_name: file.originalname,
        file_path: file.path,
        file_size: file.size,
        file_type: file.mimetype,
      }));

      await TicketAttachments.bulkCreate(attachments);
    }

    // Fetch ticket with relations
    const ticketWithDetails = await Tickets.findByPk(ticket.id, {
      include: [
        { model: Users, as: 'creator', attributes: ['id', 'email', 'first_name', 'last_name'] },
        { model: TicketAttachments, as: 'attachments' },
      ],
    });

    // Send email notification (async, don't wait)
    ticketNotificationService.notifyTicketCreated(ticketWithDetails).catch(err => {
      console.error('Error sending ticket creation notification:', err);
    });

    res.status(201).json({
      message: 'Ticket created successfully',
      ticket: ticketWithDetails,
    });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

/**
 * Get user's tickets
 */
exports.getUserTickets = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 20, status, category, priority, search } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = { user_id: userId };

    if (status) whereClause.status = status;
    if (category) whereClause.category = category;
    if (priority) whereClause.priority = priority;
    if (search) {
      whereClause[Op.or] = [
        { subject: { [Op.iLike]: `%${search}%` } },
        { ticket_number: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows: tickets } = await Tickets.findAndCountAll({
      where: whereClause,
      include: [
        { model: Users, as: 'assignee', attributes: ['id', 'email', 'first_name', 'last_name'] },
        { model: TicketAttachments, as: 'attachments', limit: 1 },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({
      tickets,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error('Get user tickets error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get single ticket details
 */
exports.getTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const ticket = await Tickets.findByPk(id, {
      include: [
        { model: Users, as: 'creator', attributes: ['id', 'email', 'first_name', 'last_name'], required: false },
        { model: Users, as: 'assignee', attributes: ['id', 'email', 'first_name', 'last_name'], required: false },
        { 
          model: TicketComments, 
          as: 'comments',
          include: [
            { 
              model: Users, 
              attributes: ['id', 'email', 'first_name', 'last_name'],
              required: false 
            },
            { model: TicketAttachments, as: 'attachments', required: false },
          ],
          order: [['created_at', 'ASC']],
          required: false,
        },
        { model: TicketAttachments, as: 'attachments', required: false },
      ],
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Check if user has access (owner or admin)
    if (ticket.user_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Filter internal comments for non-admin users
    if (userRole !== 'admin' && ticket.comments) {
      ticket.comments = ticket.comments.filter(comment => !comment.is_internal);
    }

    res.json({ ticket });
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Add comment to ticket
 */
exports.addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment, is_internal } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    if (!comment) {
      return res.status(400).json({ message: 'Comment is required' });
    }

    const ticket = await Tickets.findByPk(id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Check access
    if (ticket.user_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Only admins can create internal comments
    const isInternal = userRole === 'admin' && is_internal === true;

    const ticketComment = await TicketComments.create({
      ticket_id: id,
      user_id: userId,
      comment,
      is_internal: isInternal,
    });

    // Handle file uploads if any
    if (req.files && req.files.length > 0) {
      const attachments = req.files.map(file => ({
        ticket_id: id,
        comment_id: ticketComment.id,
        user_id: userId,
        file_name: file.originalname,
        file_path: file.path,
        file_size: file.size,
        file_type: file.mimetype,
      }));

      await TicketAttachments.bulkCreate(attachments);
    }

    // Update ticket updated_at
    await ticket.update({ updated_at: new Date() });

    // Fetch comment with relations
    const commentWithDetails = await TicketComments.findByPk(ticketComment.id, {
      include: [
        { model: Users, attributes: ['id', 'email', 'first_name', 'last_name'] },
        { model: TicketAttachments, as: 'attachments' },
      ],
    });

    // Send email notification if comment is from admin (async, don't wait)
    if (userRole === 'admin' && !isInternal) {
      ticketNotificationService.notifyCommentAdded(ticket, commentWithDetails, req.user).catch(err => {
        console.error('Error sending comment notification:', err);
      });
    }

    res.status(201).json({
      message: 'Comment added successfully',
      comment: commentWithDetails,
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Update ticket (user can only update their own tickets)
 */
exports.updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { subject, description, category, priority } = req.body;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const ticket = await Tickets.findByPk(id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Check access
    if (ticket.user_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Users can only update certain fields
    const updateData = {};
    if (subject) updateData.subject = subject;
    if (description) updateData.description = description;
    if (category) updateData.category = category;
    if (priority) updateData.priority = priority;

    await ticket.update(updateData);

    const updatedTicket = await Tickets.findByPk(id, {
      include: [
        { model: Users, as: 'creator', attributes: ['id', 'email', 'first_name', 'last_name'] },
        { model: Users, as: 'assignee', attributes: ['id', 'email', 'first_name', 'last_name'] },
      ],
    });

    res.json({
      message: 'Ticket updated successfully',
      ticket: updatedTicket,
    });
  } catch (error) {
    console.error('Update ticket error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Close ticket (user can close their own tickets)
 */
exports.closeTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const ticket = await Tickets.findByPk(id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Check access
    if (ticket.user_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    await ticket.update({
      status: 'closed',
      closed_at: new Date(),
    });

    res.json({ message: 'Ticket closed successfully' });
  } catch (error) {
    console.error('Close ticket error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Download ticket attachment
 */
exports.downloadAttachment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const attachment = await TicketAttachments.findByPk(id, {
      include: [
        { 
          model: Tickets,
          include: [
            { model: Users, as: 'creator', attributes: ['id'] }
          ]
        }
      ],
    });

    if (!attachment) {
      return res.status(404).json({ message: 'Attachment not found' });
    }

    // Check access - user must own the ticket or be admin
    if (attachment.ticket.user_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Check if file exists
    try {
      await fs.access(attachment.file_path);
    } catch (error) {
      return res.status(404).json({ message: 'File not found on server' });
    }

    // Set headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.file_name}"`);
    res.setHeader('Content-Type', attachment.file_type);

    // Stream file to response
    const fileStream = fsSync.createReadStream(attachment.file_path);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Download attachment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Export multer upload middleware
exports.upload = upload;

