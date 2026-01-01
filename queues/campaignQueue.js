const Bull = require('bull');
const emailService = require('../services/emailService');
const { Campaigns, CampaignRecipients, EmailCampaigns, EmailSMTPCredentials } = require('../config/model');
const { Op } = require('sequelize');
const { 
  emitCampaignProgress, 
  emitCampaignStats, 
  emitRecipientUpdate,
  emitCampaignStatusChange
} = require('../socket/socketServer');

/**
 * Campaign Sending Queue
 * Uses Bull (Redis-based) for async email campaign processing
 */
const campaignQueue = new Bull('campaign-sending', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000
    },
    removeOnFail: {
      age: 7 * 24 * 3600 // Keep failed jobs for 7 days
    }
  }
});

/**
 * Helper function to get campaign statistics
 */
async function getCampaignStats(campaignId) {
  try {
    const [stats] = await CampaignRecipients.findAll({
      where: { campaign_id: campaignId },
      attributes: [
        [CampaignRecipients.sequelize.fn('COUNT', CampaignRecipients.sequelize.col('id')), 'total'],
        [
          CampaignRecipients.sequelize.fn(
            'COUNT',
            CampaignRecipients.sequelize.literal("CASE WHEN status = 'sent' OR sent_at IS NOT NULL THEN 1 END")
          ),
          'sent'
        ],
        [
          CampaignRecipients.sequelize.fn(
            'COUNT',
            CampaignRecipients.sequelize.literal("CASE WHEN status = 'delivered' OR delivered_at IS NOT NULL THEN 1 END")
          ),
          'delivered'
        ],
        [
          CampaignRecipients.sequelize.fn(
            'COUNT',
            CampaignRecipients.sequelize.literal("CASE WHEN status = 'opened' OR opened_at IS NOT NULL THEN 1 END")
          ),
          'opened'
        ],
        [
          CampaignRecipients.sequelize.fn(
            'COUNT',
            CampaignRecipients.sequelize.literal("CASE WHEN status = 'clicked' OR clicked_at IS NOT NULL THEN 1 END")
          ),
          'clicked'
        ],
        [
          CampaignRecipients.sequelize.fn(
            'COUNT',
            CampaignRecipients.sequelize.literal("CASE WHEN status = 'replied' OR replied_at IS NOT NULL THEN 1 END")
          ),
          'replied'
        ],
        [
          CampaignRecipients.sequelize.fn(
            'COUNT',
            CampaignRecipients.sequelize.literal("CASE WHEN status = 'bounced' OR bounced_at IS NOT NULL THEN 1 END")
          ),
          'bounced'
        ],
        [
          CampaignRecipients.sequelize.fn(
            'COUNT',
            CampaignRecipients.sequelize.literal("CASE WHEN status = 'failed' OR error_message IS NOT NULL THEN 1 END")
          ),
          'failed'
        ]
      ],
      raw: true
    });

    return {
      total: parseInt(stats?.total || 0),
      sent: parseInt(stats?.sent || 0),
      delivered: parseInt(stats?.delivered || 0),
      opened: parseInt(stats?.opened || 0),
      clicked: parseInt(stats?.clicked || 0),
      replied: parseInt(stats?.replied || 0),
      bounced: parseInt(stats?.bounced || 0),
      failed: parseInt(stats?.failed || 0)
    };
  } catch (error) {
    console.error('Error getting campaign stats:', error);
    return {
      total: 0,
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      replied: 0,
      bounced: 0,
      failed: 0
    };
  }
}

/**
 * Process campaign sending jobs
 */
campaignQueue.process('send-campaign', async (job) => {
  const { campaignId, userId } = job.data;
  
  console.log(`📧 ========== PROCESSING CAMPAIGN SEND JOB ==========`);
  console.log(`📧 Campaign ID: ${campaignId}`);
  console.log(`👤 User ID: ${userId}`);
  console.log(`🆔 Job ID: ${job.id}`);

  try {
    // Get campaign details
    const campaign = await Campaigns.findOne({
      where: { id: campaignId, user_id: userId },
      include: [{
        model: EmailCampaigns,
        required: false,
        as: 'email_campaign'
      }]
    });

    if (!campaign) {
      throw new Error('Campaign not found or access denied');
    }

    const campaignData = campaign.toJSON();
    const emailCampaign = campaignData.email_campaign || {};
    
    const smtpCredentialId = emailCampaign.smtp_credential_id;
    const subject = emailCampaign.subject;
    const bodyHtml = emailCampaign.body_html;
    const bodyText = emailCampaign.body_text;

    if (!smtpCredentialId) {
      throw new Error('Campaign does not have SMTP credentials configured');
    }

    if (!subject || !bodyHtml) {
      throw new Error('Campaign is missing subject or body content');
    }

    // Get recipients
    const recipients = await CampaignRecipients.findAll({
      where: {
        campaign_id: campaignId,
        status: { [Op.notIn]: ['sent', 'delivered'] }
      },
      order: [['created_at', 'ASC']]
    });

    const totalRecipients = recipients.length;

    if (totalRecipients === 0) {
      throw new Error('No recipients found or all recipients have already been sent');
    }

    console.log(`📬 Found ${totalRecipients} recipients to send`);

    // Update campaign status
    await Campaigns.update({ status: 'sending' }, { where: { id: campaignId } });
    
    try {
      await EmailCampaigns.update(
        { 
          status: 'sending', 
          started_at: new Date(),
          total_recipients: totalRecipients
        },
        { where: { id: campaignId } }
      );
    } catch (e) {
      console.log('ℹ️ Could not update email_campaigns (table or record may not exist)');
    }

    // Emit status change
    emitCampaignStatusChange(campaignId, 'sending');

    // Emit initial progress
    emitCampaignProgress(campaignId, {
      status: 'sending',
      total: totalRecipients,
      sent: 0,
      failed: 0,
      progress: 0
    });

    let sentCount = 0;
    let failedCount = 0;
    const errors = [];

    // Send emails
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const recipientData = recipient.toJSON();
      
      try {
        // Parse personalization data
        let personalization = {};
        if (recipientData.personalization_data) {
          try {
            personalization = typeof recipientData.personalization_data === 'string'
              ? JSON.parse(recipientData.personalization_data)
              : recipientData.personalization_data;
          } catch (e) {
            console.warn(`⚠️ Failed to parse personalization data for recipient ${recipientData.id}:`, e.message);
          }
        }

        // Get SMTP credentials to use correct from email
        const smtpCreds = await EmailSMTPCredentials.findByPk(smtpCredentialId, {
          attributes: ['email', 'display_name']
        });

        // Send email
        // CRITICAL: fromEmail must match SMTP account email to avoid relay errors
        // The emailService will validate and override if needed
        const emailResult = await emailService.sendEmail({
          smtpCredentialId,
          to: recipientData.email,
          subject,
          html: bodyHtml,
          text: bodyText,
          fromName: emailCampaign.display_name || smtpCreds?.display_name || 'Lead Stitch',
          fromEmail: smtpCreds?.email, // Use SMTP account email (required for relay)
          recipientId: recipientData.id,
          campaignId: campaignId,
          personalization
        });

        // Update recipient status - mark as delivered if SMTP accepted it
        // In production, "delivered" means SMTP server accepted the email
        // Actual delivery confirmation requires webhooks (AWS SES, SendGrid, etc.)
        const now = new Date();
        await recipient.update({
          status: 'delivered', // Mark as delivered since SMTP accepted it
          sent_at: now,
          delivered_at: now // Set delivered_at immediately after successful send
        });

        // Update recipient status via service (for consistency)
        try {
          await emailService.updateRecipientStatus(recipientData.id, 'delivered');
        } catch (statusError) {
          console.warn(`⚠️ Failed to update recipient status via service for ${recipientData.id}:`, statusError.message);
          // Continue anyway - we already updated the recipient directly above
        }

        sentCount++;
        
        // Emit recipient update with delivered status
        emitRecipientUpdate(campaignId, recipientData.id, 'delivered', {
          email: recipientData.email,
          name: recipientData.name,
          messageId: emailResult?.messageId
        });

        // Emit progress update every 10 emails or on completion
        if (sentCount % 10 === 0 || i === recipients.length - 1) {
          const progress = Math.round((sentCount / totalRecipients) * 100);
          
          // Get updated stats for accurate reporting
          const currentStats = await getCampaignStats(campaignId);
          
          emitCampaignProgress(campaignId, {
            status: 'sending',
            total: totalRecipients,
            sent: sentCount,
            failed: failedCount,
            progress
          });

          // Emit updated stats
          emitCampaignStats(campaignId, currentStats);

          // Update job progress
          await job.progress(progress);
        }

        // Rate limiting: 100ms between emails (10 emails per second)
        if (i < recipients.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (error) {
        console.error(`❌ Failed to send email to ${recipientData.email}:`, error.message);
        
        const errorMessage = error.message.substring(0, 500);
        
        try {
          await recipient.update({
            status: 'failed',
            error_message: errorMessage
          });
          
          // Try to update via service method as well
          try {
            await emailService.updateRecipientStatus(recipientData.id, 'failed');
          } catch (statusError) {
            console.warn(`⚠️ Failed to update recipient status via service for ${recipientData.id}:`, statusError.message);
            // Continue anyway - we already updated the recipient directly above
          }
        } catch (updateError) {
          console.error(`❌ Failed to update recipient record for ${recipientData.email}:`, updateError.message);
        }

        failedCount++;
        errors.push({ 
          recipient: recipientData.email, 
          error: errorMessage 
        });

        // Emit recipient update
        emitRecipientUpdate(campaignId, recipientData.id, 'failed', {
          email: recipientData.email,
          name: recipientData.name,
          error: errorMessage
        });
      }
    }

    // Update campaign status
    const finalStatus = failedCount === 0 ? 'completed' : (sentCount > 0 ? 'completed' : 'draft');
    
    await Campaigns.update({ status: finalStatus }, { where: { id: campaignId } });
    
    try {
      await EmailCampaigns.update(
        { 
          status: finalStatus,
          completed_at: finalStatus === 'completed' ? new Date() : null,
          sent_count: sentCount,
          total_recipients: totalRecipients
        },
        { where: { id: campaignId } }
      );
    } catch (e) {
      console.log('ℹ️ Could not update email_campaigns completed_at');
    }

    // Get final stats with all metrics
    const stats = await getCampaignStats(campaignId);

    // Update email_campaigns table with final stats
    try {
      await EmailCampaigns.update(
        { 
          sent_count: stats.sent,
          delivered_count: stats.delivered,
          opened_count: stats.opened,
          clicked_count: stats.clicked,
          replied_count: stats.replied,
          bounced_count: stats.bounced
        },
        { where: { id: campaignId } }
      );
    } catch (e) {
      console.log('ℹ️ Could not update email_campaigns stats');
    }

    // Emit final stats and status
    emitCampaignStats(campaignId, stats);
    emitCampaignStatusChange(campaignId, finalStatus);
    
    emitCampaignProgress(campaignId, {
      status: finalStatus,
      total: totalRecipients,
      sent: sentCount,
      failed: failedCount,
      progress: 100
    });

    console.log(`✅ Campaign ${campaignId} completed: ${sentCount} sent, ${failedCount} failed`);

    return { 
      sentCount, 
      failedCount, 
      totalRecipients,
      stats,
      errors: errors.length > 0 ? errors : undefined
    };

  } catch (error) {
    console.error(`❌ Campaign send job failed:`, error);
    
    // Update campaign status to failed/draft
    try {
      await Campaigns.update({ status: 'draft' }, { where: { id: campaignId } });
      await EmailCampaigns.update({ status: 'draft' }, { where: { id: campaignId } });
    } catch (updateError) {
      console.error('Failed to update campaign status on error:', updateError);
    }
    
    emitCampaignProgress(campaignId, {
      status: 'failed',
      error: error.message,
      progress: 0
    });

    emitCampaignStatusChange(campaignId, 'draft');

    throw error;
  }
});

// Handle job events
campaignQueue.on('completed', (job, result) => {
  console.log(`✅ Campaign job ${job.id} completed:`, result);
});

campaignQueue.on('failed', (job, err) => {
  console.error(`❌ Campaign job ${job.id} failed:`, err.message);
});

campaignQueue.on('stalled', (job) => {
  console.warn(`⚠️ Campaign job ${job.id} stalled`);
});

module.exports = campaignQueue;
