/**
 * APOLLO API PAYLOAD REFERENCE - CORRECT FORMAT
 * 
 * This is the CORRECT payload structure that Apollo.io API expects.
 * The original code was using wrong field names, which is why it wasn't filtering properly.
 */

// ❌ WRONG - Original payload (not working)
const WRONG_PAYLOAD = {
    page: 1,
    per_page: 25,
    keywords: "Healthcare",           // ❌ Wrong - should be q_keywords
    title: "Director of Pharmacy",    // ❌ Wrong - should be person_titles (array)
    locations: ["India"]              // ❌ Might work, but missing include_fields
};

// ✅ CORRECT - Fixed payload (working)
const CORRECT_PAYLOAD = {
    page: 1,
    per_page: 25,
    person_titles: [                  // ✅ Correct - must be array
        "Director of Pharmacy",
        "Chief Pharmacist",           // Can include variations
        "Pharmacy Manager"
    ],
    locations: [                       // ✅ Must be array of location strings
        "India",
        "United States"
    ],
    q_keywords: "Healthcare",         // ✅ Use q_keywords for industry/keywords
    include_fields: [                 // ✅ CRITICAL - Request email data specifically
        "email",
        "emails",
        "email_status",
        "email_verification_status",
        "first_name",
        "last_name",
        "title",
        "organization_name",
        "organization_primary_domain",
        "phone_numbers",
        "linkedin_url",
        "id",
        "city",
        "country"
    ]
};

/**
 * APOLLO API FIELD NAME MAPPING
 * 
 * This table shows the correct field names for Apollo API searches.
 */

const FIELD_MAPPING = {
    // Person/Title Fields
    "person_titles": {
        type: "Array<string>",
        description: "Job titles to search for",
        example: ["Director of Pharmacy", "CFO", "CEO"],
        notes: "Must be an array. Apollo's suggestion API can provide valid titles."
    },

    // Location Fields
    "locations": {
        type: "Array<string>",
        description: "Geographic locations to search",
        example: ["India", "United States", "London"],
        notes: "Country names or city names"
    },

    "organization_locations": {
        type: "Array<string>",
        description: "Organization location filter",
        example: ["India"],
        notes: "Alternative to 'locations' - filters by company location"
    },

    // Keyword/Industry Fields
    "q_keywords": {
        type: "string",
        description: "Keywords for industry or company type",
        example: "Healthcare, Pharmaceutical, Hospital",
        notes: "NOT 'keywords' - must use 'q_keywords'"
    },

    "technologies": {
        type: "Array<string>",
        description: "Technologies used by organizations",
        example: ["Salesforce", "Python", "AWS"],
        notes: "For technical searches"
    },

    // Result Fields
    "include_fields": {
        type: "Array<string>",
        description: "Fields to include in response",
        example: ["email", "phone_numbers", "linkedin_url"],
        notes: "CRITICAL: Must request 'email' field or emails won't be returned!"
    },

    "exclude_fields": {
        type: "Array<string>",
        description: "Fields to exclude from response",
        example: ["first_name", "last_name"],
        notes: "Opposite of include_fields"
    },

    // Pagination
    "page": {
        type: "number",
        description: "Page number for results",
        example: 1,
        notes: "Default: 1"
    },

    "per_page": {
        type: "number",
        description: "Results per page",
        example: 25,
        notes: "Max typically 100"
    },

    // Company/Organization Fields
    "organization_names": {
        type: "Array<string>",
        description: "Specific company names",
        example: ["Apple", "Microsoft", "Google"],
        notes: "Filter by exact company names"
    },

    "organization_ids": {
        type: "Array<string>",
        description: "Apollo organization IDs",
        example: ["123456", "789012"],
        notes: "Use if you have Apollo org IDs"
    },

    // Employment/Status Fields
    "employment_status": {
        type: "string",
        description: "Current employment status",
        example: "currently_employed",
        notes: "Values: currently_employed, job_seeker, etc."
    },

    "years_in_business": {
        type: "object",
        description: "Filter by years in current role",
        example: { min: 1, max: 10 },
        notes: "Minimum and maximum years"
    },

    // Email Verification Fields
    "email_status": {
        type: "string",
        description: "Email verification status",
        example: "verified",
        notes: "Values: verified, guessed, unknown"
    }
};

/**
 * EXAMPLE: Complete working searches
 */

const EXAMPLE_SEARCHES = {
    // Example 1: Hospital Pharmacy Director in India
    example1: {
        endpoint: "POST /mixed_people/api_search",
        payload: {
            person_titles: ["Director of Pharmacy", "Pharmacy Manager", "Chief Pharmacist"],
            locations: ["India"],
            q_keywords: "Hospital, Healthcare",
            organization_ids: [],  // Can add specific hospital IDs
            per_page: 25,
            page: 1,
            include_fields: [
                "email",
                "emails",
                "email_status",
                "first_name",
                "last_name",
                "title",
                "organization_name",
                "phone_numbers",
                "linkedin_url"
            ]
        },
        expectedResponse: {
            people: [
                {
                    id: "123456",
                    first_name: "Rajesh",
                    last_name: "Kumar",
                    email: "rajesh.kumar@hospital.com",
                    emails: ["rajesh.kumar@hospital.com"],
                    email_status: "verified",
                    title: "Director of Pharmacy",
                    organization_name: "Apollo Hospital",
                    phone_numbers: ["+91-XXXXXXXXXX"],
                    linkedin_url: "https://linkedin.com/in/rajesh-kumar/"
                }
            ],
            total_entries: 234,
            breadcrumbs: []
        }
    },

    // Example 2: C-Suite executives in Healthcare
    example2: {
        endpoint: "POST /mixed_people/api_search",
        payload: {
            person_titles: [
                "Chief Executive Officer",
                "Chief Operating Officer",
                "Chief Financial Officer",
                "Chief Medical Officer"
            ],
            locations: ["India"],
            q_keywords: "Healthcare, Pharmaceutical",
            per_page: 25,
            include_fields: ["email", "emails", "phone_numbers", "linkedin_url"]
        },
        expectedResponse: {
            people: [
                {
                    id: "789012",
                    first_name: "Priya",
                    last_name: "Sharma",
                    email: "priya.sharma@healthcareco.com",
                    emails: ["priya.sharma@healthcareco.com"],
                    email_status: "verified",
                    title: "Chief Financial Officer",
                    organization_name: "HealthCare Services Ltd"
                }
            ]
        }
    }
};

/**
 * COMMON MISTAKES TO AVOID
 */

const COMMON_MISTAKES = {
    mistake1: {
        wrong: { title: "Director of Pharmacy" },          // ❌ Should be person_titles array
        correct: { person_titles: ["Director of Pharmacy"] }
    },

    mistake2: {
        wrong: { keywords: "Healthcare" },                 // ❌ Should be q_keywords
        correct: { q_keywords: "Healthcare" }
    },

    mistake3: {
        wrong: { locations: "India" },                     // ❌ Should be array
        correct: { locations: ["India"] }
    },

    mistake4: {
        wrong: { per_page: 100 },                          // ❌ Too high, max ~50-100
        correct: { per_page: 25 }
    },

    mistake5: {
        // Forgetting include_fields means emails won't be returned
        wrong: {
            person_titles: ["Director"],
            locations: ["India"]
            // Missing include_fields
        },
        correct: {
            person_titles: ["Director"],
            locations: ["India"],
            include_fields: ["email", "emails", "phone_numbers"]  // ✅ Request fields!
        }
    }
};

/**
 * RATE LIMITING RECOMMENDATIONS
 * 
 * Apollo API has rate limits. Follow these guidelines:
 */

const RATE_LIMITS = {
    typical: "600 requests per minute",
    delay_between_requests: "100ms minimum",
    delay_between_role_searches: "300-500ms recommended",
    batch_search: "Add 200-300ms delay between each person enrichment",

    example_timing: {
        "Role 1 search": "T=0ms",
        "delay": "300ms",
        "Role 2 search": "T=300ms",
        "delay": "300ms",
        "Role 3 search": "T=600ms"
    }
};

/**
 * TESTING THE API
 * 
 * You can test with curl:
 */

const CURL_EXAMPLE = `
curl -X POST https://api.apollo.io/api/v1/mixed_people/api_search \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: YOUR_APOLLO_API_KEY" \\
  -d '{
    "page": 1,
    "per_page": 25,
    "person_titles": ["Director of Pharmacy"],
    "locations": ["India"],
    "q_keywords": "Healthcare",
    "include_fields": ["email", "emails", "email_status", "first_name", "last_name", "title", "organization_name", "linkedin_url"]
  }'
`;

module.exports = {
    CORRECT_PAYLOAD,
    WRONG_PAYLOAD,
    FIELD_MAPPING,
    EXAMPLE_SEARCHES,
    COMMON_MISTAKES,
    RATE_LIMITS,
    CURL_EXAMPLE
};
