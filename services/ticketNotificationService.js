const nodemailer = require('nodemailer');
const { Users, Tickets } = require('../config/model');

/**
 * Ticket Notification Service
 * Sends email notifications for ticket events
 */
class TicketNotificationService {
  constructor() {
    // Use system email configuration or default SMTP
    this.transporter = null;
    this.initialized = false;
  }

  async initializeTransporter() {
    // Use OTP SMTP configuration (same as password reset emails)
    if (this.initialized) return; // Skip if already initialized

    try {
      const smtpConfig = {
        host: process.env.OTP_SMTP_HOST || process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.OTP_SMTP_PORT || process.env.SMTP_PORT || '587'),
        secure: process.env.OTP_SMTP_SECURE === 'true' || process.env.SMTP_SECURE === 'true',
        auth: (process.env.OTP_SMTP_USER || process.env.SMTP_USER) &&
          (process.env.OTP_SMTP_PASS || process.env.SMTP_PASS) ? {
          user: process.env.OTP_SMTP_USER || process.env.SMTP_USER,
          pass: process.env.OTP_SMTP_PASS || process.env.SMTP_PASS,
        } : undefined,
      };

      if (smtpConfig.auth) {
        this.transporter = nodemailer.createTransport(smtpConfig);
      } else {
        console.warn('⚠️  SMTP not configured. Ticket email notifications will be disabled.');
        console.warn('⚠️  Set OTP_SMTP_HOST, OTP_SMTP_PORT, OTP_SMTP_USER, OTP_SMTP_PASS in .env to enable notifications.');
      }
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing email transporter:', error);
      this.initialized = true;
    }
  }

  /**
   * Send email notification
   */
  async sendNotification(to, subject, html, text) {
    // Ensure transporter is initialized before sending
    if (!this.initialized) {
      await this.initializeTransporter();
    }

    if (!this.transporter) {
      console.log('📧 Email notification skipped (SMTP not configured):', subject);
      return false;
    }

    try {
      const mailOptions = {
        from: process.env.OTP_EMAIL_FROM || process.env.SMTP_FROM || process.env.OTP_SMTP_USER || process.env.SMTP_USER || 'noreply@leadstitch.com',
        to,
        subject,
        html,
        text,
      };

      await this.transporter.sendMail(mailOptions);
      console.log('✅ Email notification sent:', subject, 'to', to);
      return true;
    } catch (error) {
      console.error('❌ Error sending email notification:', error);
      return false;
    }
  }

  /**
   * Notify user when ticket is created
   */
  async notifyTicketCreated(ticket) {
    const user = await Users.findByPk(ticket.user_id);
    if (!user) return;

    const ticketUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/tickets/${ticket.id}`;

    const subject = `Support Ticket Created: ${ticket.ticket_number}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Support Ticket Created</h2>
        <p>Hello ${user.first_name || 'User'},</p>
        <p>Your support ticket has been created successfully.</p>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Ticket Number:</strong> ${ticket.ticket_number}</p>
          <p><strong>Subject:</strong> ${ticket.subject}</p>
          <p><strong>Category:</strong> ${ticket.category.replace('_', ' ')}</p>
          <p><strong>Priority:</strong> ${ticket.priority}</p>
          <p><strong>Status:</strong> ${ticket.status.replace('_', ' ')}</p>
        </div>
        <p><strong>Description:</strong></p>
        <p style="background: #ffffff; padding: 15px; border-left: 4px solid #2563eb; margin: 10px 0;">
          ${ticket.description.replace(/\n/g, '<br>')}
        </p>
        <p style="margin-top: 30px;">
          <a href="${ticketUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Ticket
          </a>
        </p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          You will receive email notifications when there are updates to your ticket.
        </p>
      </div>
    `;
    const text = `
Support Ticket Created

Hello ${user.first_name || 'User'},

Your support ticket has been created successfully.

Ticket Number: ${ticket.ticket_number}
Subject: ${ticket.subject}
Category: ${ticket.category.replace('_', ' ')}
Priority: ${ticket.priority}
Status: ${ticket.status.replace('_', ' ')}

Description:
${ticket.description}

View your ticket: ${ticketUrl}

You will receive email notifications when there are updates to your ticket.
    `;

    return await this.sendNotification(user.email, subject, html, text);
  }

  /**
   * Notify user when admin adds a comment
   */
  async notifyCommentAdded(ticket, comment, commentUser) {
    const ticketUser = await Users.findByPk(ticket.user_id);
    if (!ticketUser) return;

    // Don't notify if the comment is from the ticket owner
    if (commentUser && commentUser.id === ticket.user_id) return;

    // Don't notify for internal comments
    if (comment.is_internal) return;

    const ticketUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/tickets/${ticket.id}`;
    const commenterName = commentUser
      ? `${commentUser.first_name || ''} ${commentUser.last_name || ''}`.trim() || commentUser.email
      : 'Support Team';

    const subject = `New Update on Ticket: ${ticket.ticket_number}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Ticket Update</h2>
        <p>Hello ${ticketUser.first_name || 'User'},</p>
        <p>There's a new update on your support ticket.</p>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Ticket Number:</strong> ${ticket.ticket_number}</p>
          <p><strong>Subject:</strong> ${ticket.subject}</p>
        </div>
        <p><strong>New Comment from ${commenterName}:</strong></p>
        <div style="background: #ffffff; padding: 15px; border-left: 4px solid #2563eb; margin: 10px 0;">
          ${comment.comment.replace(/\n/g, '<br>')}
        </div>
        <p style="margin-top: 30px;">
          <a href="${ticketUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Ticket & Reply
          </a>
        </p>
      </div>
    `;
    const text = `
Ticket Update

Hello ${ticketUser.first_name || 'User'},

There's a new update on your support ticket.

Ticket Number: ${ticket.ticket_number}
Subject: ${ticket.subject}

New Comment from ${commenterName}:
${comment.comment}

View your ticket: ${ticketUrl}
    `;

    return await this.sendNotification(ticketUser.email, subject, html, text);
  }

  /**
   * Notify user when ticket status changes
   */
  async notifyStatusChange(ticket, oldStatus, newStatus, message = null) {
    const user = await Users.findByPk(ticket.user_id);
    if (!user) return;

    const ticketUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/tickets/${ticket.id}`;

    const statusLabels = {
      open: 'Open',
      in_progress: 'In Progress',
      waiting_customer: 'Waiting for Customer',
      resolved: 'Resolved',
      closed: 'Closed'
    };

    const subject = `Ticket Status Updated: ${ticket.ticket_number}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Ticket Status Updated</h2>
        <p>Hello ${user.first_name || 'User'},</p>
        <p>The status of your support ticket has been updated.</p>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Ticket Number:</strong> ${ticket.ticket_number}</p>
          <p><strong>Subject:</strong> ${ticket.subject}</p>
          <p><strong>Status Changed:</strong> ${statusLabels[oldStatus] || oldStatus} → ${statusLabels[newStatus] || newStatus}</p>
        </div>
        ${message ? `
        <div style="background: #ffffff; padding: 15px; border-left: 4px solid #2563eb; margin: 20px 0;">
          <p><strong>Message from Support Team:</strong></p>
          <p>${message.replace(/\n/g, '<br>')}</p>
        </div>
        ` : ''}
        <p style="margin-top: 30px;">
          <a href="${ticketUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Ticket & Reply
          </a>
        </p>
      </div>
    `;
    const text = `
Ticket Status Updated

Hello ${user.first_name || 'User'},

The status of your support ticket has been updated.

Ticket Number: ${ticket.ticket_number}
Subject: ${ticket.subject}
Status Changed: ${statusLabels[oldStatus] || oldStatus} → ${statusLabels[newStatus] || newStatus}
${message ? `\nMessage from Support Team:\n${message}\n` : ''}

View your ticket: ${ticketUrl}
    `;

    return await this.sendNotification(user.email, subject, html, text);
  }

  /**
   * Notify user when ticket is assigned to an admin
   */
  async notifyTicketAssigned(ticket, assignee) {
    const user = await Users.findByPk(ticket.user_id);
    if (!user) return;

    const ticketUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/tickets/${ticket.id}`;
    const assigneeName = assignee
      ? `${assignee.first_name || ''} ${assignee.last_name || ''}`.trim() || assignee.email
      : 'Support Team';

    const subject = `Ticket Assigned: ${ticket.ticket_number}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Ticket Assigned</h2>
        <p>Hello ${user.first_name || 'User'},</p>
        <p>Your support ticket has been assigned to a support agent.</p>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Ticket Number:</strong> ${ticket.ticket_number}</p>
          <p><strong>Subject:</strong> ${ticket.subject}</p>
          <p><strong>Assigned To:</strong> ${assigneeName}</p>
        </div>
        <p style="margin-top: 30px;">
          <a href="${ticketUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Ticket
          </a>
        </p>
      </div>
    `;
    const text = `
Ticket Assigned

Hello ${user.first_name || 'User'},

Your support ticket has been assigned to a support agent.

Ticket Number: ${ticket.ticket_number}
Subject: ${ticket.subject}
Assigned To: ${assigneeName}

View your ticket: ${ticketUrl}
    `;

    return await this.sendNotification(user.email, subject, html, text);
  }
}

module.exports = new TicketNotificationService();

