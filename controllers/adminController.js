const { Users, BusinessRequirements, Campaigns, EmailCampaigns, LinkedInProfiles, CampaignRecipients, SystemSettings } = require('../config/model');
const { Op } = require('sequelize');
const Queue = require('bull');
const redisClient = require('../config/redis');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

// Initialize Bull Queue for scraping jobs
const scrapingQueue = new Queue('linkedin-scraping', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  },
});

/**
 * Get all users with filters
 */
exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, is_active, sort = 'created_at', order = 'DESC' } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};

    // Search filter
    if (search) {
      whereClause[Op.or] = [
        { email: { [Op.iLike]: `%${search}%` } },
        { first_name: { [Op.iLike]: `%${search}%` } },
        { last_name: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // Role filter
    if (role) {
      whereClause.role = role;
    }

    // Active status filter
    if (is_active !== undefined) {
      whereClause.is_active = is_active === 'true';
    }

    const { count, rows: users } = await Users.findAndCountAll({
      where: whereClause,
      attributes: { exclude: ['password_hash', 'otp', 'otp_expires_at'] },
      order: [[sort, order]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({
      users,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get user details
 */
exports.getUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await Users.findByPk(id, {
      attributes: { exclude: ['password_hash', 'otp', 'otp_expires_at'] },
      include: [
        {
          model: BusinessRequirements,
          as: 'business_requirements',
          limit: 5,
          order: [['created_at', 'DESC']],
        },
        {
          model: Campaigns,
          as: 'campaigns',
          limit: 5,
          order: [['created_at', 'DESC']],
        },
      ],
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get user statistics
    const userRequirements = await BusinessRequirements.findAll({
      where: { user_id: id },
      attributes: ['id'],
    });
    const requirementIds = userRequirements.map(r => r.id);

    const stats = {
      total_requirements: userRequirements.length,
      total_campaigns: await Campaigns.count({ where: { user_id: id } }),
      total_profiles: await LinkedInProfiles.count({
        where: {
          business_requirement_id: {
            [Op.in]: requirementIds,
          },
        },
      }),
    };

    res.json({ user, stats });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Helper function to create email transporter
const createEmailTransporter = () => {
  const config = {
    host: process.env.OTP_SMTP_HOST || process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.OTP_SMTP_PORT || process.env.SMTP_PORT || '587'),
    secure: process.env.OTP_SMTP_SECURE === 'true' || false,
    auth: {
      user: process.env.OTP_SMTP_USER || process.env.SMTP_USER,
      pass: process.env.OTP_SMTP_PASS || process.env.SMTP_PASS,
    },
  };

  if (!config.auth.user || !config.auth.pass) {
    console.warn('⚠️ Email credentials not configured. Set OTP_SMTP_USER and OTP_SMTP_PASS in .env');
    return null;
  }

  return nodemailer.createTransport(config);
};

/**
 * Update user (suspend/activate, change role, password, name)
 */
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, role, password, is_active, suspended_at } = req.body;
    const userId = parseInt(req.user.userId || req.user.id);

    const user = await Users.findByPk(id, {
      attributes: ['id', 'email', 'first_name', 'last_name', 'password_hash', 'role', 'is_active']
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent admin from modifying themselves in certain ways
    if (parseInt(id) === userId) {
      if (is_active === false) {
        return res.status(400).json({ message: 'Cannot suspend your own account' });
      }
      if (role && role !== 'admin') {
        return res.status(400).json({ message: 'Cannot remove your own admin role' });
      }
    }

    // Check for duplicate email if email is being changed
    if (req.body.email && req.body.email !== user.email) {
      const existingUser = await Users.findOne({ where: { email: req.body.email } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already exists' });
      }
    }

    const updateData = {};
    let passwordChanged = false;

    if (first_name !== undefined) updateData.first_name = first_name;
    if (last_name !== undefined) updateData.last_name = last_name;
    if (role) updateData.role = role;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (suspended_at !== undefined) updateData.suspended_at = suspended_at;

    // Handle password update
    if (password && password.trim() !== '') {
      if (password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters long' });
      }
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      updateData.password_hash = passwordHash;
      passwordChanged = true;
    }

    await user.update(updateData);

    // Reload user to get updated data
    await user.reload({
      attributes: { exclude: ['password_hash', 'otp', 'otp_expires_at'] }
    });

    // Send email notification if password was changed
    if (passwordChanged) {
      try {
        const transporter = createEmailTransporter();
        if (transporter) {
          await transporter.sendMail({
            from: process.env.OTP_EMAIL_FROM || process.env.SMTP_USER || 'noreply@leadstitch.com',
            to: user.email,
            subject: 'Your Password Has Been Changed - Lead Stitch',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                  <h1 style="color: white; margin: 0;">Lead Stitch</h1>
                </div>
                <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
                  <h2 style="color: #1f2937; margin-top: 0;">Password Changed</h2>
                  <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                    Hello ${user.first_name || 'User'},
                  </p>
                  <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                    Your password has been changed by an administrator. Please use the following password to log in:
                  </p>
                  <div style="background: white; border: 2px dashed #2563eb; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
                    <div style="font-size: 18px; font-weight: bold; color: #2563eb; font-family: 'Courier New', monospace; word-break: break-all;">
                      ${password}
                    </div>
                  </div>
                  <p style="color: #ef4444; font-size: 14px; line-height: 1.6; font-weight: bold;">
                    ⚠️ For security reasons, please change this password after logging in.
                  </p>
                  <p style="color: #6b7280; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                    This is an automated message. Please do not reply to this email.
                  </p>
                </div>
              </div>
            `,
          });
        }
      } catch (emailError) {
        console.error('Error sending password change email:', emailError);
        // Don't fail the request if email fails
      }
    }

    res.json({
      message: 'User updated successfully',
      user: user.toJSON(),
      passwordChanged,
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

/**
 * Delete user
 */
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (id === req.user.userId) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const user = await Users.findByPk(id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await user.destroy();

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get system health status
 */
exports.getSystemHealth = async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {},
    };

    // Database health
    try {
      await Users.findOne({ limit: 1 });
      health.services.database = { status: 'healthy' };
    } catch (error) {
      health.services.database = { status: 'unhealthy', error: error.message };
      health.status = 'degraded';
    }

    // Redis health
    try {
      const pingResult = await redisClient.ping();
      health.services.redis = { status: 'healthy', ping: pingResult };
    } catch (error) {
      health.services.redis = { status: 'unhealthy', error: error.message };
      health.status = 'degraded';
    }

    // Queue health
    try {
      const queueStats = await scrapingQueue.getJobCounts();
      health.services.queue = { status: 'healthy', stats: queueStats };
    } catch (error) {
      health.services.queue = { status: 'unhealthy', error: error.message };
      health.status = 'degraded';
    }

    res.json(health);
  } catch (error) {
    console.error('System health error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get platform statistics
 */
exports.getPlatformStats = async (req, res) => {
  try {
    const stats = {
      users: {
        total: await Users.count(),
        active: await Users.count({ where: { is_active: true } }),
        admins: await Users.count({ where: { role: 'admin' } }),
        new_today: await Users.count({
          where: {
            created_at: {
              [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
        }),
        new_this_month: await Users.count({
          where: {
            created_at: {
              [Op.gte]: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        }),
      },
      requirements: {
        total: await BusinessRequirements.count(),
        completed: await BusinessRequirements.count({ where: { status: 'closed' } }),
      },
      campaigns: {
        total: await Campaigns.count(),
        active: await Campaigns.count({ where: { status: { [Op.in]: ['active', 'scheduled'] } } }),
      },
      email_campaigns: {
        total: await EmailCampaigns.count(),
        sent: await EmailCampaigns.sum('sent_count') || 0,
        delivered: await EmailCampaigns.sum('delivered_count') || 0,
        opened: await EmailCampaigns.sum('opened_count') || 0,
        clicked: await EmailCampaigns.sum('clicked_count') || 0,
      },
      profiles: {
        total: await LinkedInProfiles.count(),
      },
    };

    res.json(stats);
  } catch (error) {
    console.error('Platform stats error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get queue status
 */
exports.getQueueStatus = async (req, res) => {
  try {
    const jobCounts = await scrapingQueue.getJobCounts();
    const jobs = await scrapingQueue.getJobs(['active', 'waiting', 'completed', 'failed'], 0, 20);

    // Get job states asynchronously
    const recentJobs = await Promise.all(
      jobs.map(async (job) => ({
        id: job.id,
        name: job.name,
        data: job.data,
        state: await job.getState(),
        progress: job.progress(),
        createdAt: job.timestamp,
        processedAt: job.processedOn,
        finishedAt: job.finishedOn,
      }))
    );

    res.json({
      counts: jobCounts,
      recent_jobs: recentJobs,
    });
  } catch (error) {
    console.error('Queue status error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get all campaigns (admin view)
 */
exports.getCampaigns = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (status) whereClause.status = status;
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows: campaigns } = await Campaigns.findAndCountAll({
      where: whereClause,
      include: [{
        model: Users,
        as: 'user',
        attributes: ['id', 'email', 'first_name', 'last_name'],
      }],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({
      campaigns,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error('Get campaigns error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get scraping statistics
 */
exports.getScrapingStats = async (req, res) => {
  try {
    const jobCounts = await scrapingQueue.getJobCounts();

    // Get recent completed jobs
    const completedJobs = await scrapingQueue.getJobs(['completed'], 0, 100);

    const stats = {
      queue: jobCounts,
      recent_completed: completedJobs.length,
      average_time: null, // Can calculate from job data if needed
    };

    res.json(stats);
  } catch (error) {
    console.error('Scraping stats error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get all system settings
 */
exports.getSettings = async (req, res) => {
  try {
    const settings = await SystemSettings.findAll({
      order: [['key', 'ASC']],
      include: [{
        model: Users,
        as: 'updatedByUser',
        attributes: ['id', 'email', 'first_name', 'last_name'],
        required: false,
      }],
    });

    res.json({ settings });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get specific setting by key
 */
exports.getSetting = async (req, res) => {
  try {
    const { key } = req.params;

    const setting = await SystemSettings.findOne({
      where: { key },
      include: [{
        model: Users,
        as: 'updatedByUser',
        attributes: ['id', 'email', 'first_name', 'last_name'],
        required: false,
      }],
    });

    if (!setting) {
      return res.status(404).json({ message: 'Setting not found' });
    }

    res.json(setting);
  } catch (error) {
    console.error('Get setting error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Update system setting
 */
exports.updateSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const userId = req.user?.userId || req.user?.id;

    if (value === undefined || value === null) {
      return res.status(400).json({ message: 'Value is required' });
    }

    // Validation for records_per_role
    if (key === 'records_per_role') {
      const numValue = parseInt(value, 10);
      if (isNaN(numValue) || numValue < 1 || numValue > 100) {
        return res.status(400).json({ 
          message: 'records_per_role must be an integer between 1 and 100' 
        });
      }
    }

    // Find or create setting
    let setting = await SystemSettings.findOne({ where: { key } });

    if (setting) {
      // Update existing setting
      await setting.update({
        value: String(value),
        updated_by: userId,
        updated_at: new Date(),
      });
    } else {
      // Create new setting
      const descriptions = {
        'records_per_role': 'Number of LinkedIn profiles to scrape per decision maker role',
      };

      setting = await SystemSettings.create({
        key,
        value: String(value),
        description: descriptions[key] || `System setting: ${key}`,
        updated_by: userId,
      });
    }

    // Reload with associations
    await setting.reload({
      include: [{
        model: Users,
        as: 'updatedByUser',
        attributes: ['id', 'email', 'first_name', 'last_name'],
        required: false,
      }],
    });

    console.log(`✅ Setting updated: ${key} = ${value} by user ${userId}`);

    res.json({
      message: 'Setting updated successfully',
      setting,
    });
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

