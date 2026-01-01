const Queue = require('bull');
const redisClient = require('../config/redis');
const processLinkedInScraping = require('../jobs/linkedinScrapingJob');
const apolloService = require('../services/apolloService');
const { decrypt } = require('../utils/encryption');
const { BusinessRequirements, DecisionMakerRoles, LinkedInProfiles, LinkedInCredentials, EmailAddresses } = require('../config/model');
const { Op } = require('sequelize');

// Initialize Bull Queue
const scrapingQueue = new Queue('linkedin-scraping', {
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
    },
});

// Process jobs with error handling
scrapingQueue.process(1, async (job) => {
  try {
    return await processLinkedInScraping(job);
  } catch (error) {
    // Log error appropriately
    if (error.message && error.message.includes('Apollo API')) {
      console.log(`[Queue] ⚠️  Job ${job.id}: Apollo.io API error.`);
      throw error;
    } else {
      console.error(`[Queue] ❌ Job ${job.id} failed:`, error.message);
      throw error;
    }
  }
});

// Clean up old failed jobs on startup (optional - runs once)
scrapingQueue.on('ready', async () => {
  try {
    // Get failed jobs older than 1 hour
    const failedJobs = await scrapingQueue.getJobs(['failed'], 0, 100);
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    for (const job of failedJobs) {
      const timestamp = job.timestamp || 0;
      if (timestamp < oneHourAgo) {
        await job.remove();
        console.log(`[Queue] 🧹 Cleaned up old failed job ${job.id}`);
      }
    }
  } catch (error) {
    // Silently fail cleanup - not critical
    console.log('[Queue] Could not clean up old jobs:', error.message);
  }
});

// Handle job failures gracefully
scrapingQueue.on('failed', (job, error) => {
  // Log all failures
  console.error(`[Queue] ❌ Job ${job?.id || 'unknown'} failed:`, error.message);
});

// Start profile search with Apollo.io
exports.startScraping = async (req, res) => {
    try {
        const { requirementId } = req.body; // Remove linkedInCredentials requirement
        const userId = req.user.userId;

        // Verify requirement belongs to user
        const requirement = await BusinessRequirements.findOne({
            where: {
                id: requirementId,
                user_id: userId
            }
        });

        if (!requirement) {
            return res.status(404).json({ message: 'Business requirement not found' });
        }

        // Check if Apollo API key is configured
        if (!process.env.APOLLO_API_KEY) {
            return res.status(400).json({ 
                message: 'Apollo.io API key is not configured. Please set APOLLO_API_KEY in your environment variables.',
                requiresApiKey: true
            });
        }

        // Update status to 'scraping' (keeping same status for compatibility)
        await requirement.update({
            status: 'scraping',
            updated_at: new Date()
        });

        // Get decision maker roles (with raw API response)
        const roles = await DecisionMakerRoles.findAll({
            where: { business_requirement_id: requirementId },
            order: [['priority', 'DESC']]
        });

        if (roles.length === 0) {
            return res.status(400).json({ message: 'No decision makers identified yet' });
        }

        // Prepare decision makers JSON for Apollo profile search
        const decisionMakersJSON = roles.map(role => ({
            role_title: role.role_title,
            priority: role.priority,
            api_source: role.api_source,
            raw_api_response: role.raw_api_response,
            industry: role.industry || requirement.industry, // Include industry if available
        }));

        // Get location from requirement
        const searchLocation = requirement.target_location || null;
        console.log(`[Profile Controller] 📍 Location from requirement: '${searchLocation}'`);

        // Add job to queue with decision makers JSON
        // Apollo.io doesn't require LinkedIn credentials
        const job = await scrapingQueue.add({
            requirementId,
            decisionMakers: decisionMakersJSON,
            location: searchLocation,
            industry: requirement.industry,
            linkedInCredentials: null, // Not needed for Apollo.io but kept for compatibility
        });
        
        console.log(`[Profile Controller] ✅ Apollo profile search job queued with location: '${searchLocation}'`);

        res.json({
            message: 'Profile search job started',
            jobId: job.id,
            status: 'processing',
        });
    } catch (error) {
        console.error('Start profile search error:', error);
        res.status(500).json({ message: 'Failed to start profile search' });
    }
};

// Get scraping status
exports.getScrapingStatus = async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = await scrapingQueue.getJob(jobId);

        if (!job) {
            return res.status(404).json({ message: 'Job not found' });
        }

        const state = await job.getState();
        const progress = job.progress();
        const jobData = job.data || {};

        // Get profiles if job is completed
        let profiles = [];
        let totalProfilesScraped = 0;
        let currentRole = null;
        let rolesCompleted = 0;
        let totalRoles = 0;
        
        // Initialize stepInfo early so it can be updated by Python API calls
        let stepInfo = {
            current_step: 'pending',
            step_details: { step: 'pending', message: 'Initializing...', progress: 0 },
            login_status: 'pending',
            login_attempt: 0,
            login_max_attempts: 3
        };

        if (state === 'completed') {
            const result = await job.finished();
            if (result && result.profiles) {
                profiles = await LinkedInProfiles.findAll({
                    where: {
                        id: { [Op.in]: result.profiles }
                    }
                });
                totalProfilesScraped = profiles.length;
            }
        } else if (state === 'active' || state === 'waiting') {
            // Estimate progress based on job data

            // If we have decision makers, calculate estimated progress
            if (jobData.decisionMakers && Array.isArray(jobData.decisionMakers)) {
                totalRoles = totalRoles || jobData.decisionMakers.length;
                // Estimate: each role takes ~20% progress, plus login (10%)
                const estimatedProgress = Math.min(90, 10 + (rolesCompleted * 18));
                if (progress === 0 || progress < estimatedProgress) {
                    // Update progress estimate
                    await job.progress(estimatedProgress);
                }
            }
        }

        // Get error details from Python API if available
        let errorDetails = undefined;
        let errorMessage = undefined;
        
        if (state === 'failed') {
            errorMessage = job.failedReason || 'Unknown error';
            // Check if Python API returned structured error details in job data
            if (jobData.errorDetails) {
                errorDetails = jobData.errorDetails;
            }
        }
        
        // Prepare response with all step tracking information
        const responseData = {
            jobId: job.id,
            status: state === 'completed' ? 'completed' : state === 'failed' ? 'failed' : state === 'active' ? 'processing' : 'pending',
            progress: stepInfo.step_details?.progress || progress || 0,
            currentRole: currentRole || (stepInfo.step_details?.message?.includes('role') ? stepInfo.step_details.message.split(':')[1]?.trim() : null),
            profilesScraped: totalProfilesScraped,
            rolesCompleted: rolesCompleted,
            totalRoles: totalRoles,
            profiles: profiles,
            error: errorMessage,
            error_details: errorDetails,
            // Step tracking information - ensure all fields are included
            current_step: stepInfo.current_step,
            step_details: stepInfo.step_details,
            login_status: stepInfo.login_status,
            login_attempt: stepInfo.login_attempt,
            login_max_attempts: stepInfo.login_max_attempts,
            // Also include camelCase versions for frontend compatibility
            currentStep: stepInfo.current_step,
            stepDetails: stepInfo.step_details,
            loginStatus: stepInfo.login_status,
            loginAttempt: stepInfo.login_attempt,
            loginMaxAttempts: stepInfo.login_max_attempts
        };
        
        // Log response for debugging (only when step info is updated)
        if (process.env.NODE_ENV === 'development' && stepInfo.current_step !== 'pending') {
            console.log('[Profile Controller] Returning scraping status:', {
                status: responseData.status,
                current_step: responseData.current_step,
                step_details_message: responseData.step_details?.message,
                login_status: responseData.login_status
            });
        }
        
        res.json(responseData);
    } catch (error) {
        console.error('Get scraping status error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get all profiles
exports.getProfiles = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { requirementId, role, location, search } = req.query;

        const whereClause = {};
        const brWhereClause = { user_id: userId };

        if (requirementId) {
            whereClause.business_requirement_id = requirementId;
        }
        if (role) {
            whereClause.decision_maker_role = role;
        }
        if (location) {
            whereClause.location = { [Op.iLike]: `%${location}%` };
        }
        if (search) {
            whereClause[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { title: { [Op.iLike]: `%${search}%` } },
                { company_name: { [Op.iLike]: `%${search}%` } }
            ];
        }

        const profiles = await LinkedInProfiles.findAll({
            include: [{
                model: BusinessRequirements,
                where: brWhereClause,
                attributes: ['operation_name', 'requirement_text']
            }],
            where: whereClause,
            order: [['scraped_at', 'DESC']],
            // Removed limit to show all profiles
        });

        // Get email addresses for profiles
        const profilesWithEmails = await Promise.all(
            profiles.map(async (profile) => {
                const email = await EmailAddresses.findOne({
                    where: { linkedin_profile_id: profile.id },
                    attributes: ['email', 'is_verified']
                });
                return {
                    ...profile.toJSON(),
                    email: email?.email || null,
                    email_verified: email?.is_verified || false,
                };
            })
        );

        res.json(profilesWithEmails);
    } catch (error) {
        console.error('Get profiles error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get profile by ID
exports.getProfileById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        const profile = await LinkedInProfiles.findOne({
            include: [{
                model: BusinessRequirements,
                where: { user_id: userId },
                attributes: ['operation_name', 'requirement_text']
            }],
            where: { id: id }
        });

        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' });
        }

        // Get email addresses
        const emails = await EmailAddresses.findAll({
            where: { linkedin_profile_id: id }
        });

        const profileData = profile.toJSON();
        profileData.emails = emails;

        res.json(profileData);
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Enrich profiles with emails
exports.enrichWithEmails = async (req, res) => {
    try {
        const { profileIds } = req.body;
        const userId = req.user.userId;

        // Verify profiles belong to user
        const profiles = await LinkedInProfiles.findAll({
            include: [{
                model: BusinessRequirements,
                where: { user_id: userId },
                attributes: []
            }],
            where: {
                id: { [Op.in]: profileIds }
            }
        });

        if (profiles.length === 0) {
            return res.status(404).json({ message: 'No profiles found' });
        }

        const enrichedProfiles = [];

        for (const profile of profiles) {
            try {
                // Check if email already exists
                const existingEmail = await EmailAddresses.findOne({
                    where: { linkedin_profile_id: profile.id }
                });

                if (existingEmail) {
                    enrichedProfiles.push({
                        ...profile.toJSON(),
                        email: existingEmail.email,
                        email_verified: existingEmail.is_verified,
                    });
                    continue;
                }

                // Enrich with Apollo.io
                // Split name into first and last name
                const nameParts = (profile.name || '').trim().split(/\s+/);
                const firstName = nameParts[0] || '';
                const lastName = nameParts.slice(1).join(' ') || '';
                
                const enriched = await apolloService.enrichPerson({
                    name: profile.name,
                    firstName: firstName,
                    lastName: lastName,
                    title: profile.title,
                    profession: profile.profession,
                    location: profile.location,
                    company_name: profile.company_name,
                    linkedin_url: profile.profile_url,
                });

                // Save email if found
                if (enriched.email) {
                    await EmailAddresses.findOrCreate({
                        where: {
                            linkedin_profile_id: profile.id,
                            email: enriched.email
                        },
                        defaults: {
                            linkedin_profile_id: profile.id,
                            email: enriched.email,
                            source: 'apollo',
                            is_verified: enriched.email_verified
                        }
                    });
                }

                enrichedProfiles.push({
                    ...profile.toJSON(),
                    email: enriched.email,
                    email_verified: enriched.email_verified,
                });
            } catch (error) {
                console.error(`Error enriching profile ${profile.id}:`, error);
                enrichedProfiles.push({
                    ...profile.toJSON(),
                    email: null,
                    email_verified: false,
                });
            }
        }

        // Update requirement status to 'closed' if all profiles have emails
        // Get all requirement IDs from enriched profiles
        const requirementIds = [...new Set(profiles.map(p => p.business_requirement_id))];

        for (const reqId of requirementIds) {
            try {
                // Check if all profiles for this requirement have emails
                const allProfiles = await LinkedInProfiles.findAll({
                    where: { business_requirement_id: reqId },
                    include: [{
                        model: EmailAddresses,
                        required: false,
                        attributes: ['id']
                    }],
                    attributes: ['id']
                });

                const allHaveEmails = allProfiles.every(p => {
                    const emails = p.get ? p.get('email_addresses') : p.email_addresses;
                    return emails && emails.length > 0;
                });

                if (allHaveEmails && allProfiles.length > 0) {
                    await BusinessRequirements.update(
                        { status: 'closed', updated_at: new Date() },
                        { where: { id: reqId } }
                    );
                    console.log(`Updated requirement ${reqId} status to 'closed'`);
                }
            } catch (error) {
                console.error(`Error updating requirement status for ${reqId}:`, error);
            }
        }

        res.json({
            message: 'Email enrichment completed',
            profiles: enrichedProfiles,
        });
    } catch (error) {
        console.error('Enrich emails error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Update or add email address manually
exports.updateEmailAddress = async (req, res) => {
    try {
        const { id } = req.params;
        const { email } = req.body;
        const userId = req.user.userId;

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            return res.status(400).json({ message: 'Please provide a valid email address' });
        }

        // Verify profile belongs to user
        const profile = await LinkedInProfiles.findOne({
            include: [{
                model: BusinessRequirements,
                where: { user_id: userId },
                attributes: []
            }],
            where: { id: id }
        });

        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' });
        }

        // Check if email already exists for this profile
        const existingEmail = await EmailAddresses.findOne({
            where: { linkedin_profile_id: id }
        });

        if (existingEmail) {
            // Update existing email
            await existingEmail.update({
                email: email,
                source: 'manual',
                updated_at: new Date()
            });

            res.json({
                message: 'Email address updated successfully',
                email: {
                    email: existingEmail.email,
                    source: existingEmail.source,
                    is_verified: existingEmail.is_verified
                }
            });
        } else {
            // Create new email address
            const newEmail = await EmailAddresses.create({
                linkedin_profile_id: id,
                email: email,
                source: 'manual',
                is_verified: false
            });

            res.json({
                message: 'Email address added successfully',
                email: {
                    email: newEmail.email,
                    source: newEmail.source,
                    is_verified: newEmail.is_verified
                }
            });
        }
    } catch (error) {
        console.error('Update email error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

