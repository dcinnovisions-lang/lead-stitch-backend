const linkedinScrapingService = require('../services/linkedinScrapingService');
const apolloIntegration = require('../apolloIntegration');
const { EmailAddresses, LinkedInProfiles, BusinessRequirements, SystemSettings } = require('../config/model');
const scrapingNotificationService = require('../services/scrapingNotificationService');

/**
 * Apollo Profile Search Job Processor
 * This job receives decision makers JSON and searches for profiles using Apollo.io
 * Uses Apollo.io API to search by role/title and get people with emails directly
 * No LinkedIn URLs required - searches Apollo directly using role data from Gemini
 */
async function processLinkedInScraping(job) {
  const { requirementId, decisionMakers, location, industry, linkedInCredentials } = job.data;

  try {
    // Update job progress
    await job.progress(10);
    console.log(`[Apollo Job] 📊 Job progress: 10% - Starting Apollo.io role-based search`);
    console.log(`[Apollo Job] 🌍 Location filter: "${location}"`);

    if (!process.env.APOLLO_API_KEY) {
      throw new Error('APOLLO_API_KEY not set in environment variables');
    }

    // Validate decision makers data
    if (!decisionMakers || !Array.isArray(decisionMakers) || decisionMakers.length === 0) {
      throw new Error('No decision makers provided. Please identify decision makers first.');
    }

    console.log(`[Apollo Job] 🔍 Searching Apollo for ${decisionMakers.length} roles...`);

    // Get profiles per role setting from database (admin configured)
    let profilesPerRole = 25; // Default fallback
    try {
      const setting = await SystemSettings.findOne({ where: { key: 'records_per_role' } });
      if (setting && setting.value) {
        profilesPerRole = Math.min(parseInt(setting.value, 10) || 25, 100);
        console.log(`[Apollo Job] 📋 Using admin-configured profiles per role: ${profilesPerRole}`);
      }
    } catch (settingError) {
      console.warn(`[Apollo Job] ⚠️ Could not load records_per_role setting, using default: 25`, settingError.message);
    }

    // Use new role-based search function to get people with emails directly
    await job.progress(20);
    const peopleWithEmails = await apolloIntegration.batchSearchPeopleByRoles(
      decisionMakers,
      {
        location,
        industry,
        per_page: profilesPerRole, // Use admin-configured setting instead of hardcoded 25
        delayMs: 300 // Rate limiting between role searches
      }
    );

    await job.progress(60);
    console.log(`[Apollo Job] 📊 Storing ${peopleWithEmails.length} profiles in database...`);
    console.log(`[Apollo Job] ✅ Profiles from location "${location}": ${peopleWithEmails.length}`);

    // Transform Apollo results to profile format for storage
    const profilesToStore = peopleWithEmails.map((person, index) => {
      // Generate a unique profile_url (required field)
      // Use LinkedIn URL if available, otherwise use Apollo person ID or email-based URL
      const profileUrl = person.linkedin_url ||
        (person.id ? `apollo://${person.id}` : null) ||
        (person.email ? `apollo://email/${person.email.replace('@', '_at_')}` : `apollo://unknown/${index}`);

      return {
        profile_url: profileUrl,
        name: person.first_name || person.firstName || (person.name ? person.name : 'Unknown'),
        profession: person.title || null,
        title: person.title || null,
        location: person.city || person.state || person.location || null,
        company_name: person.organization_name || person.company || null,
        decision_maker_role: person.title || null,
        experience_details: person || {},
        scraped_at: new Date(),
        // Store email data separately for later
        _email: person.email,
        _emailStatus: person.email_status || person.emailStatus,
        _apolloData: person
      };
    });

    // Store profiles in database
    const storedProfiles = [];
    let emailFoundCount = 0;

    for (const profile of profilesToStore) {
      try {
        // Check if profile exists (by profile_url)
        let storedProfile = await LinkedInProfiles.findOne({
          where: { profile_url: profile.profile_url }
        });

        if (storedProfile) {
          // Update existing profile and link to this requirement
          await storedProfile.update({
            business_requirement_id: requirementId,
            name: profile.name,
            title: profile.title || null,
            company_name: profile.company_name || null,
            location: profile.location || null,
            decision_maker_role: profile.decision_maker_role || null,
            experience_details: profile.experience_details || {},
            updated_at: new Date()
          });
        } else {
          // Create new profile
          storedProfile = await LinkedInProfiles.create({
            business_requirement_id: requirementId,
            profile_url: profile.profile_url,
            name: profile.name,
            profession: profile.profession || null,
            title: profile.title || null,
            location: profile.location || null,
            company_name: profile.company_name || null,
            decision_maker_role: profile.decision_maker_role || null,
            experience_details: profile.experience_details || {},
            scraped_at: profile.scraped_at,
          });
        }

        storedProfiles.push(storedProfile);

        // Store email address directly (we already have it from Apollo)
        if (profile._email && storedProfile) {
          try {
            // Check if email already exists for this profile
            const existingEmail = await EmailAddresses.findOne({
              where: {
                linkedin_profile_id: storedProfile.id,
                email: profile._email
              }
            });

            if (!existingEmail) {
              // Determine if email is verified based on status
              const isVerified = profile._emailStatus === 'verified' ||
                profile._emailStatus === 'guessed' ||
                profile._emailStatus === 'valid';

              await EmailAddresses.create({
                linkedin_profile_id: storedProfile.id,
                email: profile._email,
                source: 'apollo',
                is_verified: isVerified,
                verification_date: isVerified ? new Date() : null,
              });

              emailFoundCount++;
            } else {
              // Email already exists, skip
            }
          } catch (emailError) {
            console.error(`[Apollo Job] ❌ Error saving email for profile ${profile.name}:`, emailError.message);
          }
        }
      } catch (error) {
        console.error(`[Apollo Job] ❌ Error storing profile ${profile.profile_url}:`, error.message);
        // Continue with other profiles even if one fails
      }
    }

    // Update requirement status to 'enriched' after profiles are stored
    if (storedProfiles.length > 0) {
      try {
        await BusinessRequirements.update(
          {
            status: 'enriched',
            updated_at: new Date()
          },
          { where: { id: requirementId } }
        );
      } catch (error) {
        console.error(`[Apollo Job] ⚠️  Error updating requirement status:`, error.message);
      }
    }

    await job.progress(90);
    await job.progress(100);
    console.log(`[Apollo Job] ✅ Complete! Stored ${storedProfiles.length} profiles with ${emailFoundCount} emails`);

    // EMAIL SENDING DISABLED - Uncomment below to enable
    // try {
    //   const emailSent = await scrapingNotificationService.sendScrapingCompletionNotification(
    //     requirementId,
    //     storedProfiles.length,
    //     true,
    //     null
    //   );
    // } catch (emailError) {
    //   console.error('[Apollo Job] ⚠️  Email notification error:', emailError.message);
    // }

    return {
      success: true,
      profilesCount: storedProfiles.length,
      profiles: storedProfiles.map(p => p.id),
      scrapedProfiles: storedProfiles,
      enrichedCount: emailFoundCount,
    };
  } catch (error) {
    console.error('[Apollo Job] ❌ Error:', error.message);

    // EMAIL SENDING DISABLED - Uncomment below to enable
    // try {
    //   await scrapingNotificationService.sendScrapingCompletionNotification(
    //     requirementId,
    //     0,
    //     false,
    //     error.message || 'An unknown error occurred during profile search'
    //   );
    // } catch (emailError) {
    //   console.error('[Apollo Job] ⚠️  Failed to send failure email:', emailError.message);
    // }

    throw error;
  }
}

module.exports = processLinkedInScraping;

