const { BusinessRequirements, LinkedInProfiles, EmailAddresses } = require('../config/model');
const { Op } = require('sequelize');

// Get all leads for user (not grouped, all requirements)
exports.getAllLeads = async (req, res) => {
    try {
        const userId = req.user.userId;

        // Get all leads for user across all requirements (including all statuses)
        const leads = await LinkedInProfiles.findAll({
            include: [{
                model: BusinessRequirements,
                where: { 
                    user_id: userId
                    // Don't filter by status - get leads from all requirements
                },
                attributes: ['id', 'operation_name', 'requirement_text', 'industry', 'target_location', 'status'],
                required: true
            }, {
                model: EmailAddresses,
                required: false,
                attributes: ['id', 'email', 'is_verified']
            }],
            order: [['scraped_at', 'DESC']]
        });

        const leadsData = leads.map(lead => {
            const leadJson = lead.toJSON();
            const email = leadJson.email_addresses && leadJson.email_addresses[0];
            const br = leadJson.business_requirement;
            // Use business_requirement_id directly from lead, fallback to br?.id
            const reqId = leadJson.business_requirement_id || br?.id || null;
            return {
                id: leadJson.id,
                name: leadJson.name,
                title: leadJson.title,
                profession: leadJson.profession,
                location: leadJson.location,
                company_name: leadJson.company_name,
                decision_maker_role: leadJson.decision_maker_role,
                profile_url: leadJson.profile_url,
                scraped_at: leadJson.scraped_at,
                email: email?.email || null,
                email_verified: email?.is_verified || false,
                email_id: email?.id || null,
                requirement_id: reqId,
                requirement_name: br?.operation_name || null,
                requirement_text: br?.requirement_text || null,
                industry: br?.industry || null,
                target_location: br?.target_location || null,
                requirement_status: br?.status || null
            };
        });

        res.json(leadsData);
    } catch (error) {
        console.error('Get all leads error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get leads grouped by requirement (only closed requirements)
exports.getLeadsGroupedByRequirement = async (req, res) => {
    try {
        const userId = req.user.userId;

        // Get all closed requirements with their leads
        const requirements = await BusinessRequirements.findAll({
            where: {
                user_id: userId,
                status: 'closed'
            },
            include: [{
                model: LinkedInProfiles,
                required: false,
                include: [{
                    model: EmailAddresses,
                    required: false,
                    attributes: ['id', 'email', 'is_verified']
                }]
            }],
            order: [['created_at', 'DESC']]
        });

        // Get leads for each requirement
        const requirementsWithLeads = await Promise.all(
            requirements.map(async (req) => {
                const leads = await LinkedInProfiles.findAll({
                    where: { business_requirement_id: req.id },
                    include: [{
                        model: EmailAddresses,
                        required: false,
                        attributes: ['id', 'email', 'is_verified']
                    }],
                    order: [['name', 'ASC']]
                });

                const leadsData = leads.map(lead => {
                    const leadJson = lead.toJSON();
                    const email = leadJson.email_addresses && leadJson.email_addresses[0];
                    return {
                        id: leadJson.id,
                        name: leadJson.name,
                        title: leadJson.title,
                        profession: leadJson.profession,
                        location: leadJson.location,
                        company_name: leadJson.company_name,
                        decision_maker_role: leadJson.decision_maker_role,
                        profile_url: leadJson.profile_url,
                        scraped_at: leadJson.scraped_at,
                        email: email?.email || null,
                        email_verified: email?.is_verified || false,
                        email_id: email?.id || null
                    };
                });

                const reqJson = req.toJSON();
                return {
                    requirement_id: reqJson.id,
                    requirement_name: reqJson.operation_name,
                    requirement_text: reqJson.requirement_text,
                    industry: reqJson.industry,
                    target_location: reqJson.target_location,
                    requirement_created_at: reqJson.created_at,
                    total_leads: leads.length,
                    leads_with_email: leadsData.filter(l => l.email).length,
                    leads: leadsData
                };
            })
        );

        res.json(requirementsWithLeads);
    } catch (error) {
        console.error('Get leads grouped by requirement error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get single lead by ID
exports.getLeadById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        const lead = await LinkedInProfiles.findOne({
            include: [{
                model: BusinessRequirements,
                where: { user_id: userId },
                attributes: ['operation_name', 'id']
            }, {
                model: EmailAddresses,
                required: false,
                attributes: ['email', 'is_verified', 'id']
            }],
            where: { id: id }
        });

        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        const leadData = lead.toJSON();
        const email = leadData.email_addresses && leadData.email_addresses[0];
        const br = leadData.business_requirement;

        res.json({
            ...leadData,
            requirement_name: br?.operation_name,
            requirement_id: br?.id,
            email: email?.email || null,
            email_verified: email?.is_verified || false,
            email_id: email?.id || null
        });
    } catch (error) {
        console.error('Get lead by ID error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Create new lead (manual entry)
exports.createLead = async (req, res) => {
    try {
        const { requirementId, name, firstName, lastName, title, company_name, location, email, decision_maker_role } = req.body;
        const userId = req.user.userId;

        // Combine firstName and lastName into name if provided, otherwise use name directly
        let fullName = name
        if ((firstName !== undefined && firstName !== null) || (lastName !== undefined && lastName !== null)) {
            const first = firstName || ''
            const last = lastName || ''
            fullName = `${first.trim()} ${last.trim()}`.trim() || name
        }

        if (!fullName || fullName.trim() === '') {
            return res.status(400).json({ message: 'Name is required' });
        }

        // Verify requirement belongs to user and is closed
        const requirement = await BusinessRequirements.findOne({
            where: {
                id: requirementId,
                user_id: userId,
                status: 'closed'
            }
        });

        if (!requirement) {
            return res.status(404).json({ message: 'Requirement not found or not closed' });
        }

        // Create profile
        const profile = await LinkedInProfiles.create({
            business_requirement_id: requirementId,
            profile_url: `manual-${Date.now()}`, // Placeholder URL for manual entries
            name: fullName,
            title: title || null,
            company_name: company_name || null,
            location: location || null,
            decision_maker_role: decision_maker_role || null
        });

        // Add email if provided
        if (email) {
            await EmailAddresses.create({
                linkedin_profile_id: profile.id,
                email: email,
                source: 'manual',
                is_verified: false
            });
        }

        // Get full lead data
        const lead = await LinkedInProfiles.findOne({
            include: [{
                model: BusinessRequirements,
                attributes: ['operation_name', 'id']
            }, {
                model: EmailAddresses,
                required: false,
                attributes: ['email', 'is_verified', 'id']
            }],
            where: { id: profile.id }
        });

        const leadData = lead.toJSON();
        const emailData = leadData.email_addresses && leadData.email_addresses[0];
        const br = leadData.business_requirement;

        res.status(201).json({
            ...leadData,
            requirement_name: br?.operation_name,
            requirement_id: br?.id,
            email: emailData?.email || null,
            email_verified: emailData?.is_verified || false,
            email_id: emailData?.id || null
        });
    } catch (error) {
        console.error('Create lead error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Update lead
exports.updateLead = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, firstName, lastName, title, profession, company_name, location, email, decision_maker_role } = req.body;
        const userId = req.user.userId;

        // Verify lead belongs to user
        const lead = await LinkedInProfiles.findOne({
            include: [{
                model: BusinessRequirements,
                where: { user_id: userId },
                attributes: []
            }],
            where: { id: id }
        });

        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Combine firstName and lastName into name if provided, otherwise use name directly
        let fullName = name
        if ((firstName !== undefined && firstName !== null) || (lastName !== undefined && lastName !== null)) {
            const first = firstName || ''
            const last = lastName || ''
            fullName = `${first.trim()} ${last.trim()}`.trim() || name
        }

        // Update profile
        const updateData = {};
        if (fullName !== undefined && fullName !== null && fullName !== '') {
            updateData.name = fullName;
        }
        if (title !== undefined && title !== null) {
            updateData.title = title;
        }
        if (profession !== undefined && profession !== null) {
            updateData.profession = profession;
        }
        if (company_name !== undefined && company_name !== null) {
            updateData.company_name = company_name;
        }
        if (location !== undefined && location !== null) {
            updateData.location = location;
        }
        if (decision_maker_role !== undefined && decision_maker_role !== null) {
            updateData.decision_maker_role = decision_maker_role;
        }

        if (Object.keys(updateData).length > 0) {
            await lead.update(updateData);
        }

        // Update or create email
        if (email !== undefined) {
            const existingEmail = await EmailAddresses.findOne({
                where: { linkedin_profile_id: id }
            });

            if (existingEmail) {
                // Update existing email
                await existingEmail.update({ email: email });
            } else if (email) {
                // Create new email
                await EmailAddresses.create({
                    linkedin_profile_id: id,
                    email: email,
                    source: 'manual',
                    is_verified: false
                });
            }
        }

        // Get updated lead
        const updatedLead = await LinkedInProfiles.findOne({
            include: [{
                model: BusinessRequirements,
                attributes: ['operation_name', 'id']
            }, {
                model: EmailAddresses,
                required: false,
                attributes: ['email', 'is_verified', 'id']
            }],
            where: { id: id }
        });

        const leadData = updatedLead.toJSON();
        const emailData = leadData.email_addresses && leadData.email_addresses[0];
        const br = leadData.business_requirement;

        res.json({
            ...leadData,
            requirement_name: br?.operation_name,
            requirement_id: br?.id,
            email: emailData?.email || null,
            email_verified: emailData?.is_verified || false,
            email_id: emailData?.id || null
        });
    } catch (error) {
        console.error('Update lead error:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            detail: error.detail,
            hint: error.hint,
            stack: error.stack
        });
        res.status(500).json({
            message: 'Internal server error',
            error: error.message,
            detail: error.detail
        });
    }
};

// Delete lead
exports.deleteLead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        // Verify lead belongs to user
        const lead = await LinkedInProfiles.findOne({
            include: [{
                model: BusinessRequirements,
                where: { user_id: userId },
                attributes: []
            }],
            where: { id: id }
        });

        if (!lead) {
            return res.status(404).json({ message: 'Lead not found' });
        }

        // Delete lead (cascade will delete email_addresses)
        await lead.destroy();

        res.json({ message: 'Lead deleted successfully' });
    } catch (error) {
        console.error('Delete lead error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

