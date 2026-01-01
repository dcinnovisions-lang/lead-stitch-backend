const nodemailer = require('nodemailer');
const { Users, BusinessRequirements } = require('../config/model');

/**
 * Scraping Notification Service
 * Sends email notifications for scraping job completion
 */
class ScrapingNotificationService {
  constructor() {
    // Use OTP SMTP configuration (same as password reset emails)
    this.transporter = null;
    this.initialized = false;
  }

  async initializeTransporter() {
    // Skip if already initialized
    if (this.initialized) return;

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
        // Verify connection
        await this.transporter.verify();
      } else {
        console.warn('⚠️  SMTP not configured. Scraping email notifications will be disabled.');
        console.warn('⚠️  Set OTP_SMTP_HOST, OTP_SMTP_PORT, OTP_SMTP_USER, OTP_SMTP_PASS in .env to enable notifications.');
      }
      this.initialized = true;
    } catch (error) {
      console.error('❌ Error initializing email transporter:', error.message);
      this.transporter = null;
      this.initialized = true;
    }
  }

  // Ensure transporter is ready before sending
  async ensureTransporterReady() {
    if (!this.initialized) {
      await this.initializeTransporter();
    }
    return !!this.transporter;
  }

  /**
   * Send scraping completion notification
   */
  async sendScrapingCompletionNotification(requirementId, profilesCount, success = true, errorMessage = null) {
    console.log(`\n📧 [Email Notification] Starting email notification for requirement ${requirementId}`);
    console.log(`📧 [Email Notification] Profiles count: ${profilesCount}, Success: ${success}`);

    // Ensure transporter is ready
    const isReady = await this.ensureTransporterReady();
    if (!isReady || !this.transporter) {
      console.error('❌ [Email Notification] SMTP not configured or not ready');
      console.error('❌ [Email Notification] Check OTP_SMTP_HOST, OTP_SMTP_PORT, OTP_SMTP_USER, OTP_SMTP_PASS in .env');
      return false;
    }

    try {
      // Get requirement first
      const requirement = await BusinessRequirements.findOne({
        where: { id: requirementId }
      });

      if (!requirement) {
        console.error(`❌ [Email Notification] Requirement ${requirementId} not found`);
        return false;
      }

      console.log(`✅ [Email Notification] Requirement found: ${requirement.operation_name || requirementId}`);
      console.log(`📧 [Email Notification] User ID: ${requirement.user_id}`);

      // Get user separately (more reliable than include)
      const user = await Users.findByPk(requirement.user_id, {
        attributes: ['email', 'first_name', 'last_name']
      });

      if (!user) {
        console.error(`❌ [Email Notification] User not found for ID: ${requirement.user_id}`);
        return false;
      }

      if (!user.email) {
        console.error(`❌ [Email Notification] User email is missing for user ID: ${requirement.user_id}`);
        return false;
      }

      console.log(`✅ [Email Notification] User found: ${user.email}`);
      console.log(`✅ [Email Notification] User name: ${user.first_name || ''} ${user.last_name || ''}`);
      const userEmail = user.email;
      const userName = user.first_name && user.last_name
        ? `${user.first_name} ${user.last_name}`
        : user.first_name || user.last_name || 'User';
      const requirementName = requirement.operation_name || 'Your Requirement';

      const emailFrom = process.env.OTP_EMAIL_FROM || process.env.SMTP_USER || process.env.OTP_SMTP_USER || 'noreply@leadstitch.com';

      if (success) {
        // Success notification
        const subject = `✅ LinkedIn Scraping Completed - ${profilesCount} Profiles Found`;
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
              .success-badge { background: #10b981; color: white; padding: 8px 16px; border-radius: 20px; display: inline-block; font-weight: bold; margin: 10px 0; }
              .stats { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
              .stat-item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
              .stat-item:last-child { border-bottom: none; }
              .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
              .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎉 Scraping Completed Successfully!</h1>
              </div>
              <div class="content">
                <p>Hi ${userName},</p>
                <p>Great news! Your LinkedIn scraping job for <strong>${requirementName}</strong> has completed successfully.</p>
                
                <div class="stats">
                  <div class="stat-item">
                    <span><strong>Profiles Scraped:</strong></span>
                    <span><strong>${profilesCount}</strong></span>
                  </div>
                  <div class="stat-item">
                    <span><strong>Requirement:</strong></span>
                    <span>${requirementName}</span>
                  </div>
                </div>

                <p>You can now:</p>
                <ul>
                  <li>View all scraped profiles in your Leads page</li>
                  <li>Enrich profiles with email addresses using Apollo.io</li>
                  <li>Create email campaigns to reach out to your leads</li>
                </ul>

                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/requirements/${requirementId}" class="button">View Your Leads</a>

                <div class="footer">
                  <p>This is an automated notification from Lead Stitch.</p>
                  <p>If you have any questions, please contact our support team.</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `;

        const text = `
          Hi ${userName},

          Great news! Your LinkedIn scraping job for "${requirementName}" has completed successfully.

          Profiles Scraped: ${profilesCount}
          Requirement: ${requirementName}

          You can now view all scraped profiles, enrich them with email addresses, and create email campaigns.

          View your leads: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/requirements/${requirementId}

          This is an automated notification from Lead Stitch.
        `;

        await this.transporter.sendMail({
          from: emailFrom,
          to: userEmail,
          subject: subject,
          html: html,
          text: text,
        });

        console.log(`✅ Scraping completion email sent to ${userEmail} for requirement ${requirementId}`);
        return true;
      } else {
        // Failure notification
        const subject = `❌ LinkedIn Scraping Failed - ${requirementName}`;
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
              .error-badge { background: #ef4444; color: white; padding: 8px 16px; border-radius: 20px; display: inline-block; font-weight: bold; margin: 10px 0; }
              .error-box { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px; }
              .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
              .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>⚠️ Scraping Job Failed</h1>
              </div>
              <div class="content">
                <p>Hi ${userName},</p>
                <p>We encountered an issue while scraping LinkedIn profiles for <strong>${requirementName}</strong>.</p>
                
                <div class="error-box">
                  <p><strong>Error Details:</strong></p>
                  <p>${errorMessage || 'An unknown error occurred during scraping.'}</p>
                </div>

                <p>Please try the following:</p>
                <ul>
                  <li>Check your LinkedIn credentials in the Integrations page</li>
                  <li>Verify that the Python scraping service is running</li>
                  <li>Try starting the scraping job again</li>
                  <li>Contact support if the issue persists</li>
                </ul>

                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/requirements/${requirementId}" class="button">View Requirement</a>

                <div class="footer">
                  <p>This is an automated notification from Lead Stitch.</p>
                  <p>If you have any questions, please contact our support team.</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `;

        const text = `
          Hi ${userName},

          We encountered an issue while scraping LinkedIn profiles for "${requirementName}".

          Error: ${errorMessage || 'An unknown error occurred during scraping.'}

          Please check your LinkedIn credentials and try again, or contact support if the issue persists.

          View requirement: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/requirements/${requirementId}

          This is an automated notification from Lead Stitch.
        `;

        console.log(`📧 [Email Notification] Sending failure email to: ${userEmail}`);
        console.log(`📧 [Email Notification] From: ${emailFrom}`);
        console.log(`📧 [Email Notification] Subject: ${subject}`);

        const mailResult = await this.transporter.sendMail({
          from: emailFrom,
          to: userEmail,
          subject: subject,
          html: html,
          text: text,
        });

        console.log(`✅ [Email Notification] Failure email sent successfully!`);
        console.log(`✅ [Email Notification] Message ID: ${mailResult.messageId}`);
        console.log(`✅ [Email Notification] Response: ${JSON.stringify(mailResult.response)}`);
        return true;
      }
    } catch (error) {
      console.error('❌ [Email Notification] Error sending email:', error.message);
      console.error('❌ [Email Notification] Error stack:', error.stack);
      if (error.response) {
        console.error('❌ [Email Notification] SMTP Response:', error.response);
      }
      return false;
    }
  }
}

module.exports = new ScrapingNotificationService();

