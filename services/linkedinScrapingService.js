const apolloIntegration = require('../apolloIntegration');
const {
  LinkedInProfiles,
  BusinessRequirements,
  SystemSettings
} = require('../config/model');

/**
 * Apollo Profile Service - Integration with Apollo.io API
 * Replaces LinkedIn scraping with Apollo.io profile search
 * Uses Apollo.io API for profile discovery
 */
class LinkedInScrapingService {
  constructor() {
    // No external service needed - Apollo.io is cloud-based
  }

  /**
   * Get records per role setting from database
   * @returns {Promise<number>} Number of profiles to search per role (default: 2)
   */
  async getRecordsPerRoleSetting() {
    try {
      const setting = await SystemSettings.findOne({
        where: { key: 'records_per_role' }
      });

      if (setting && setting.value) {
        const value = parseInt(setting.value, 10);
        if (!isNaN(value) && value >= 1 && value <= 100) {
          return value;
        }
      }

      // Default fallback
      console.log('[Apollo Profile Service] ⚠️  Using default records_per_role: 2 (setting not found or invalid)');
      return 2;
    } catch (error) {
      console.error('[Apollo Profile Service] ❌ Error reading records_per_role setting:', error);
      console.log('[Apollo Profile Service] ⚠️  Falling back to default: 2');
      return 2; // Default fallback on error
    }
  }

  /**
   * Search profiles using Apollo.io API
   * @param {Object} params - Search parameters
   * @param {Array} params.decisionMakers - Array of decision maker roles
   * @param {String} params.location - Target location
   * @param {String} params.industry - Target industry
   * @param {String} params.requirementId - Business requirement ID
   * @param {Object} params.linkedInCredentials - Not used (kept for compatibility)
   * @param {Object} params.job - Job reference for progress tracking
   * @returns {Promise<Array>} Array of profiles
   */
  async scrapeProfiles({ decisionMakers, location, industry, requirementId, linkedInCredentials, job = null }) {
    try {
      console.log('\n' + '='.repeat(80));
      console.log(`[Apollo Profile Service] 🚀 STARTING PROFILE SEARCH`);
      console.log('='.repeat(80));
      console.log(`[Apollo Profile Service] 📋 Requirement ID: ${requirementId}`);
      console.log(`[Apollo Profile Service] 📍 Location: ${location || 'Not specified'}`);
      console.log(`[Apollo Profile Service] 🏭 Industry: ${industry || 'Not specified'}`);
      console.log(`[Apollo Profile Service] 👥 Decision makers count: ${decisionMakers.length}`);
      console.log(`[Apollo Profile Service] 📝 Decision makers:`, decisionMakers.map(dm => dm.role_title || dm));
      console.log('='.repeat(80) + '\n');

      // Check if Apollo API key is configured
      if (!process.env.APOLLO_API_KEY) {
        console.error('[Apollo Profile Service] ❌ ERROR: APOLLO_API_KEY not configured');
        throw new Error('Apollo.io API key is not configured. Please set APOLLO_API_KEY in your environment variables.');
      }

      // Extract all role titles and industries
      const rolesWithIndustry = decisionMakers.map(dm => {
        if (typeof dm === 'object') {
          return {
            role_title: dm.role_title,
            industry: dm.industry || industry
          };
        } else {
          return {
            role_title: dm,
            industry: industry
          };
        }
      }).filter(r => r.role_title);

      if (rolesWithIndustry.length === 0) {
        console.error('[Apollo Profile Service] ❌ ERROR: No valid roles found');
        throw new Error('No valid decision maker roles found. Please add at least one decision maker role before searching.');
      }

      console.log(`[Apollo Profile Service] Searching ${rolesWithIndustry.length} role(s):`);
      rolesWithIndustry.forEach((r, index) => {
        if (r.industry) {
          console.log(`[Apollo Profile Service]   ${index + 1}. ${r.role_title} (${r.industry})`);
        } else {
          console.log(`[Apollo Profile Service]   ${index + 1}. ${r.role_title} (no industry specified)`);
        }
      });

      // Get records per role from system settings
      const recordsPerRole = await this.getRecordsPerRoleSetting();
      console.log(`[Apollo Profile Service] 📊 Configuration: ${recordsPerRole} records per role (from system settings)\n`);

      // Search for profiles for each role using Apollo.io
      let allProfiles = [];

      for (let i = 0; i < rolesWithIndustry.length; i++) {
        const roleData = rolesWithIndustry[i];
        const roleTitle = roleData.role_title;
        const roleIndustry = roleData.industry;

        console.log(`[Apollo Profile Service] 🔍 Searching for role ${i + 1}/${rolesWithIndustry.length}: ${roleTitle}`);

        try {
          // Prepare location array for Apollo
          const locations = location ? [location] : undefined;

          // Prepare search parameters
          const searchParams = {
            title: roleTitle,
            locations: locations,
            per_page: recordsPerRole,
            page: 1
          };

          // Add industry if available (Apollo uses organization_industry_tag_ids, but we'll use keywords for now)
          if (roleIndustry) {
            searchParams.keywords = roleIndustry;
          }

          // Update job progress if available
          if (job) {
            const progress = 10 + Math.floor((i / rolesWithIndustry.length) * 40); // 10-50%
            await job.progress(progress);
            console.log(`[Apollo Profile Service] 📊 Job progress: ${progress}% - Searching role: ${roleTitle}`);
          }

          // Call Apollo.io people search
          const apolloResults = await apolloIntegration.peopleSearch(searchParams);

          if (apolloResults && apolloResults.length > 0) {
            console.log(`[Apollo Profile Service] ✅ Found ${apolloResults.length} profiles for role: ${roleTitle}`);
            
            // Map Apollo.io results to our database format
            const mappedProfiles = this.mapApolloProfilesToDBFormat(
              apolloResults,
              roleTitle,
              requirementId
            );
            
            allProfiles.push(...mappedProfiles);
            console.log(`[Apollo Profile Service] ✅ Mapped ${mappedProfiles.length} profiles for role: ${roleTitle}`);
          } else {
            console.log(`[Apollo Profile Service] ⚠️  No profiles found for role: ${roleTitle}`);
          }

          // Add small delay between API calls to respect rate limits
          if (i < rolesWithIndustry.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
          }
        } catch (error) {
          console.error(`[Apollo Profile Service] ❌ Error searching for role ${roleTitle}:`, error.message);
          // Continue with other roles even if one fails
        }
      }

      console.log(`\n[Apollo Profile Service] ✅ Profile search complete`);
      console.log(`[Apollo Profile Service] 📊 Total profiles found: ${allProfiles.length}`);

      if (allProfiles.length > 0) {
        console.log(`[Apollo Profile Service] ✅ SUCCESS: Returning ${allProfiles.length} profiles\n`);
        return allProfiles;
      } else {
        console.warn(`[Apollo Profile Service] ⚠️  No profiles found for any role\n`);
        return [];
      }
    } catch (error) {
      console.error('\n' + '='.repeat(80));
      console.error('[Apollo Profile Service] ❌ CRITICAL SERVICE ERROR');
      console.error('='.repeat(80));
      console.error('[Apollo Profile Service] Error message:', error.message);
      console.error('[Apollo Profile Service] Error stack:', error.stack);
      console.error('='.repeat(80) + '\n');
      throw error;
    }
  }

  /**
   * Map Apollo.io profile format to our database format
   * Apollo format:
   * {
   *   "id": "person_id",
   *   "first_name": "John",
   *   "last_name": "Doe",
   *   "title": "CEO",
   *   "organization": { "name": "Company Name" },
   *   "city": "New York",
   *   "state": "NY",
   *   "linkedin_url": "https://linkedin.com/in/johndoe"
   * }
   * 
   * Our database format:
   * {
   *   profile_url, name, profession, title, location, company_name, decision_maker_role, experience_details
   * }
   */
  mapApolloProfilesToDBFormat(apolloProfiles, decisionMakerRole, requirementId) {
    console.log(`[Apollo Profile Service] Mapping ${apolloProfiles.length} Apollo profiles to DB format`);
    
    const mapped = apolloProfiles.map(apolloProfile => {
      // Combine first and last name
      const firstName = apolloProfile.first_name || '';
      const lastName = apolloProfile.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim() || apolloProfile.name || 'Unknown';

      // Build location string
      let locationStr = '';
      if (apolloProfile.city) {
        locationStr = apolloProfile.city;
        if (apolloProfile.state) {
          locationStr += `, ${apolloProfile.state}`;
        }
        if (apolloProfile.country) {
          locationStr += `, ${apolloProfile.country}`;
        }
      } else if (apolloProfile.location) {
        locationStr = apolloProfile.location;
      }

      // Get company name
      const companyName = apolloProfile.organization?.name || 
                         apolloProfile.organization_name || 
                         apolloProfile.company?.name || 
                         apolloProfile.company_name || 
                         null;

      // Get title/profession
      const title = apolloProfile.title || 
                   apolloProfile.job_title || 
                   apolloProfile.profession || 
                   decisionMakerRole;

      const mappedProfile = {
        profile_url: apolloProfile.linkedin_url || apolloProfile.linkedin_url || apolloProfile.person_linkedin_url || null,
        name: fullName,
        profession: title,
        title: title,
        location: locationStr || null,
        company_name: companyName,
        decision_maker_role: decisionMakerRole,
        experience_details: [{
          title: title,
          company: companyName,
          duration: apolloProfile.duration || 'N/A',
          description: apolloProfile.description || apolloProfile.summary || '',
        }],
        scraped_at: new Date().toISOString(),
        // Store Apollo person ID for future reference (optional)
        apollo_person_id: apolloProfile.id || null,
      };

      // Validate required fields
      if (!mappedProfile.profile_url) {
        console.warn(`[Apollo Profile Service] ⚠️  Profile ${mappedProfile.name} missing LinkedIn URL, skipping`);
        return null;
      }
      if (!mappedProfile.name || mappedProfile.name === 'Unknown') {
        console.warn(`[Apollo Profile Service] ⚠️  Profile missing name, skipping`);
        return null;
      }
      
      console.log(`[Apollo Profile Service] Mapped profile: ${mappedProfile.name} (${mappedProfile.profile_url})`);

      return mappedProfile;
    }).filter(p => p !== null); // Remove null entries (profiles without LinkedIn URLs)
    
    return mapped;
  }

  /**
   * Store profiles in database
   * @param {String} requirementId - Business requirement ID
   * @param {Array} profiles - Profiles to store
   * @returns {Promise<Array>} Stored profiles
   */
  async storeProfiles(requirementId, profiles) {
    console.log(`[Apollo Profile Service] Storing ${profiles.length} profiles for requirement ${requirementId}`);
    const storedProfiles = [];

    for (const profile of profiles) {
      try {
        // Validate required fields
        if (!profile.profile_url || !profile.name) {
          console.warn(`[Apollo Profile Service] Skipping profile with missing required fields:`, profile);
          continue;
        }

        // Check if profile exists (profile_url is unique)
        let storedProfile = await LinkedInProfiles.findOne({
          where: { profile_url: profile.profile_url }
        });

        if (storedProfile) {
          // Profile exists, update it and link to this requirement
          await storedProfile.update({
            business_requirement_id: requirementId,
            name: profile.name,
            title: profile.title || null,
            company_name: profile.company_name || null,
            experience_details: profile.experience_details || [],
            decision_maker_role: profile.decision_maker_role || null,
            updated_at: new Date()
          });
          console.log(`[Apollo Profile Service] ✅ Updated existing profile: ${profile.name} (${storedProfile.id}) and linked to requirement ${requirementId}`);
        } else {
          // New profile, create it
          storedProfile = await LinkedInProfiles.create({
            business_requirement_id: requirementId,
            profile_url: profile.profile_url,
            name: profile.name,
            profession: profile.profession || null,
            title: profile.title || null,
            location: profile.location || null,
            company_name: profile.company_name || null,
            decision_maker_role: profile.decision_maker_role || null,
            experience_details: profile.experience_details || [],
            scraped_at: profile.scraped_at || new Date(),
          });
          console.log(`[Apollo Profile Service] ✅ Created new profile: ${profile.name} (${storedProfile.id})`);
        }

        storedProfiles.push(storedProfile);
        console.log(`[Apollo Profile Service] ✅ Profile processed: ${profile.name} (${storedProfile.id}) - Progress: ${storedProfiles.length}/${profiles.length}`);
      } catch (error) {
        console.error(`[Apollo Profile Service] Error storing profile ${profile.profile_url}:`, error.message);
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
        console.log(`[Apollo Profile Service] ✅ Updated requirement ${requirementId} status to 'enriched' (${storedProfiles.length} profiles stored)`);
      } catch (error) {
        console.error(`[Apollo Profile Service] Error updating requirement status:`, error);
      }
    } else {
      console.warn(`[Apollo Profile Service] No profiles were stored for requirement ${requirementId}`);
    }

    return storedProfiles;
  }
}

module.exports = new LinkedInScrapingService();
