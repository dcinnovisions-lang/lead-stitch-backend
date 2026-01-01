const emailService = require('../services/emailService');
const { encrypt, decrypt } = require('../utils/encryption');
const { EmailSMTPCredentials, EmailCampaigns, EmailTemplates, PsqlSequelize } = require('../config/model');
const { Op } = require('sequelize');

/**
 * Email Controller - Handles all email-related operations
 */

// Get all SMTP credentials for user
exports.getSMTPCredentials = async (req, res) => {
    try {
        const userId = req.user.userId;

        const credentials = await EmailSMTPCredentials.findAll({
            where: { user_id: userId },
            attributes: ['id', 'provider', 'email', 'smtp_host', 'smtp_port', 'smtp_secure', 'display_name', 'is_active', 'is_verified', 'last_used_at', 'created_at'],
            order: [['created_at', 'DESC']]
        });

        res.json({
            success: true,
            credentials: credentials,
        });
    } catch (error) {
        console.error('Get SMTP credentials error:', error);
        res.status(500).json({
            success: false,
            message: 'Unable to retrieve SMTP credentials. Please try again later or contact support if the problem persists.'
        });
    }
};

// Get single SMTP credential
exports.getSMTPCredential = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        const credential = await EmailSMTPCredentials.findOne({
            where: {
                id: id,
                user_id: userId
            },
            attributes: ['id', 'provider', 'email', 'smtp_host', 'smtp_port', 'smtp_secure', 'display_name', 'is_active', 'is_verified', 'last_used_at', 'created_at']
        });

        if (!credential) {
            return res.status(404).json({ success: false, message: 'SMTP credential not found' });
        }

        res.json({
            success: true,
            credential: credential,
        });
    } catch (error) {
        console.error('Get SMTP credential error:', error);
        res.status(500).json({
            success: false,
            message: 'Unable to retrieve SMTP credential. Please try again later or contact support if the problem persists.'
        });
    }
};

// Create SMTP credentials
exports.createSMTPCredentials = async (req, res) => {
    try {
        const userId = req.user.userId;
        const {
            provider,
            email,
            smtp_host,
            smtp_port,
            smtp_secure,
            username,
            password,
            display_name,
        } = req.body;

        // Validation
        if (!provider || !email || !smtp_host || !smtp_port || !username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: provider, email, smtp_host, smtp_port, username, password',
            });
        }

        // Clean and validate password
        // Gmail and Outlook App Passwords often have spaces - remove them
        let cleanedPassword = password.trim();

        // Remove spaces from App Password (Gmail and Outlook display them with spaces but they should be used without)
        if (provider === 'gmail' || email.includes('@gmail.com')) {
            cleanedPassword = cleanedPassword.replace(/\s+/g, '');
            // Gmail App Passwords are 16 characters without spaces
            if (cleanedPassword.length !== 16) {
                return res.status(400).json({
                    success: false,
                    message: 'Gmail App Password should be 16 characters (without spaces). Please check your App Password.',
                });
            }
        }

        // Outlook App Passwords might also have spaces - remove them
        if (provider === 'outlook' || email.includes('@outlook.com') || email.includes('@hotmail.com') || email.includes('@live.com')) {
            cleanedPassword = cleanedPassword.replace(/\s+/g, '');
            // Outlook App Passwords are typically 16 characters, but can vary
            if (cleanedPassword.length < 8) {
                return res.status(400).json({
                    success: false,
                    message: 'Outlook App Password seems too short. Please check that you copied the complete App Password.',
                });
            }
        }

        // Ensure username is the full email address for Gmail and Outlook
        let finalUsername = username.trim();
        if ((provider === 'gmail' || email.includes('@gmail.com')) && !finalUsername.includes('@')) {
            finalUsername = email; // Use email as username if username doesn't contain @
        }
        // For Outlook/Hotmail, ALWAYS use the full email address as username
        if (provider === 'outlook' || email.includes('@outlook.com') || email.includes('@hotmail.com') || email.includes('@live.com')) {
            finalUsername = email; // Always use full email as username for Outlook
        }

        // Encrypt password using AES-256 (reversible encryption for SMTP)
        const passwordEncrypted = encrypt(cleanedPassword);

        // Insert SMTP credentials
        const credential = await EmailSMTPCredentials.create({
            user_id: userId,
            provider: provider,
            email: email,
            smtp_host: smtp_host,
            smtp_port: parseInt(smtp_port),
            smtp_secure: smtp_secure || false,
            username: finalUsername,
            password_encrypted: passwordEncrypted,
            display_name: display_name
        });

        // Test connection
        try {
            const testResult = await emailService.testSMTPConnection(credential.id);
            if (testResult.success) {
                await credential.update({ is_verified: true });
                credential.is_verified = true;
            }
        } catch (testError) {
            console.log('SMTP test failed, but credentials saved:', testError.message);
        }

        res.json({
            success: true,
            message: 'SMTP credentials created successfully',
            credential: {
                id: credential.id,
                provider: credential.provider,
                email: credential.email,
                smtp_host: credential.smtp_host,
                smtp_port: credential.smtp_port,
                smtp_secure: credential.smtp_secure,
                display_name: credential.display_name,
                is_active: credential.is_active,
                is_verified: credential.is_verified
            },
        });
    } catch (error) {
        console.error('Create SMTP credentials error:', error);

        // Check for duplicate
        if (error.code === '23505') {
            return res.status(400).json({
                success: false,
                message: 'SMTP credentials for this email already exist',
            });
        }

        // Check for foreign key violation
        if (error.code === '23503') {
            return res.status(400).json({
                success: false,
                message: 'Invalid user account. Please log out and log in again.',
            });
        }

        res.status(500).json({
            success: false,
            message: 'Unable to save SMTP credentials at this time. Please try again in a few moments. If the problem continues, please contact support.'
        });
    }
};

// Update SMTP credentials
exports.updateSMTPCredentials = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const {
            provider,
            email,
            smtp_host,
            smtp_port,
            smtp_secure,
            username,
            password,
            display_name,
            is_active,
        } = req.body;

        // Check if credential exists and belongs to user
        const existing = await EmailSMTPCredentials.findOne({
            where: {
                id: id,
                user_id: userId
            }
        });

        if (!existing) {
            return res.status(404).json({ success: false, message: 'SMTP credential not found' });
        }

        // Build update data object
        const updateData = {};

        if (provider !== undefined) updateData.provider = provider;
        if (email !== undefined) updateData.email = email;
        if (smtp_host !== undefined) updateData.smtp_host = smtp_host;
        if (smtp_port !== undefined) updateData.smtp_port = parseInt(smtp_port);
        if (smtp_secure !== undefined) updateData.smtp_secure = smtp_secure;
        if (username !== undefined) updateData.username = username;
        if (password !== undefined) {
            updateData.password_encrypted = encrypt(password);
        }
        if (display_name !== undefined) updateData.display_name = display_name;
        if (is_active !== undefined) updateData.is_active = is_active;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }

        updateData.updated_at = new Date();

        await existing.update(updateData);

        res.json({
            success: true,
            message: 'SMTP credentials updated successfully',
        });
    } catch (error) {
        console.error('Update SMTP credentials error:', error);

        if (error.code === '23505') {
            return res.status(400).json({
                success: false,
                message: 'SMTP credentials for this email already exist. Please use a different email.',
            });
        }

        res.status(500).json({
            success: false,
            message: 'Unable to update SMTP credentials at this time. Please try again in a few moments. If the problem continues, please contact support.'
        });
    }
};

// Delete SMTP credentials
exports.deleteSMTPCredentials = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        // Check if credential exists and belongs to user
        const existing = await EmailSMTPCredentials.findOne({
            where: {
                id: id,
                user_id: userId
            }
        });

        if (!existing) {
            return res.status(404).json({ success: false, message: 'SMTP credential not found' });
        }

        // Check if credential is used in any active campaigns
        const campaigns = await EmailCampaigns.findAll({
            where: {
                smtp_credential_id: id,
                status: ['scheduled', 'sending']
            },
            attributes: ['id']
        });

        if (campaigns.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete SMTP credentials that are used in active campaigns',
            });
        }

        await existing.destroy();

        res.json({
            success: true,
            message: 'SMTP credentials deleted successfully',
        });
    } catch (error) {
        console.error('Delete SMTP credentials error:', error);
        res.status(500).json({
            success: false,
            message: 'Unable to delete SMTP credentials at this time. Please try again in a few moments. If the problem continues, please contact support.'
        });
    }
};

// Test SMTP connection
exports.testSMTPConnection = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        // Verify ownership
        const existing = await EmailSMTPCredentials.findOne({
            where: {
                id: id,
                user_id: userId
            }
        });

        if (!existing) {
            return res.status(404).json({ success: false, message: 'SMTP credential not found' });
        }

        const result = await emailService.testSMTPConnection(id);
        res.json(result);
    } catch (error) {
        console.error('Test SMTP connection error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Send test email
exports.sendTestEmail = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const { toEmail } = req.body;

        if (!toEmail) {
            return res.status(400).json({ success: false, message: 'toEmail is required' });
        }

        // Verify ownership
        const existing = await EmailSMTPCredentials.findOne({
            where: {
                id: id,
                user_id: userId
            }
        });

        if (!existing) {
            return res.status(404).json({ success: false, message: 'SMTP credential not found' });
        }

        const result = await emailService.sendTestEmail(id, toEmail);
        res.json(result);
    } catch (error) {
        console.error('Send test email error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Track email open (pixel) - Production Optimized
exports.trackEmailOpen = async (req, res) => {
  // Transparent 1x1 GIF pixel (base64 encoded)
  const pixel = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );

  try {
    const { pixelId } = req.params;
    
    // Extract IP address (handle proxies)
    const ipAddress = req.ip || 
                     req.connection.remoteAddress || 
                     (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 
                     'unknown';
    
    const userAgent = req.get('user-agent') || 'unknown';

    // Log only in development
    if (process.env.NODE_ENV !== 'production') {
      console.log('📧 Tracking pixel accessed:', {
        pixelId,
        ipAddress,
        userAgent: userAgent.substring(0, 100),
        timestamp: new Date().toISOString()
      });
    }

    // Track the open event (non-blocking - don't wait for it)
    emailService.trackEmailOpen(pixelId, ipAddress, userAgent).catch(err => {
      // Log error but don't fail the request
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error tracking email open:', err);
      }
    });

    // Return pixel immediately with optimized headers
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Content-Type-Options': 'nosniff',
      // Allow CORS for email clients
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    });
    res.end(pixel);
  } catch (error) {
    // Always return pixel even on error (for better deliverability)
    if (process.env.NODE_ENV !== 'production') {
      console.error('Track email open error:', error);
    }
    res.writeHead(200, { 
      'Content-Type': 'image/gif', 
      'Content-Length': pixel.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(pixel);
  }
};

// Track link click - Production Optimized
exports.trackLinkClick = async (req, res) => {
    try {
        const { linkId } = req.params;
        
        // Extract IP address (handle proxies)
        const ipAddress = req.ip || 
                         req.connection.remoteAddress || 
                         (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 
                         'unknown';
        
        const userAgent = req.get('user-agent') || 'unknown';

        // Track click (non-blocking)
        const originalUrl = await emailService.trackLinkClick(linkId, ipAddress, userAgent);

        if (originalUrl) {
            // Redirect with security headers
            res.writeHead(302, {
                'Location': originalUrl,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'X-Content-Type-Options': 'nosniff'
            });
            res.end();
        } else {
            res.status(404).send('Link not found');
        }
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('Track link click error:', error);
        }
        // Try to redirect to a safe URL or show error page
        res.status(500).send('Error tracking link. Please try again.');
    }
};

// Handle unsubscribe
exports.handleUnsubscribe = async (req, res) => {
  try {
    const { email, recipientId } = req.query || req.body;
    
    if (!email && !recipientId) {
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h2>Unsubscribe Failed</h2>
            <p>Invalid unsubscribe request. Please contact support if you need assistance.</p>
          </body>
        </html>
      `);
    }

    const result = await emailService.handleUnsubscribe(email, recipientId);

    if (result.success) {
      res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h2 style="color: #4CAF50;">Successfully Unsubscribed</h2>
            <p>You have been successfully unsubscribed from our mailing list.</p>
            <p style="color: #666; font-size: 14px;">You will no longer receive emails from us.</p>
          </body>
        </html>
      `);
    } else {
      res.status(500).send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h2 style="color: #f44336;">Unsubscribe Failed</h2>
            <p>There was an error processing your unsubscribe request.</p>
            <p style="color: #666; font-size: 14px;">Please try again or contact support.</p>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('Handle unsubscribe error:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h2 style="color: #f44336;">Error</h2>
          <p>An error occurred while processing your request.</p>
        </body>
      </html>
    `);
  }
};

// Get common SMTP providers configuration
exports.getSMTPProviders = async (req, res) => {
    try {
        const providers = [
            {
                name: 'Gmail',
                provider: 'gmail',
                smtp_host: 'smtp.gmail.com',
                smtp_port: 587,
                smtp_secure: false,
                instructions: 'Use Gmail App Password (not your regular password). Enable 2FA and generate App Password from Google Account settings.',
            },
            {
                name: 'Outlook/Hotmail',
                provider: 'outlook',
                smtp_host: 'smtp-mail.outlook.com',
                smtp_port: 587,
                smtp_secure: false,
                instructions: 'Use your Outlook email and password. May require App Password if 2FA is enabled.',
            },
            {
                name: 'Yahoo',
                provider: 'yahoo',
                smtp_host: 'smtp.mail.yahoo.com',
                smtp_port: 587,
                smtp_secure: false,
                instructions: 'Use Yahoo App Password. Generate from Yahoo Account Security settings.',
            },
            {
                name: 'Custom SMTP',
                provider: 'custom',
                smtp_host: '',
                smtp_port: 587,
                smtp_secure: false,
                instructions: 'Enter your custom SMTP server details.',
            },
        ];

        res.json({
            success: true,
            providers,
        });
    } catch (error) {
        console.error('Get SMTP providers error:', error);
        res.status(500).json({
            success: false,
            message: 'Unable to load SMTP providers. Please try again later or contact support if the problem persists.'
        });
    }
};

// Template Management
exports.getTemplates = async (req, res) => {
    try {
        const userId = req.user.userId;
        const templates = await EmailTemplates.findAll({
            where: { user_id: userId },
            attributes: ['id', 'name', 'subject', 'body_html', 'body_text', 'variables', 'is_default', 'created_at', 'updated_at'],
            order: [['created_at', 'DESC']]
        });
        res.json(templates);
    } catch (error) {
        console.error('Error fetching templates:', error);
        res.status(500).json({ message: 'Failed to fetch templates', error: error.message });
    }
};

exports.getTemplate = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const template = await EmailTemplates.findOne({
            where: {
                id: id,
                user_id: userId
            },
            attributes: ['id', 'name', 'subject', 'body_html', 'body_text', 'variables', 'is_default', 'created_at', 'updated_at']
        });
        if (!template) {
            return res.status(404).json({ message: 'Template not found' });
        }
        res.json(template);
    } catch (error) {
        console.error('Error fetching template:', error);
        res.status(500).json({ message: 'Failed to fetch template', error: error.message });
    }
};

exports.createTemplate = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { name, subject, body_html, body_text, variables, is_default } = req.body;

        if (!name || !subject || !body_html) {
            return res.status(400).json({ message: 'Name, subject, and body_html are required' });
        }

        // If setting as default, unset other defaults
        if (is_default) {
            await EmailTemplates.update(
                { is_default: false },
                { where: { user_id: userId } }
            );
        }

        // Prepare variables - Sequelize handles JSONB automatically from objects
        let variablesObj = null;
        if (variables) {
            if (typeof variables === 'object' && variables !== null) {
                variablesObj = variables;
            } else if (typeof variables === 'string' && variables.trim() !== '') {
                try {
                    variablesObj = JSON.parse(variables);
                } catch {
                    variablesObj = {};
                }
            }
        }

        // Insert template - Sequelize handles JSONB conversion automatically
        const template = await EmailTemplates.create({
            user_id: userId,
            name: name,
            subject: subject,
            body_html: body_html,
            body_text: body_text || null,
            variables: variablesObj,
            is_default: is_default || false
        });

        res.status(201).json(template);
    } catch (error) {
        console.error('Error creating template:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            detail: error.detail,
            hint: error.hint,
            stack: error.stack
        });

        // Check if table doesn't exist
        if (error.message && error.message.includes('does not exist')) {
            return res.status(500).json({
                message: 'Database table not found. Please run the email system migration.',
                error: error.message,
                hint: 'Run: psql -d your_database -f database/migration_add_email_system.sql'
            });
        }

        res.status(500).json({
            message: 'Failed to create template',
            error: error.message,
            detail: error.detail || undefined,
            hint: error.hint || undefined
        });
    }
};

exports.updateTemplate = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const { name, subject, body_html, body_text, variables, is_default } = req.body;

        // Check if template exists
        const template = await EmailTemplates.findOne({
            where: {
                id: id,
                user_id: userId
            }
        });
        if (!template) {
            return res.status(404).json({ message: 'Template not found' });
        }

        // If setting as default, unset other defaults
        if (is_default) {
            await EmailTemplates.update(
                { is_default: false },
                { where: { user_id: userId, id: { [Op.ne]: id } } }
            );
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (subject !== undefined) updateData.subject = subject;
        if (body_html !== undefined) updateData.body_html = body_html;
        if (body_text !== undefined) updateData.body_text = body_text;
        if (variables !== undefined) {
            updateData.variables = typeof variables === 'string' ? JSON.parse(variables) : variables;
        }
        if (is_default !== undefined) updateData.is_default = is_default;
        updateData.updated_at = new Date();

        await template.update(updateData);
        res.json(template);
    } catch (error) {
        console.error('Error updating template:', error);
        res.status(500).json({ message: 'Failed to update template', error: error.message });
    }
};

exports.deleteTemplate = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        const template = await EmailTemplates.findOne({
            where: {
                id: id,
                user_id: userId
            }
        });

        if (!template) {
            return res.status(404).json({ message: 'Template not found' });
        }

        await template.destroy();
        res.json({ message: 'Template deleted successfully' });
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ message: 'Failed to delete template', error: error.message });
    }
  }