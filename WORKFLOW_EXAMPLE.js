// File: workflow.js
// Save this as: workflow.js
// This is the main workflow that uses apolloIntegration.js
// Reads actual scraped data from scrapping-automation folder

require('dotenv').config(); // Load from .env file
const fs = require('fs');
const path = require('path');
const apollo = require('./apolloIntegration');

/**
 * Load scraped data from scrapping-automation folder
 * Looks for completed job files (job_*_complete.json or job_*_output.json)
 * or reads from completed_jobs.json
 */
function loadScrapedData() {
    const scrappingFolder = path.join(__dirname, '..', 'scrapping-automation');
    const profiles = [];

    try {
        // Try to read from completed_jobs.json first
        const completedJobsPath = path.join(scrappingFolder, 'completed_jobs.json');
        if (fs.existsSync(completedJobsPath)) {
            console.log(`📂 Reading from: ${completedJobsPath}`);
            const completedJobs = JSON.parse(fs.readFileSync(completedJobsPath, 'utf8'));
            
            // Find the most recent completed job
            let latestJob = null;
            let latestTime = 0;
            
            for (const [jobId, jobData] of Object.entries(completedJobs)) {
                if (jobData.status === 'completed' && jobData.result && jobData.result.success) {
                    const endTime = jobData.end_time || 0;
                    if (endTime > latestTime) {
                        latestTime = endTime;
                        latestJob = jobData;
                    }
                }
            }
            
            if (latestJob && latestJob.result) {
                const result = latestJob.result;
                
                // Handle both new format (role_results) and old format (data array)
                if (result.role_results && Array.isArray(result.role_results)) {
                    // New format: grouped by role
                    for (const roleResult of result.role_results) {
                        if (roleResult.profiles && Array.isArray(roleResult.profiles)) {
                            for (const profile of roleResult.profiles) {
                                profiles.push(transformProfile(profile, roleResult.role));
                            }
                        }
                    }
                } else if (result.data && Array.isArray(result.data)) {
                    // Old format: flat array
                    for (const profile of result.data) {
                        profiles.push(transformProfile(profile));
                    }
                }
                
                console.log(`✅ Loaded ${profiles.length} profiles from completed_jobs.json`);
                return profiles;
            }
        }

        // Fallback: Try to find individual job files
        const files = fs.readdirSync(scrappingFolder);
        const jobFiles = files.filter(f => 
            (f.startsWith('job_') && f.endsWith('_complete.json')) ||
            (f.startsWith('job_') && f.endsWith('_output.json'))
        ).sort().reverse(); // Get most recent first

        for (const file of jobFiles) {
            const filePath = path.join(scrappingFolder, file);
            try {
                const jobData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                
                if (jobData.result && jobData.result.success) {
                    const result = jobData.result;
                    
                    // Handle both formats
                    if (result.role_results && Array.isArray(result.role_results)) {
                        for (const roleResult of result.role_results) {
                            if (roleResult.profiles && Array.isArray(roleResult.profiles)) {
                                for (const profile of roleResult.profiles) {
                                    profiles.push(transformProfile(profile, roleResult.role));
                                }
                            }
                        }
                    } else if (result.data && Array.isArray(result.data)) {
                        for (const profile of result.data) {
                            profiles.push(transformProfile(profile));
                        }
                    }
                    
                    if (profiles.length > 0) {
                        console.log(`✅ Loaded ${profiles.length} profiles from ${file}`);
                        return profiles;
                    }
                }
            } catch (err) {
                console.warn(`⚠️  Error reading ${file}:`, err.message);
            }
        }
    } catch (error) {
        console.error(`❌ Error loading scraped data:`, error.message);
    }

    return profiles;
}

/**
 * Transform scraped profile to format expected by Apollo enrichment
 */
function transformProfile(profile, role = null) {
    // Extract first and last name from full name
    const nameParts = (profile.name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    return {
        linkedinUrl: profile.url || profile.linkedin_url || profile.profile_url,
        name: profile.name,
        firstName: firstName,
        lastName: lastName,
        title: profile.designation || profile.title || profile.profession,
        company: profile.company_name || profile.company,
        location: profile.location,
        decisionMakerRole: role || profile.decision_maker_role || null
    };
}

async function main() {
    console.log('='.repeat(70));
    console.log('🚀 LEAD GENERATION WORKFLOW');
    console.log('='.repeat(70));
    console.log();
    
    if (!process.env.APOLLO_API_KEY) {
        console.error('❌ APOLLO_API_KEY is not set. Add it to .env file');
        console.error('   Get your key from: https://app.apollo.io/#/settings/integrations/api');
        process.exit(1);
    } else {
        console.log('✅ Apollo API Key found');
    }

    // Load actual scraped data from scrapping-automation folder
    console.log(`\n📂 Loading scraped data from scrapping-automation folder...`);
    const profiles = loadScrapedData();
    
    if (profiles.length === 0) {
        console.error('❌ No scraped profiles found in scrapping-automation folder');
        console.error('   Please run LinkedIn scraping first to generate profile data');
        console.error('   Expected files: completed_jobs.json or job_*_complete.json');
        process.exit(1);
    }
    
    console.log(`\n📋 Processing ${profiles.length} profiles from LinkedIn scraping`);

    console.log(`\n🔄 Starting Apollo enrichment process...`);
    console.log(`   Rate limit: 250ms delay between requests`);
    console.log(`   This may take a few minutes for ${profiles.length} profiles...`);
    console.log();
    
    const enriched = await apollo.batchEnrichPeople(profiles, 250);

    const leadsWithEmail = enriched.filter(l => l.email);
    const leadsWithoutEmail = enriched.filter(l => !l.email);

    console.log('\n' + '='.repeat(70));
    console.log('📊 RESULTS SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total Leads: ${enriched.length}`);
    console.log(`✅ With Email: ${leadsWithEmail.length}`);
    console.log(`❌ Without Email: ${leadsWithoutEmail.length}`);
    console.log();

    if (leadsWithEmail.length > 0) {
        console.log('✅ LEADS WITH EMAIL ADDRESSES:');
        console.log('-'.repeat(70));
        leadsWithEmail.forEach((l, i) => {
            console.log(`${i + 1}. ${l.name}`);
            console.log(`   Email: ${l.email}`);
            console.log(`   Status: ${l.emailStatus || l.email_status || 'unknown'}`);
            console.log(`   Company: ${l.company || 'N/A'}`);
            console.log(`   LinkedIn: ${l.linkedinUrl || 'N/A'}`);
            console.log();
        });
    }

    if (leadsWithoutEmail.length > 0) {
        console.log('❌ LEADS WITHOUT EMAIL ADDRESSES:');
        console.log('-'.repeat(70));
        leadsWithoutEmail.forEach((l, i) => {
            console.log(`${i + 1}. ${l.name || 'Unknown'}`);
            console.log(`   Company: ${l.company || 'N/A'}`);
            console.log(`   LinkedIn: ${l.linkedinUrl || 'N/A'}`);
            console.log();
        });
    }

    // Output as JSON array of objects for DB storage (only leads with email)
    const leadsArray = leadsWithEmail.map(lead => ({
        name: lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
        email: lead.email,
        status: lead.emailStatus || lead.email_status || 'unknown',
        company: lead.company || null,
        linkedin: lead.linkedinUrl || lead.linkedin_url || null,
        title: lead.title || null,
        location: lead.location || null,
        firstName: lead.firstName || null,
        lastName: lead.lastName || null
    }));

    // Save as JSON array for DB import
    fs.writeFileSync('leads_output.json', JSON.stringify(leadsArray, null, 2));
    console.log('\n💾 Results saved to leads_output.json (JSON array format for DB)');
    console.log(`   Format: Array of ${leadsArray.length} objects ready for database import`);
    console.log('   File contains only leads with email addresses');
    console.log('='.repeat(70));
}

if (require.main === module) {
    main().catch(err => {
        console.error('Workflow failed:', err && err.message ? err.message : err);
        process.exit(1);
    });
}

module.exports = { main };
