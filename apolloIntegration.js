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
async function peopleSearch({ keywords, title, locations, page = 1, per_page = 10 } = {}) {
    const payload = { page, per_page };
    if (keywords) payload.keywords = keywords;
    if (title) payload.title = title;
    if (locations) payload.locations = locations;

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

module.exports = {
    searchContacts,
    peopleMatch,
    peopleSearch,
    getEmailByLinkedInUrl,
    searchPersonByName,
    enrichPerson,
    batchEnrichPeople
};