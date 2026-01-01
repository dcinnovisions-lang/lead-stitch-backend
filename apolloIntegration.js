// File: apolloIntegration.js
// Apollo.io API Integration Helper
// Save this as: apolloIntegration.js
// Get your API key from: https://app.apollo.io/#/settings/integrations/api

require('dotenv').config(); // Load from .env file
const axios = require('axios');

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1'; // correct base

if (!APOLLO_API_KEY) {
    console.warn('⚠️  APOLLO_API_KEY not found in .env file. Set APOLLO_API_KEY=your_key');
}

async function callApollo(path, options = {}) {
    const url = `${APOLLO_BASE_URL}${path}`;
    console.log(`\n📡 Apollo API Call: ${options.method || 'POST'} ${path}`);
    if (options.data) {
        console.log('   Payload:', JSON.stringify(options.data, null, 2));
    }
    if (options.params) {
        console.log('   Query Params:', JSON.stringify(options.params, null, 2));
    }

    try {
        const res = await axios({
            method: options.method || 'post',
            url,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'X-Api-Key': APOLLO_API_KEY,
                accept: 'application/json'
            },
            params: options.params || undefined,
            data: options.data || undefined,
            timeout: options.timeout || 15000
        });

        console.log(`   ✅ Status: ${res.status}`);
        if (res.data) {
            const dataStr = JSON.stringify(res.data).substring(0, 200);
            console.log(`   Response: ${dataStr}${JSON.stringify(res.data).length > 200 ? '...' : ''}`);
        }

        return res.data;
    } catch (err) {
        if (err.response) {
            console.log(`   ❌ Error Status: ${err.response.status}`);
            console.log(`   Error Data:`, JSON.stringify(err.response.data, null, 2));
            return { __error: true, status: err.response.status, data: err.response.data };
        }
        console.log(`   ❌ Error: ${err.message}`);
        return { __error: true, message: err.message };
    }
}

// 1) contacts/search - returns contacts that exist in your Apollo workspace
async function searchContacts(searchParams = {}) {
    console.log('\n🔍 Searching contacts...');
    const res = await callApollo('/contacts/search', { data: searchParams });
    if (res && res.__error) {
        console.log('   ⚠️  API Error occurred');
        return [];
    }
    // Check for both 'contacts' and 'people' in response
    if (res && res.contacts && Array.isArray(res.contacts)) {
        console.log(`   ✅ Found ${res.contacts.length} contacts`);
        return res.contacts;
    }
    if (res && res.people && Array.isArray(res.people)) {
        console.log(`   ✅ Found ${res.people.length} people`);
        return res.people;
    }
    console.log('   ℹ️  No contacts found');
    return [];
}

// 2) people/match - attempt to enrich/match a person by email/linkedin/name/domain
async function peopleMatch({ email, linkedinUrl, firstName, lastName, domain } = {}) {
    console.log('\n🔗 Attempting people/match...');
    // people/match supports email as query param; include body fields as available
    const params = {};
    if (email) params.email = email;

    const body = {};
    if (firstName) body.first_name = firstName;
    if (lastName) body.last_name = lastName;
    if (linkedinUrl) body.linkedin_url = linkedinUrl;
    if (domain) body.domain = domain; // employer domain (eg kpmg.com)

    const res = await callApollo('/people/match', { params, data: body });
    if (res && res.__error) {
        console.log('   ⚠️  people/match failed');
        return res;
    }
    if (res && res.person) {
        console.log('   ✅ Match found!');
        return res;
    }
    console.log('   ℹ️  No match found');
    return res;
}

// 3) mixed_people/api_search - search prospect pool
// IMPORTANT: Use proper payload structure for Apollo API
async function peopleSearch({ keywords, title, locations, page = 1, per_page = 10 } = {}) {
    const payload = {
        page,
        per_page,
        person_titles: title ? [title] : undefined,  // Array of titles
        location: locations && locations.length > 0 ? locations : undefined,  // Array of locations
        q_keywords: keywords || undefined  // Keywords as q_keywords
    };

    // Remove undefined fields
    Object.keys(payload).forEach(key => {
        if (payload[key] === undefined) {
            delete payload[key];
        }
    });

    const res = await callApollo('/mixed_people/api_search', { data: payload });
    if (res && res.people && Array.isArray(res.people)) return res.people;
    return [];
}

// Primary function: get email by LinkedIn URL (tries people/match -> contacts/search -> mixed_people)
async function getEmailByLinkedInUrl(linkedinUrl, firstName = null, lastName = null, companyOrDomain = null) {
    if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY not set');

    console.log(`\n📧 Getting email for: ${firstName} ${lastName} (${linkedinUrl})`);

    // 1) people/match (best chance of enrichment)
    try {
        console.log('   Method 1: Trying people/match...');
        const match = await peopleMatch({ linkedinUrl, firstName, lastName, domain: companyOrDomain });
        if (match && !match.__error && match.person) {
            const p = match.person;
            const email = p.email || (p.emails && p.emails[0]) || null;
            if (email) {
                console.log(`   ✅ Email found via people/match: ${email}`);
                return { ...p, email, email_status: p.email_verification_status || p.email_status || 'verified' };
            }
        }
    } catch (e) {
        console.log(`   ⚠️  people/match error: ${e.message}`);
    }

    // 2) contacts/search (only finds contacts imported into your workspace)
    try {
        console.log('   Method 2: Trying contacts/search...');
        const contactsPayload = { page: 1, per_page: 10 };
        if (linkedinUrl) contactsPayload.person_linkedin_url = linkedinUrl;
        if (firstName) contactsPayload.person_first_name = firstName;
        if (lastName) contactsPayload.person_last_name = lastName;
        if (companyOrDomain) contactsPayload.organization_names = [companyOrDomain];

        const contacts = await searchContacts(contactsPayload);
        if (contacts && contacts.length > 0) {
            const c = contacts[0];
            const email = c.email || (c.emails && c.emails[0]) || null;
            if (email) {
                console.log(`   ✅ Email found via contacts/search: ${email}`);
                return { ...c, email, email_status: c.email_status || 'unknown' };
            }
        }
    } catch (e) {
        console.log(`   ⚠️  contacts/search error: ${e.message}`);
    }

    // 3) mixed_people/api_search (search the prospecting index)
    try {
        console.log('   Method 3: Trying mixed_people/api_search...');
        const keywords = `${firstName || ''} ${lastName || ''}`.trim();
        const people = await peopleSearch({ keywords, title: null, locations: companyOrDomain ? [companyOrDomain] : undefined, page: 1, per_page: 5 });
        if (people && people.length > 0) {
            const p = people[0];
            const email = p.email || (p.emails && p.emails[0]) || null;
            if (email) {
                console.log(`   ✅ Email found via mixed_people: ${email}`);
                return { ...p, email, email_status: p.email_status || 'unknown' };
            }
        }
    } catch (e) {
        console.log(`   ⚠️  mixed_people error: ${e.message}`);
    }

    console.log('   ❌ No email found with any method');
    return null;
}

// Search by name + company using contacts.search
async function searchPersonByName(firstName, lastName, company, title = null) {
    const searchParams = {
        q_keywords: `${firstName || ''} ${lastName || ''}`.trim(),
        organization_names: company ? [company] : undefined,
        page: 1,
        per_page: 10
    };
    if (title) searchParams.person_titles = [title];
    return await searchContacts(searchParams);
}

// Enrich a single person object
async function enrichPerson(personData) {
    const { linkedinUrl, firstName, lastName, company, title, email, name } = personData;

    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔍 Enriching: ${name || `${firstName} ${lastName}`}`);

    // If personData already contains an email, we can optionally verify via peopleMatch
    if (email) {
        console.log('   ℹ️  Email already provided, verifying...');
        try {
            const matched = await peopleMatch({ email, firstName, lastName, domain: company });
            if (matched && !matched.__error && matched.person && (matched.person.email || (matched.person.emails && matched.person.emails[0]))) {
                const p = matched.person;
                console.log(`   ✅ Email verified: ${p.email || (matched.person.emails && matched.person.emails[0])}`);
                return { ...personData, email: p.email || (matched.person.emails && matched.person.emails[0]), emailStatus: p.email_verification_status || 'verified', enriched: true };
            }
        } catch (e) {
            console.log(`   ⚠️  Verification error: ${e.message}`);
        }
    }

    // Try LinkedIn-based enrichment
    if (linkedinUrl) {
        const contact = await getEmailByLinkedInUrl(linkedinUrl, firstName, lastName, company && company.includes('.') ? company : undefined);
        if (contact && contact.email) {
            return { ...personData, email: contact.email, emailStatus: contact.email_status || 'verified', enriched: true };
        }
    }

    // Fallback: name + company
    if (firstName && lastName && company) {
        console.log('   Method 4: Trying name + company search...');
        const contacts = await searchPersonByName(firstName, lastName, company, title);
        if (contacts && contacts.length > 0) {
            const match = contacts[0];
            const email = match.email || (match.emails && match.emails[0]) || null;
            if (email) {
                console.log(`   ✅ Email found via name search: ${email}`);
                return { ...personData, email, emailStatus: match.email_status || 'guessed', enriched: true };
            }
        }
    }

    console.log(`   ❌ No email found for ${name || `${firstName} ${lastName}`}`);
    return { ...personData, email: null, emailStatus: 'not_found', enriched: false };
}

// NEW: Direct Apollo people search with optimized payload - THIS IS THE CORRECT FORMAT
async function directPeopleSearch({ personTitle, personTitles = [], location, industry, page = 1, per_page = 25 } = {}) {
    if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY not set');

    // Enforce per_page limit (1-100) - respects admin configuration
    per_page = Math.min(Math.max(parseInt(per_page) || 25, 1), 100);

    // Build person_titles array
    const titles = personTitles && personTitles.length > 0 ? personTitles : (personTitle ? [personTitle] : []);

    // Build locations array - normalize and validate
    let locations = undefined;
    let locationsArray = [];
    if (location) {
        locationsArray = Array.isArray(location) ? location : [location];
        // Filter out empty strings
        locationsArray = locationsArray.filter(loc => loc && loc.trim());
        locations = locationsArray.length > 0 ? locationsArray : undefined;
    }

    // Optimized payload following Apollo.io API docs
    const payload = {
        page: page || 1,
        per_page: per_page,
        person_titles: titles.length > 0 ? titles : undefined,
        locations: locations,
        organization_locations: locations,  // Also try organization_locations
        include_fields: [
            'email',
            'emails',
            'email_status',
            'email_verification_status',
            'first_name',
            'last_name',
            'title',
            'organization_name',
            'city',
            'state',
            'country',
            'phone_numbers',
            'linkedin_url',
            'id'
        ]
    };

    // Add industry keywords if provided
    if (industry) {
        payload.q_keywords = industry;
    }

    // Remove undefined fields
    Object.keys(payload).forEach(key => {
        if (payload[key] === undefined || payload[key] === null ||
            (Array.isArray(payload[key]) && payload[key].length === 0)) {
            delete payload[key];
        }
    });

    console.log(`\n📡 Apollo Direct Search Payload:`, JSON.stringify(payload, null, 2));
    if (locations) {
        console.log(`   🌍 Location filter applied: ${locationsArray.join(', ')}`);
    }

    try {
        const res = await callApollo('/mixed_people/api_search', { data: payload });

        if (res && res.__error) {
            console.log(`   ❌ Apollo API error: ${res.data?.message || res.message}`);
            return [];
        }

        if (res && res.people && Array.isArray(res.people)) {
            console.log(`   ✅ Got ${res.people.length} results from Apollo`);

            // NOTE: Apollo already filters by location server-side via locations and organization_locations params
            // We should NOT do redundant client-side filtering that removes valid results
            // Just return the results as-is

            // DEBUG: Log first person to check what fields are in response
            if (res.people.length > 0) {
                const firstPerson = res.people[0];
                console.log(`   🔍 First person: ${firstPerson.first_name || ''} - Location: ${firstPerson.city || 'N/A'}, ${firstPerson.state || 'N/A'}, ${firstPerson.country || 'N/A'}`);
                console.log(`   🔍 First person email: ${firstPerson.email || 'MISSING'}`);
            }

            return res.people;
        }

        console.log(`   ℹ️  No people found in Apollo response`);
        return [];
    } catch (error) {
        console.error(`   ❌ Error in directPeopleSearch: ${error.message}`);
        return [];
    }
}

// Batch enrich with simple rate limiting
async function batchEnrichPeople(people, delayMs = 200) {
    const out = [];
    for (const person of people) {
        const enriched = await enrichPerson(person);
        out.push(enriched);
        if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
    }
    return out;
}

// NEW: Search Apollo by role/title and get people with emails directly
// CORRECT APPROACH: Apollo search doesn't return emails, but IDs can be used for enrichment
// Step 1: Search → Get IDs
// Step 2: Enrich IDs using /people/bulk_match → Get emails + LinkedIn URLs
async function searchPeopleByRole({ roleTitle, location, industry, page = 1, per_page = 25 } = {}) {
    if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY not set');

    console.log(`\n🎯 Searching Apollo by role: "${roleTitle}"`);
    if (location) console.log(`   Location: ${location}`);
    if (industry) console.log(`   Industry: ${industry}`);

    try {
        // STEP 1: Search for people by role → Get IDs + basic data
        const people = await directPeopleSearch({
            personTitle: roleTitle,
            location,
            industry,
            page,
            per_page
        });

        if (!people || people.length === 0) {
            console.log(`   ℹ️  No people found for role: ${roleTitle}`);
            return [];
        }

        // Enforce per_page limit (safety check) - ensure we don't exceed configured limit
        const limitedPeople = people.slice(0, per_page);
        if (limitedPeople.length < people.length) {
            console.log(`   ⚠️ Limiting results to ${per_page} (Apollo returned ${people.length})`);
        } else {
            console.log(`   ✅ Found ${people.length} candidates from search`);
        }

        console.log(`   🔄 Now enriching with emails using /people/bulk_match...`);

        // STEP 2: Enrich using /people/bulk_match to get emails + LinkedIn URLs
        const enrichedPeople = await enrichPeopleByIds(limitedPeople);

        console.log(`   ✅ Found ${people.length} people with "${roleTitle}"`);
        console.log(`   ✅ Found ${enrichedPeople.filter(p => p.email).length} people with emails out of ${people.length} total results`);

        return enrichedPeople;
    } catch (error) {
        console.error(`   ❌ Error in searchPeopleByRole: ${error.message}`);
        return [];
    }
}

// Enrich people by their Apollo IDs using /people/bulk_match
// This returns full data including linkedin_url and email
async function enrichPeopleByIds(people, batchSize = 10) {
    if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY not set');

    const enrichedPeople = [];

    // Process in batches to avoid API limits
    for (let i = 0; i < people.length; i += batchSize) {
        const batch = people.slice(i, i + batchSize);
        const ids = batch.map(p => ({ id: p.id })).filter(item => item.id);

        if (ids.length === 0) {
            continue;
        }

        try {
            console.log(`   📊 Enriching batch [${Math.floor(i / batchSize) + 1}] (${ids.length} people)...`);

            const enrichPayload = {
                details: ids
            };

            const enrichResponse = await callApollo('/people/bulk_match', {
                data: enrichPayload,
                params: {
                    reveal_personal_emails: false,
                    reveal_phone_number: false
                }
            });

            if (enrichResponse && enrichResponse.matches && Array.isArray(enrichResponse.matches)) {
                console.log(`       ✅ Got enriched data for ${enrichResponse.matches.length} people`);

                // Merge enriched data back to original people
                for (const enrichedPerson of enrichResponse.matches) {
                    const originalIndex = batch.findIndex(p => p.id === enrichedPerson.id);
                    if (originalIndex >= 0) {
                        // Merge enriched data with original
                        const mergedPerson = {
                            ...batch[originalIndex],
                            ...enrichedPerson,
                            email: enrichedPerson.email || batch[originalIndex].email,
                            linkedin_url: enrichedPerson.linkedin_url || batch[originalIndex].linkedin_url,
                            email_status: enrichedPerson.email_status || batch[originalIndex].email_status
                        };

                        if (enrichedPerson.email) {
                            console.log(`       ✅ Email for ${enrichedPerson.first_name}: ${enrichedPerson.email}`);
                        }

                        enrichedPeople.push(mergedPerson);
                    }
                }

                // Credits consumed message
                if (enrichResponse.credits_consumed) {
                    console.log(`       💰 Credits consumed: ${enrichResponse.credits_consumed}`);
                }
            } else {
                // If enrichment fails, still include original people
                enrichedPeople.push(...batch);
                console.log(`       ⚠️  Enrichment returned no matches, using original data`);
            }

            // Delay between batches
            if (i + batchSize < people.length) {
                await new Promise(r => setTimeout(r, 500));
            }
        } catch (enrichError) {
            console.log(`       ⚠️  Enrichment error: ${enrichError.message}`);
            // Still include original people if enrichment fails
            enrichedPeople.push(...batch);
        }
    }

    return enrichedPeople;
}

// NEW: Batch search multiple roles and get people with emails
async function batchSearchPeopleByRoles(roles, { location, industry, per_page = 25, delayMs = 300 } = {}) {
    if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY not set');

    console.log(`\n📋 Batch searching ${roles.length} roles...`);
    const allResults = [];

    for (let i = 0; i < roles.length; i++) {
        const role = roles[i];
        const roleTitle = role.role_title || role.role || role.title;

        if (!roleTitle) {
            console.log(`   ⚠️  Skipping role ${i + 1}: No role title provided`);
            continue;
        }

        console.log(`\n   [${i + 1}/${roles.length}] Searching for: ${roleTitle}`);

        try {
            const results = await searchPeopleByRole({
                roleTitle,
                location,
                industry: role.industry || industry,
                per_page,
                page: 1
            });

            // Add role metadata to each result
            const resultsWithRole = results.map(person => ({
                ...person,
                matchedRole: roleTitle,
                rolePriority: role.priority || 0,
                roleReasoning: role.reasoning || null,
                roleConfidence: role.confidence || null
            }));

            allResults.push(...resultsWithRole);

            console.log(`   ✅ Found ${results.length} people with emails for "${roleTitle}"`);

            // Rate limiting delay between role searches
            if (delayMs > 0 && i < roles.length - 1) {
                await new Promise(r => setTimeout(r, delayMs));
            }
        } catch (error) {
            console.error(`   ❌ Error searching for role "${roleTitle}": ${error.message}`);
            // Continue with next role even if one fails
        }
    }

    console.log(`\n✅ Batch search complete: Found ${allResults.length} total people with emails`);
    return allResults;
}

module.exports = {
    searchContacts,
    peopleMatch,
    peopleSearch,
    getEmailByLinkedInUrl,
    searchPersonByName,
    enrichPerson,
    batchEnrichPeople,
    directPeopleSearch,
    searchPeopleByRole,
    batchSearchPeopleByRoles
};