const { Tickets, TicketComments, TicketAttachments, Users } = require('../config/model');
const { Op } = require('sequelize');
const ticketNotificationService = require('../services/ticketNotificationService');

/**
 * Get all tickets (admin view)
 */
exports.getAllTickets = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, category, priority, assigned_to, search } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};

    if (status) whereClause.status = status;
    if (category) whereClause.category = category;
    if (priority) whereClause.priority = priority;
    // Handle "unassigned" filter - check for NULL instead of string "unassigned"
    if (assigned_to) {
      if (assigned_to === 'unassigned') {
        whereClause.assigned_to = { [Op.is]: null };
      } else {
        // Validate it's a valid UUID format before using it
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(assigned_to)) {
          whereClause.assigned_to = assigned_to;
        } else {
          return res.status(400).json({ message: 'Invalid assigned_to value' });
        }
      }
    }
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
        { model: Users, as: 'creator', attributes: ['id', 'email', 'first_name', 'last_name'] },
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
    console.error('Get all tickets error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get single ticket (admin view)
 */
exports.getTicket = async (req, res) => {
  try {
    const { id } = req.params;

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

    res.json({ ticket });
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Update ticket (admin - can update status, priority, etc.)
 */
exports.updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority, message } = req.body; // Added message field
    const adminId = req.user.userId;

    const ticket = await Tickets.findByPk(id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const updateData = {};
    const changes = [];
    let statusChangeMessage = null;

    if (status) {
      const validStatuses = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      const oldStatus = ticket.status;
      updateData.status = status;
      if (status === 'resolved' && !ticket.resolved_at) {
        updateData.resolved_at = new Date();
      }
      if (status === 'closed' && !ticket.closed_at) {
        updateData.closed_at = new Date();
      }
      if (oldStatus !== status) {
        // Store message for email notification
        statusChangeMessage = message || null;
        // Verify admin user exists
        const adminUser = await Users.findByPk(adminId);
        if (!adminUser) {
          console.error(`Admin user with ID ${adminId} not found`);
        }
        // Create user-facing comment if message provided
        if (message && message.trim()) {
          await TicketComments.create({
            ticket_id: id,
            user_id: adminId,
            comment: `Status changed from ${oldStatus.replace('_', ' ')} to ${status.replace('_', ' ')}. ${message.trim()}`,
            is_internal: false, // User-visible comment
          });
        } else {
          // Create internal comment for tracking
          await TicketComments.create({
            ticket_id: id,
            user_id: adminId,
            comment: `Status changed from ${oldStatus.replace('_', ' ')} to ${status.replace('_', ' ')}`,
            is_internal: true,
          });
        }
      }
    }

    if (priority) {
      const validPriorities = ['low', 'medium', 'high', 'urgent'];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({ message: 'Invalid priority' });
      }
      const oldPriority = ticket.priority;
      updateData.priority = priority;
      if (oldPriority !== priority) {
        // Only create internal comment for priority changes
        await TicketComments.create({
          ticket_id: id,
          user_id: adminId,
          comment: `Priority changed from ${oldPriority} to ${priority}`,
          is_internal: true,
        });
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    const oldStatus = ticket.status;
    await ticket.update(updateData);

    // Send email notification if status changed
    if (status && oldStatus !== status) {
      const updatedTicket = await Tickets.findByPk(id);
      ticketNotificationService.notifyStatusChange(
        updatedTicket,
        oldStatus,
        status,
        statusChangeMessage
      ).catch(err => {
        console.error('Error sending status change notification:', err);
      });
    }

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
 * Add comment to ticket (admin - can add internal comments)
 */
exports.addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment, is_internal } = req.body;
    const adminId = req.user.userId;
    const multer = require('multer');
    const path = require('path');
    const fs = require('fs').promises;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ message: 'Comment is required' });
    }

    const ticket = await Tickets.findByPk(id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Handle file uploads if any
    const uploadDir = path.join(__dirname, '../uploads/tickets');
    const files = req.files || [];
    const attachmentIds = [];

    if (files.length > 0) {
      await fs.mkdir(uploadDir, { recursive: true });
      for (const file of files) {
        const attachment = await TicketAttachments.create({
          ticket_id: id,
          user_id: adminId,
          file_name: file.originalname,
          file_path: file.path,
          file_size: file.size,
          file_type: file.mimetype,
        });
        attachmentIds.push(attachment.id);
      }
    }

    // Create comment
    const isInternal = is_internal === true || is_internal === 'true';
    const newComment = await TicketComments.create({
      ticket_id: id,
      user_id: adminId,
      comment: comment.trim(),
      is_internal: isInternal,
    });

    // Associate attachments with comment if any
    if (attachmentIds.length > 0) {
      await TicketAttachments.update(
        { comment_id: newComment.id },
        { where: { id: attachmentIds } }
      );
    }

    // Send email notification only for user-visible comments (not internal)
    if (!isInternal) {
      const commenter = await Users.findByPk(adminId);
      ticketNotificationService.notifyCommentAdded(
        ticket,
        newComment,
        commenter
      ).catch(err => {
        console.error('Error sending comment notification:', err);
      });
    }

    // Fetch comment with user and attachments
    const commentWithDetails = await TicketComments.findByPk(newComment.id, {
      include: [
        { model: Users, attributes: ['id', 'email', 'first_name', 'last_name'] },
        { model: TicketAttachments, as: 'attachments' },
      ],
    });

    res.json({
      message: 'Comment added successfully',
      comment: commentWithDetails,
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get ticket statistics
 */
exports.getTicketStats = async (req, res) => {
  try {
    const stats = {
      total: await Tickets.count(),
      open: await Tickets.count({ where: { status: 'open' } }),
      in_progress: await Tickets.count({ where: { status: 'in_progress' } }),
      waiting_customer: await Tickets.count({ where: { status: 'waiting_customer' } }),
      resolved: await Tickets.count({ where: { status: 'resolved' } }),
      closed: await Tickets.count({ where: { status: 'closed' } }),
      by_priority: {
        low: await Tickets.count({ where: { priority: 'low' } }),
        medium: await Tickets.count({ where: { priority: 'medium' } }),
        high: await Tickets.count({ where: { priority: 'high' } }),
        urgent: await Tickets.count({ where: { priority: 'urgent' } }),
      },
      by_category: {
        technical: await Tickets.count({ where: { category: 'technical' } }),
        billing: await Tickets.count({ where: { category: 'billing' } }),
        feature_request: await Tickets.count({ where: { category: 'feature_request' } }),
        bug_report: await Tickets.count({ where: { category: 'bug_report' } }),
        account: await Tickets.count({ where: { category: 'account' } }),
        other: await Tickets.count({ where: { category: 'other' } }),
      },
      unassigned: await Tickets.count({ where: { assigned_to: null, status: { [Op.in]: ['open', 'in_progress'] } } }),
    };

    res.json(stats);
  } catch (error) {
    console.error('Get ticket stats error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Assign ticket to admin
 */
exports.assignTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_to } = req.body;
    const adminId = req.user.userId;

    const ticket = await Tickets.findByPk(id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Verify assigned user is an admin
    if (assigned_to) {
      const assignee = await Users.findByPk(assigned_to);
      if (!assignee || assignee.role !== 'admin') {
        return res.status(400).json({ message: 'Can only assign to admin users' });
      }
    }

    const oldAssignee = ticket.assigned_to;
    await ticket.update({
      assigned_to: assigned_to || null,
      status: assigned_to ? 'in_progress' : ticket.status,
    });

    // Add internal comment
    await TicketComments.create({
      ticket_id: id,
      user_id: adminId,
      comment: assigned_to 
        ? `Ticket assigned to admin` 
        : `Ticket unassigned`,
      is_internal: true,
    });

    const updatedTicket = await Tickets.findByPk(id, {
      include: [
        { model: Users, as: 'creator', attributes: ['id', 'email', 'first_name', 'last_name'] },
        { model: Users, as: 'assignee', attributes: ['id', 'email', 'first_name', 'last_name'] },
      ],
    });

    // Send email notification if ticket was assigned (async, don't wait)
    if (assigned_to && assigned_to !== oldAssignee) {
      if (updatedTicket.assignee) {
        ticketNotificationService.notifyTicketAssigned(
          updatedTicket,
          updatedTicket.assignee
        ).catch(err => {
          console.error('Error sending assignment notification:', err);
        });
      }
    }

    res.json({
      message: 'Ticket assigned successfully',
      ticket: updatedTicket,
    });
  } catch (error) {
    console.error('Assign ticket error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Update ticket status (admin only)
 */
exports.updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const adminId = req.user.userId;

    const validStatuses = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const ticket = await Tickets.findByPk(id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const oldStatus = ticket.status;
    const updateData = { status };
    if (status === 'resolved' && !ticket.resolved_at) {
      updateData.resolved_at = new Date();
    }
    if (status === 'closed' && !ticket.closed_at) {
      updateData.closed_at = new Date();
    }

    await ticket.update(updateData);

    // Add internal comment
    await TicketComments.create({
      ticket_id: id,
      user_id: adminId,
      comment: `Status changed to ${status}`,
      is_internal: true,
    });

    // Send email notification if status changed (async, don't wait)
    if (oldStatus !== status) {
      const updater = await Users.findByPk(adminId);
      ticketNotificationService.sendTicketStatusChangeNotification(
        ticket,
        oldStatus,
        status,
        updater
      ).catch(err => {
        console.error('Error sending status change notification:', err);
      });
    }

    res.json({ message: 'Ticket status updated successfully' });
  } catch (error) {
    console.error('Update ticket status error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Update ticket priority (admin only)
 */
exports.updateTicketPriority = async (req, res) => {
  try {
    const { id } = req.params;
    const { priority } = req.body;
    const adminId = req.user.userId;

    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({ message: 'Invalid priority' });
    }

    const ticket = await Tickets.findByPk(id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    await ticket.update({ priority });

    // Add internal comment
    await TicketComments.create({
      ticket_id: id,
      user_id: adminId,
      comment: `Priority changed to ${priority}`,
      is_internal: true,
    });

    res.json({ message: 'Ticket priority updated successfully' });
  } catch (error) {
    console.error('Update ticket priority error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Delete ticket (admin only)
 */
exports.deleteTicket = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await Tickets.findByPk(id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    await ticket.destroy();

    res.json({ message: 'Ticket deleted successfully' });
  } catch (error) {
    console.error('Delete ticket error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

