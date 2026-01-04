const {
    Campaigns,
    CampaignRecipients,
    EmailCampaigns,
    EmailSMTPCredentials,
    BusinessRequirements,
    LinkedInProfiles,
    EmailAddresses,
    PsqlSequelize
} = require('../config/model');
const { Op } = require('sequelize');
const campaignQueue = require('../queues/campaignQueue');

// Get all campaigns for the authenticated user
exports.getCampaigns = async (req, res) => {
    try {
        console.log('📋 ========== GET CAMPAIGNS STARTED ==========')
        const userId = req.user.userId;
        console.log('👤 User ID from token:', userId)

        // First, let's check if ANY campaigns exist for debugging
        const allCampaignsCheck = await Campaigns.findAll({
            attributes: ['id', 'user_id', 'name'],
            order: [['created_at', 'DESC']],
            limit: 5
        });
        console.log('🔍 All campaigns in database (last 5):', allCampaignsCheck.map(r => ({
            id: r.id,
            user_id: r.user_id,
            name: r.name
        })))

        // Get campaigns with email content/metrics merged in
        console.log('🔍 Querying campaigns table with email metadata for user_id:', userId)
        let campaigns = await Campaigns.findAll({
            where: { user_id: userId },
            include: [{
                model: EmailCampaigns,
                required: false,
                as: 'email_campaign',
                attributes: ['template_id', 'smtp_credential_id', 'subject', 'body_html', 'body_text', 'started_at', 'completed_at', 'total_recipients', 'sent_count', 'delivered_count', 'opened_count', 'clicked_count', 'bounced_count', 'replied_count', 'unsubscribed_count', 'status', 'scheduled_at']
            }],
            order: [['created_at', 'DESC']]
        });

        // Merge campaign and email_campaign data
        let result = campaigns.map(campaign => {
            const campaignData = campaign.toJSON();
            const emailCampaign = campaignData.email_campaign;
            return {
                id: campaignData.id,
                name: campaignData.name,
                description: campaignData.description,
                status: emailCampaign?.status || campaignData.status,
                scheduled_at: emailCampaign?.scheduled_at || campaignData.scheduled_at,
                created_at: campaignData.created_at,
                updated_at: campaignData.updated_at,
                user_id: campaignData.user_id,
                template_id: emailCampaign?.template_id || null,
                smtp_credential_id: emailCampaign?.smtp_credential_id || null,
                subject: emailCampaign?.subject || null,
                body_html: emailCampaign?.body_html || null,
                body_text: emailCampaign?.body_text || null,
                started_at: emailCampaign?.started_at || null,
                completed_at: emailCampaign?.completed_at || null,
                total_recipients: emailCampaign?.total_recipients || null,
                sent_count: emailCampaign?.sent_count || null,
                delivered_count: emailCampaign?.delivered_count || null,
                opened_count: emailCampaign?.opened_count || null,
                clicked_count: emailCampaign?.clicked_count || null,
                bounced_count: emailCampaign?.bounced_count || null,
                replied_count: emailCampaign?.replied_count || null,
                unsubscribed_count: emailCampaign?.unsubscribed_count || null
            };
        });

        console.log(`✅ Found ${result.length} campaigns in campaigns table for user ${userId}`)
        if (result.length > 0) {
            console.log('📋 Campaign IDs:', result.map(r => ({ id: r.id, name: r.name, user_id: r.user_id })))
        } else {
            console.log('⚠️ No campaigns found - checking if user_id matches...')
            if (allCampaignsCheck.length > 0) {
                console.log('⚠️ Found campaigns but with different user_id:', allCampaignsCheck[0].user_id)
                console.log('⚠️ Request user_id:', userId)
                console.log('⚠️ Are they equal?', allCampaignsCheck[0].user_id === userId)
            }
        }

        // For legacy installs without email_campaigns, try to pull pure email campaigns
        if (result.length === 0) {
            try {
                console.log('🔍 Checking email_campaigns table directly (legacy records)...')
                const emailCampaigns = await EmailCampaigns.findAll({
                    where: { user_id: userId },
                    order: [['created_at', 'DESC']]
                });
                console.log(`✅ Found ${emailCampaigns.length} legacy campaigns in email_campaigns table`)
                result = emailCampaigns.map(ec => ec.toJSON());
            } catch (err) {
                console.log('ℹ️ email_campaigns table not found, campaigns list may be empty if no records exist');
            }
        }

        // Enrich with recipient counts
        console.log(`📊 Enriching ${result.length} campaigns with recipient counts...`)
        for (const campaign of result) {
            if (!campaign.total_recipients) {
                const recipientCount = await CampaignRecipients.count({
                    where: { campaign_id: campaign.id }
                });
                campaign.total_recipients = recipientCount || 0;
                console.log(`  Campaign ${campaign.id}: ${campaign.total_recipients} recipients`)

                // Get status counts using Sequelize
                const statusCounts = await CampaignRecipients.findAll({
                    where: { campaign_id: campaign.id },
                    attributes: [
                        [PsqlSequelize.fn('COUNT', PsqlSequelize.literal(`CASE WHEN status = 'sent' OR sent_at IS NOT NULL THEN 1 END`)), 'sent_count'],
                        [PsqlSequelize.fn('COUNT', PsqlSequelize.literal(`CASE WHEN status = 'delivered' OR delivered_at IS NOT NULL THEN 1 END`)), 'delivered_count'],
                        [PsqlSequelize.fn('COUNT', PsqlSequelize.literal(`CASE WHEN status = 'opened' OR opened_at IS NOT NULL THEN 1 END`)), 'opened_count'],
                        [PsqlSequelize.fn('COUNT', PsqlSequelize.literal(`CASE WHEN status = 'clicked' OR clicked_at IS NOT NULL THEN 1 END`)), 'clicked_count'],
                        [PsqlSequelize.fn('COUNT', PsqlSequelize.literal(`CASE WHEN status = 'replied' OR replied_at IS NOT NULL THEN 1 END`)), 'replied_count'],
                        [PsqlSequelize.fn('COUNT', PsqlSequelize.literal(`CASE WHEN status = 'bounced' OR bounced_at IS NOT NULL THEN 1 END`)), 'bounced_count']
                    ],
                    raw: true
                });
                const counts = statusCounts[0] || {};
                campaign.sent_count = parseInt(counts.sent_count) || 0;
                campaign.delivered_count = parseInt(counts.delivered_count) || 0;
                campaign.opened_count = parseInt(counts.opened_count) || 0;
                campaign.clicked_count = parseInt(counts.clicked_count) || 0;
                campaign.replied_count = parseInt(counts.replied_count) || 0;
                campaign.bounced_count = parseInt(counts.bounced_count) || 0;
            }
        }

        console.log(`✅ Returning ${result.length} campaigns`)
        console.log('📋 ========== GET CAMPAIGNS SUCCESS ==========')
        res.json(result);
    } catch (error) {
        console.error('Error fetching campaigns:', error);
        res.status(500).json({ message: 'Failed to fetch campaigns', error: error.message });
    }
};

// Get a single campaign by ID
exports.getCampaign = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        // Try campaigns table first (current schema) with email_campaigns included
        let campaign = await Campaigns.findOne({
            where: {
                id: id,
                user_id: userId
            },
            include: [{
                model: EmailCampaigns,
                required: false,
                as: 'email_campaign',
                attributes: ['template_id', 'smtp_credential_id', 'subject', 'body_html', 'body_text', 'started_at', 'completed_at', 'total_recipients', 'sent_count', 'delivered_count', 'opened_count', 'clicked_count', 'bounced_count', 'replied_count', 'unsubscribed_count', 'status', 'scheduled_at']
            }]
        });

        // If not found, try email_campaigns table (newer schema)
        if (!campaign) {
            const emailCampaign = await EmailCampaigns.findOne({
                where: {
                    id: id,
                    user_id: userId
                }
            });

            if (!emailCampaign) {
                return res.status(404).json({ message: 'Campaign not found' });
            }

            // Return email_campaign data directly
            const emailCampaignData = emailCampaign.toJSON();
            const recipientCount = await CampaignRecipients.count({
                where: { campaign_id: id }
            });

            return res.json({
                ...emailCampaignData,
                total_recipients: emailCampaignData.total_recipients || recipientCount || 0
            });
        }

        // Merge campaign and email_campaign data
        const campaignData = campaign.toJSON();
        const emailCampaignData = campaignData.email_campaign || {};

        const result = {
            id: campaignData.id,
            name: campaignData.name,
            description: campaignData.description,
            status: emailCampaignData.status || campaignData.status,
            scheduled_at: emailCampaignData.scheduled_at || campaignData.scheduled_at,
            created_at: campaignData.created_at,
            updated_at: campaignData.updated_at,
            template_id: emailCampaignData.template_id || null,
            smtp_credential_id: emailCampaignData.smtp_credential_id || null,
            subject: emailCampaignData.subject || null,
            body_html: emailCampaignData.body_html || null,
            body_text: emailCampaignData.body_text || null,
            started_at: emailCampaignData.started_at || null,
            completed_at: emailCampaignData.completed_at || null,
            total_recipients: emailCampaignData.total_recipients || null,
            sent_count: emailCampaignData.sent_count || null,
            delivered_count: emailCampaignData.delivered_count || null,
            opened_count: emailCampaignData.opened_count || null,
            clicked_count: emailCampaignData.clicked_count || null,
            bounced_count: emailCampaignData.bounced_count || null,
            replied_count: emailCampaignData.replied_count || null,
            unsubscribed_count: emailCampaignData.unsubscribed_count || null
        };

        // Get recipient counts if not in the campaign record
        if (!result.total_recipients) {
            const recipientCount = await CampaignRecipients.count({
                where: { campaign_id: id }
            });
            result.total_recipients = recipientCount || 0;
        }

        res.json(result);
    } catch (error) {
        console.error('Error fetching campaign:', error);
        res.status(500).json({ message: 'Failed to fetch campaign', error: error.message });
    }
};

// Create a new campaign
exports.createCampaign = async (req, res) => {
    try {
        console.log('🎯 ========== CREATE CAMPAIGN STARTED ==========')
        console.log('👤 User ID:', req.user.userId)
        console.log('📥 Request body:', {
            ...req.body,
            body_html: req.body.body_html ? `${req.body.body_html.substring(0, 50)}...` : null,
            recipient_emails: Object.keys(req.body.recipient_emails || {}).length + ' emails'
        })

        const userId = req.user.userId;
        const {
            name,
            description,
            template_id,
            smtp_credential_id,
            subject,
            body_html,
            body_text,
            scheduled_at,
            status = 'draft',
            recipient_ids = [],
            recipient_emails = {}, // Object mapping lead_id to email
        } = req.body;

        console.log('📊 Parsed data:', {
            name,
            subject,
            recipient_ids_count: recipient_ids.length,
            recipient_emails_count: Object.keys(recipient_emails).length
        })

        // Validation
        console.log('🔍 Validating campaign data...')
        if (!name || !subject || !body_html || !smtp_credential_id) {
            console.error('❌ Validation failed - missing required fields:', {
                hasName: !!name,
                hasSubject: !!subject,
                hasBodyHtml: !!body_html,
                hasSmtpCredentialId: !!smtp_credential_id
            })
            return res.status(400).json({ message: 'Missing required fields' });
        }

        if (!Array.isArray(recipient_ids) || recipient_ids.length === 0) {
            console.error('❌ Validation failed - no recipients:', {
                recipient_ids_type: typeof recipient_ids,
                recipient_ids_length: recipient_ids?.length
            })
            return res.status(400).json({ message: 'At least one recipient is required' });
        }

        console.log('✅ Validation passed')

        // Verify SMTP credential belongs to user
        const smtpCheck = await EmailSMTPCredentials.findOne({
            where: {
                id: smtp_credential_id,
                user_id: userId,
                is_verified: true
            }
        });
        if (!smtpCheck) {
            return res.status(400).json({ message: 'Invalid or unverified SMTP credential' });
        }

        // Use Sequelize transaction
        const transaction = await PsqlSequelize.transaction();

        try {
            // Create campaign
            // The foreign key constraint in campaign_recipients points to 'campaigns' table
            // So we must use 'campaigns' table, not 'email_campaigns'
            console.log('Creating campaign with data:', { userId, name, description, status, scheduled_at });

            const campaign = await Campaigns.create({
                user_id: userId,
                name: name,
                description: description || null,
                status: status,
                scheduled_at: scheduled_at || null
            }, { transaction });

            console.log('✅ Campaign created successfully with ID:', campaign.id);
            console.log('📦 Full campaign object:', JSON.stringify(campaign.toJSON(), null, 2));
            console.log('👤 Campaign user_id:', campaign.user_id);

            if (!campaign || !campaign.id) {
                console.error('❌ Campaign INSERT failed - no ID in returned row');
                throw new Error('Campaign INSERT failed - no ID returned');
            }

            // Verify the campaign exists in the database within this transaction
            const verifyCampaign = await Campaigns.findByPk(campaign.id, { transaction });

            if (!verifyCampaign) {
                console.error('❌ Campaign verification failed - campaign not found in database');
                throw new Error('Campaign was created but not found in database');
            }

            console.log('✅ Campaign verified in database:', {
                id: verifyCampaign.id,
                user_id: verifyCampaign.user_id
            });

            // Get lead details for recipients
            const leads = await LinkedInProfiles.findAll({
                where: {
                    id: { [Op.in]: recipient_ids }
                },
                attributes: ['id', 'name', 'company_name', 'title', 'profession', 'location'],
                transaction
            });

            // Create campaign recipients
            console.log(`Creating ${leads.length} campaign recipients for campaign ${campaign.id}`);

            for (const lead of leads) {
                // Get email from recipient_emails object or use empty string
                const email = recipient_emails[lead.id] || ''

                // Validate email is not empty (email field is NOT NULL in schema)
                if (!email || email.trim() === '') {
                    console.error(`Skipping lead ${lead.id} - no email provided`)
                    continue // Skip leads without email
                }

                // Prepare personalization data as JSONB
                // Map the actual columns to expected variable names
                const nameParts = lead.name ? lead.name.trim().split(' ') : []
                const firstName = nameParts[0] || ''
                const lastName = nameParts.slice(1).join(' ') || ''

                const personalizationData = {
                    firstName: firstName,
                    lastName: lastName,
                    name: lead.name || '',
                    company: lead.company_name || '',
                    position: lead.title || lead.profession || '',
                    location: lead.location || '',
                    email: email,
                };

                console.log(`Inserting recipient for lead ${lead.id} with campaign_id ${campaign.id}`);

                // Convert to JSON string for JSONB column
                try {
                    await CampaignRecipients.create({
                        campaign_id: campaign.id,
                        lead_id: lead.id,
                        email: email.trim(),
                        name: lead.name || 'Unknown',
                        personalization_data: personalizationData
                    }, { transaction });
                    console.log(`Successfully inserted recipient for lead ${lead.id}`);
                } catch (recipientError) {
                    console.error(`Error inserting recipient for lead ${lead.id}:`, recipientError);
                    console.error('Recipient error details:', {
                        message: recipientError.message,
                        code: recipientError.code,
                        detail: recipientError.detail,
                        campaign_id: campaign.id,
                        lead_id: lead.id
                    });
                    throw recipientError; // Re-throw to trigger rollback
                }
            }

            console.log('All recipients created successfully');

            // Also create/update email_campaigns record with email content
            try {
                console.log('💾 Storing email campaign data in email_campaigns table...')
                console.log('📝 Email data:', {
                    campaign_id: campaign.id,
                    smtp_credential_id,
                    subject: subject?.substring(0, 50),
                    body_html_length: body_html?.length,
                    has_template: !!template_id
                })

                await EmailCampaigns.upsert({
                    id: campaign.id,
                    user_id: userId,
                    name: name,
                    description: description || null,
                    template_id: template_id || null,
                    smtp_credential_id: smtp_credential_id,
                    subject: subject,
                    body_html: body_html,
                    body_text: body_text || null,
                    status: status,
                    scheduled_at: scheduled_at || null
                }, { transaction });
                console.log('✅ Email campaign data stored in email_campaigns table');
            } catch (emailCampaignError) {
                console.error('❌ Failed to store email campaign data:', emailCampaignError);
                console.error('Error details:', {
                    message: emailCampaignError.message,
                    code: emailCampaignError.code,
                    detail: emailCampaignError.detail
                });
                // Don't fail the whole transaction if email_campaigns doesn't exist
                // But log it so we know
            }

            await transaction.commit();
            console.log('✅ Transaction committed successfully')
            console.log('📦 Returning campaign:', {
                id: campaign.id,
                name: campaign.name,
                status: campaign.status
            })
            console.log('🎯 ========== CREATE CAMPAIGN SUCCESS ==========')
            res.status(201).json(campaign);
        } catch (error) {
            console.error('❌ Transaction error, rolling back...')
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        console.error('❌ ========== CREATE CAMPAIGN ERROR ==========')
        console.error('Error creating campaign:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            detail: error.detail,
            hint: error.hint,
            stack: error.stack
        });

        // Check for common database errors
        if (error.message && error.message.includes('does not exist')) {
            return res.status(500).json({
                message: 'Database table or column not found. Please check your database schema.',
                error: error.message,
                detail: error.detail
            });
        }

        res.status(500).json({
            message: 'Failed to create campaign',
            error: error.message,
            detail: error.detail || undefined,
            hint: error.hint || undefined
        });
    }
};

// Update a campaign
exports.updateCampaign = async (req, res) => {
    const transaction = await PsqlSequelize.transaction();
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const {
            name,
            description,
            template_id,
            smtp_credential_id,
            subject,
            body_html,
            body_text,
            scheduled_at,
            status,
            recipient_ids,
            recipient_emails = {},
        } = req.body;

        const campaign = await Campaigns.findOne({
            where: {
                id: id,
                user_id: userId
            },
            transaction
        });
        if (!campaign) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Campaign not found' });
        }
        const campaignRow = campaign.toJSON();

        const emailCampaign = await EmailCampaigns.findByPk(id, { transaction });
        const existingEmailCampaign = emailCampaign ? emailCampaign.toJSON() : {};
        const currentStatus = existingEmailCampaign.status || campaignRow.status || 'draft';

        if (currentStatus === 'sending' || currentStatus === 'completed') {
            await transaction.rollback();
            return res.status(400).json({ message: 'Cannot edit campaign in current status' });
        }

        // Update campaign
        const campaignUpdateData = {};
        if (name !== undefined) campaignUpdateData.name = name;
        if (description !== undefined) campaignUpdateData.description = description;
        if (scheduled_at !== undefined) campaignUpdateData.scheduled_at = scheduled_at || null;
        if (status !== undefined) campaignUpdateData.status = status;
        campaignUpdateData.updated_at = new Date();

        if (Object.keys(campaignUpdateData).length > 0) {
            await campaign.update(campaignUpdateData, { transaction });
        }

        // Update or create email_campaigns
        const emailCampaignPayload = {
            id: id,
            user_id: userId,
            name: name ?? existingEmailCampaign.name ?? campaignRow.name,
            description: description ?? existingEmailCampaign.description ?? campaignRow.description,
            template_id: template_id !== undefined ? template_id : existingEmailCampaign.template_id || null,
            smtp_credential_id: smtp_credential_id !== undefined ? smtp_credential_id : existingEmailCampaign.smtp_credential_id,
            subject: subject ?? existingEmailCampaign.subject,
            body_html: body_html ?? existingEmailCampaign.body_html,
            body_text: body_text ?? existingEmailCampaign.body_text,
            status: status ?? existingEmailCampaign.status ?? campaignRow.status,
            scheduled_at: scheduled_at ?? existingEmailCampaign.scheduled_at ?? campaignRow.scheduled_at,
        };

        await EmailCampaigns.upsert(emailCampaignPayload, { transaction });

        if (Array.isArray(recipient_ids)) {
            const existingRecipients = await CampaignRecipients.findAll({
                where: { campaign_id: id },
                attributes: ['lead_id'],
                transaction
            });
            const existingLeadIds = existingRecipients.map(r => r.lead_id);
            const existingSet = new Set(existingLeadIds);
            const desiredSet = new Set(recipient_ids);

            const leadsToRemove = existingLeadIds.filter(leadId => !desiredSet.has(leadId));
            const leadsToAdd = recipient_ids.filter(leadId => !existingSet.has(leadId));

            if (leadsToRemove.length > 0) {
                await CampaignRecipients.destroy({
                    where: {
                        campaign_id: id,
                        lead_id: { [Op.in]: leadsToRemove }
                    },
                    transaction
                });
            }

            if (leadsToAdd.length > 0) {
                const leads = await LinkedInProfiles.findAll({
                    where: {
                        id: { [Op.in]: leadsToAdd }
                    },
                    include: [{
                        model: EmailAddresses,
                        required: false,
                        attributes: ['email']
                    }],
                    attributes: ['id', 'name', 'company_name', 'title', 'profession', 'location'],
                    transaction
                });

                for (const lead of leads) {
                    const leadData = lead.toJSON();
                    const email = (recipient_emails[leadData.id] || (leadData.email_addresses && leadData.email_addresses[0]?.email) || '').trim();
                    if (!email) continue;

                    const nameParts = leadData.name ? leadData.name.trim().split(' ') : [];
                    const firstName = nameParts[0] || '';
                    const lastName = nameParts.slice(1).join(' ') || '';

                    const personalizationData = {
                        firstName,
                        lastName,
                        name: leadData.name || '',
                        company: leadData.company_name || '',
                        position: leadData.title || leadData.profession || '',
                        location: leadData.location || '',
                        email,
                    };

                    await CampaignRecipients.create({
                        campaign_id: id,
                        lead_id: leadData.id,
                        email: email,
                        name: leadData.name || 'Unknown',
                        personalization_data: personalizationData
                    }, { transaction });
                }
            }

            if (recipient_ids.length > 0) {
                for (const leadId of recipient_ids) {
                    const emailOverride = recipient_emails[leadId];
                    if (emailOverride) {
                        await CampaignRecipients.update(
                            { email: emailOverride.trim() },
                            {
                                where: {
                                    campaign_id: id,
                                    lead_id: leadId
                                },
                                transaction
                            }
                        );
                    }
                }
            }
        }

        await transaction.commit();

        // Get updated campaign
        const updatedCampaign = await Campaigns.findOne({
            where: {
                id: id,
                user_id: userId
            },
            include: [{
                model: EmailCampaigns,
                required: false,
                as: 'email_campaign',
                attributes: ['template_id', 'smtp_credential_id', 'subject', 'body_html', 'body_text', 'started_at', 'completed_at', 'total_recipients', 'sent_count', 'delivered_count', 'opened_count', 'clicked_count', 'bounced_count', 'replied_count', 'unsubscribed_count', 'status', 'scheduled_at']
            }]
        });

        const campaignData = updatedCampaign.toJSON();
        const emailCampaignData = campaignData.email_campaign || {};
        const result = {
            ...campaignData,
            status: emailCampaignData.status || campaignData.status,
            scheduled_at: emailCampaignData.scheduled_at || campaignData.scheduled_at,
            template_id: emailCampaignData.template_id || null,
            smtp_credential_id: emailCampaignData.smtp_credential_id || null,
            subject: emailCampaignData.subject || null,
            body_html: emailCampaignData.body_html || null,
            body_text: emailCampaignData.body_text || null,
            started_at: emailCampaignData.started_at || null,
            completed_at: emailCampaignData.completed_at || null,
            total_recipients: emailCampaignData.total_recipients || null,
            sent_count: emailCampaignData.sent_count || null,
            delivered_count: emailCampaignData.delivered_count || null,
            opened_count: emailCampaignData.opened_count || null,
            clicked_count: emailCampaignData.clicked_count || null,
            bounced_count: emailCampaignData.bounced_count || null,
            replied_count: emailCampaignData.replied_count || null,
            unsubscribed_count: emailCampaignData.unsubscribed_count || null
        };

        res.json(result);
    } catch (error) {
        await transaction.rollback();
        console.error('Error updating campaign:', error);
        res.status(500).json({ message: 'Failed to update campaign', error: error.message });
    }
};

// Delete a campaign
exports.deleteCampaign = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        const emailCampaign = await EmailCampaigns.findOne({
            where: {
                id: id,
                user_id: userId
            }
        });

        if (!emailCampaign) {
            // Also check campaigns table
            const campaign = await Campaigns.findOne({
                where: {
                    id: id,
                    user_id: userId
                }
            });
            if (!campaign) {
                return res.status(404).json({ message: 'Campaign not found' });
            }
        }

        const transaction = await PsqlSequelize.transaction();
        try {
            // Delete campaign_recipients first (cascade should handle this, but being explicit)
            await CampaignRecipients.destroy({
                where: { campaign_id: id },
                transaction
            });

            // Delete email_campaigns
            await EmailCampaigns.destroy({
                where: { id: id },
                transaction
            });

            // Delete campaigns
            await Campaigns.destroy({
                where: { id: id },
                transaction
            });

            await transaction.commit();
        } catch (err) {
            await transaction.rollback();
            throw err;
        }

        res.json({ message: 'Campaign deleted successfully' });
    } catch (error) {
        console.error('Error deleting campaign:', error);
        res.status(500).json({ message: 'Failed to delete campaign', error: error.message });
    }
};

// Get campaign recipients
exports.getCampaignRecipients = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params;

        // Verify campaign belongs to user (check both tables)
        let campaignCheck = await Campaigns.findOne({
            where: {
                id: id,
                user_id: userId
            }
        });
        if (!campaignCheck) {
            // Try email_campaigns table as fallback
            campaignCheck = await EmailCampaigns.findOne({
                where: {
                    id: id,
                    user_id: userId
                }
            });
        }
        if (!campaignCheck) {
            return res.status(404).json({ message: 'Campaign not found' });
        }

        const recipients = await CampaignRecipients.findAll({
            where: { campaign_id: id },
            attributes: ['id', 'campaign_id', 'lead_id', 'email', 'name', 'status', 'sent_at', 'delivered_at', 'opened_at', 'clicked_at', 'bounced_at', 'replied_at', 'error_message'],
            order: [['created_at', 'DESC']]
        });

        res.json(recipients);
    } catch (error) {
        console.error('Error fetching campaign recipients:', error);
        res.status(500).json({ message: 'Failed to fetch recipients', error: error.message });
    }
};

// Mark recipient as replied (manual or webhook)
exports.markRecipientReplied = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { id } = req.params; // campaign id
        const { recipientId, replySubject, replyBody } = req.body;

        if (!recipientId) {
            return res.status(400).json({ message: 'recipientId is required' });
        }

        // Verify campaign belongs to user
        const campaign = await Campaigns.findOne({
            where: {
                id: id,
                user_id: userId
            }
        });

        if (!campaign) {
            return res.status(404).json({ message: 'Campaign not found' });
        }

        // Verify recipient belongs to this campaign
        const recipient = await CampaignRecipients.findOne({
            where: {
                id: recipientId,
                campaign_id: id
            }
        });

        if (!recipient) {
            return res.status(404).json({ message: 'Recipient not found in this campaign' });
        }

        // Use emailService to handle reply (this updates status, logs event, and emits socket events)
        const emailService = require('../services/emailService');
        await emailService.handleReply(recipientId, replySubject, replyBody);

        res.json({
            success: true,
            message: 'Recipient marked as replied',
            recipientId
        });
    } catch (error) {
        console.error('Error marking recipient as replied:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark recipient as replied',
            error: error.message
        });
    }
};

// Send campaign emails to all recipients (async via Bull queue)
exports.sendCampaign = async (req, res) => {
    try {
        console.log('📧 ========== SEND CAMPAIGN STARTED ==========')
        const { id } = req.params;
        const userId = req.user.userId;

        // Get campaign to validate
        const campaign = await Campaigns.findOne({
            where: {
                id: id,
                user_id: userId
            },
            include: [{
                model: EmailCampaigns,
                required: false,
                as: 'email_campaign',
                attributes: ['template_id', 'smtp_credential_id', 'subject', 'body_html', 'body_text']
            }]
        });

        if (!campaign) {
            return res.status(404).json({ message: 'Campaign not found' });
        }

        const campaignData = campaign.toJSON();
        const emailCampaignData = campaignData.email_campaign || {};

        console.log('📋 Campaign found:', {
            id: campaignData.id,
            name: campaignData.name,
            status: campaignData.status
        });

        // Check if campaign can be sent
        if (campaignData.status === 'sending') {
            return res.status(400).json({
                success: false,
                message: 'Campaign is already being sent'
            });
        }

        if (campaignData.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Campaign has already been completed'
            });
        }

        if (campaignData.status === 'paused') {
            return res.status(400).json({
                success: false,
                message: 'Campaign is paused. Please resume it first.'
            });
        }

        // Validate campaign has required data
        if (!emailCampaignData.smtp_credential_id) {
            return res.status(400).json({
                success: false,
                message: 'Campaign does not have SMTP credentials configured. Please edit the campaign and add SMTP credentials.'
            });
        }

        if (!emailCampaignData.subject || !emailCampaignData.body_html) {
            return res.status(400).json({
                success: false,
                message: 'Campaign is missing subject or body content. Please edit the campaign and add email content.'
            });
        }

        // Check if there's already a job for this campaign
        const existingJobs = await campaignQueue.getJobs(['active', 'waiting', 'delayed']);
        const existingJob = existingJobs.find(job =>
            job.data.campaignId === id &&
            (job.opts.jobId === `campaign-${id}` || job.id === `campaign-${id}`)
        );

        if (existingJob) {
            return res.status(400).json({
                success: false,
                message: 'Campaign is already queued for sending'
            });
        }

        // Add job to queue
        const job = await campaignQueue.add('send-campaign', {
            campaignId: id,
            userId: userId
        }, {
            jobId: `campaign-${id}`, // Unique job ID to prevent duplicates
            removeOnComplete: true,
            removeOnFail: false
        });

        console.log(`✅ Campaign send job queued: ${job.id}`);

        // Return immediately with job ID
        res.json({
            success: true,
            message: 'Campaign sending started. You will receive real-time updates.',
            jobId: job.id,
            campaignId: id
        });

    } catch (error) {
        console.error('❌ ========== SEND CAMPAIGN ERROR ==========')
        console.error('Error starting campaign send:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            message: 'Failed to start campaign sending',
            error: error.message
        });
    }
};

