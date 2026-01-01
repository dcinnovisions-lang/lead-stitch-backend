const linkedinScrapingService = require('../services/linkedinScrapingService');
const apolloIntegration = require('../apolloIntegration');
const { EmailAddresses } = require('../config/model');
const scrapingNotificationService = require('../services/scrapingNotificationService');

/**
 * Apollo Profile Search Job Processor
 * This job receives decision makers JSON and searches for profiles using Apollo.io
 * Uses Apollo.io API for profile discovery
 * After profile search, enriches profiles with email addresses using Apollo API
 */
async function processLinkedInScraping(job) {
  const { requirementId, decisionMakers, location, industry, linkedInCredentials } = job.data;

  try {
    // Update job progress
    await job.progress(10);
    console.log(`[Apollo Job] 📊 Job progress: 10% - Starting Apollo.io profile search`);

    // Use Apollo Profile Service to search for profiles
    const scrapedProfiles = await linkedinScrapingService.scrapeProfiles({
      decisionMakers,
      location,
      industry,
      requirementId,
      linkedInCredentials, // Not used but kept for compatibility
      job: job, // Pass job reference for status tracking
    });

    await job.progress(50);
    console.log(`[Apollo Job] 📊 Job progress: 50% - Profiles found, storing in database`);

    // Store scraped profiles in database
    const storedProfiles = await linkedinScrapingService.storeProfiles(
      requirementId,
      scrapedProfiles
    );

    await job.progress(70);
    console.log(`[Apollo Job] 📊 Job progress: 70% - Profiles stored, starting email enrichment`);

    // Enrich profiles with email addresses using Apollo API
    let enrichedCount = 0;
    let emailFoundCount = 0;

    if (storedProfiles.length > 0 && process.env.APOLLO_API_KEY) {
      console.log(`[Apollo Job] 🔍 Starting email enrichment for ${storedProfiles.length} profiles...`);
      
      // Prepare profiles for Apollo enrichment
      const profilesForEnrichment = storedProfiles.map(profile => {
        // Extract first and last name from full name
        const nameParts = (profile.name || '').trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        return {
          linkedinUrl: profile.profile_url,
          name: profile.name,
          firstName: firstName,
          lastName: lastName,
          company: profile.company_name,
          title: profile.title || profile.profession,
          location: profile.location,
        };
      });

      // Batch enrich with Apollo (250ms delay between requests for rate limiting)
      try {
        const enrichedProfiles = await apolloIntegration.batchEnrichPeople(profilesForEnrichment, 250);
        enrichedCount = enrichedProfiles.length;

        // Save email addresses to database
        for (let i = 0; i < enrichedProfiles.length; i++) {
          const enriched = enrichedProfiles[i];
          const storedProfile = storedProfiles[i];

          if (enriched && enriched.email && storedProfile) {
            try {
              // Check if email already exists for this profile
              const existingEmail = await EmailAddresses.findOne({
                where: {
                  linkedin_profile_id: storedProfile.id,
                  email: enriched.email
                }
              });

              if (!existingEmail) {
                // Determine if email is verified based on status
                const isVerified = enriched.emailStatus === 'verified' || 
                                 enriched.email_status === 'verified' ||
                                 enriched.emailStatus === 'guessed' ||
                                 enriched.email_status === 'guessed';

                await EmailAddresses.create({
                  linkedin_profile_id: storedProfile.id,
                  email: enriched.email,
                  source: 'apollo',
                  is_verified: isVerified,
                  verification_date: isVerified ? new Date() : null,
                });

                emailFoundCount++;
                console.log(`[Apollo Job] ✅ Enriched profile ${storedProfile.name} with email: ${enriched.email} (verified: ${isVerified})`);
              } else {
                console.log(`[Apollo Job] ℹ️  Email already exists for profile ${storedProfile.name}`);
              }
            } catch (emailError) {
              console.error(`[Apollo Job] ❌ Error saving email for profile ${storedProfile.name}:`, emailError.message);
            }
          } else if (storedProfile) {
            console.log(`[Apollo Job] ⚠️  No email found for profile ${storedProfile.name}`);
          }
        }

        console.log(`[Apollo Job] ✅ Email enrichment complete: ${emailFoundCount}/${enrichedCount} profiles enriched with email addresses`);
      } catch (apolloError) {
        console.error(`[Apollo Job] ❌ Email enrichment error:`, apolloError.message);
        console.error(`[Apollo Job] ⚠️  Continuing without email enrichment...`);
        // Don't fail the job if email enrichment fails
      }
    } else if (!process.env.APOLLO_API_KEY) {
      console.log(`[Apollo Job] ⚠️  APOLLO_API_KEY not set, skipping email enrichment`);
    } else {
      console.log(`[Apollo Job] ⚠️  No profiles to enrich`);
    }

    await job.progress(100);
    console.log(`[Apollo Job] 📊 Job progress: 100% - Complete! Stored ${storedProfiles.length} profiles, enriched ${emailFoundCount} with emails`);

    // Send email notification for successful completion
    console.log(`\n📧 [Apollo Job] Attempting to send completion email for ${storedProfiles.length} profiles...`);
    try {
      const emailSent = await scrapingNotificationService.sendScrapingCompletionNotification(
        requirementId,
        storedProfiles.length,
        true,
        null
      );
      if (emailSent) {
        console.log(`✅ [Apollo Job] Completion email sent successfully`);
      } else {
        console.error(`❌ [Apollo Job] Failed to send completion email (service returned false)`);
      }
    } catch (emailError) {
      console.error('[Apollo Job] ❌ Exception while sending completion email:', emailError.message);
      console.error('[Apollo Job] ❌ Email error stack:', emailError.stack);
      // Don't fail the job if email fails
    }

    return {
      success: true,
      profilesCount: storedProfiles.length,
      profiles: storedProfiles.map(p => p.id),
      scrapedProfiles: storedProfiles,
      enrichedCount: emailFoundCount,
    };
  } catch (error) {
    console.error('[Apollo Job] ❌ Apollo profile search job error:', error);
    
    // Send email notification for failure
    try {
      await scrapingNotificationService.sendScrapingCompletionNotification(
        requirementId,
        0,
        false,
        error.message || 'An unknown error occurred during profile search'
      );
    } catch (emailError) {
      console.error('[Apollo Job] ⚠️  Failed to send failure email:', emailError.message);
      // Don't fail the job if email fails
    }
    
    throw error;
  }
}

module.exports = processLinkedInScraping;

