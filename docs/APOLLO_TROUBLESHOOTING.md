# Apollo API Integration Troubleshooting Guide

## Quick Diagnosis Checklist

### ✅ Before You Run Tests
- [ ] Verify `APOLLO_API_KEY` is set in `.env` file
- [ ] Confirm API key has active credits
- [ ] Check API key permissions allow `/mixed_people/api_search` endpoint
- [ ] Network connectivity is working (test with `ping api.apollo.io`)

### ✅ During Testing
- [ ] Run `node test-apollo-payload.js` to test payloads
- [ ] Check console logs for Apollo API response status codes
- [ ] Verify each role search returns different people
- [ ] Confirm email data is being returned (not `hasEmail: false`)

---

## Problem: Same Person Returned for All Roles

### Symptoms
```
[1/7] Searching for: Hospital Administrator
   🔍 Sample person structure: { firstName: 'Mike', ... }

[2/7] Searching for: Chief Financial Officer
   🔍 Sample person structure: { firstName: 'Mike', ... }  ← Same person!
```

### Root Cause
The API filters weren't being applied. This happens when:
1. Field names are wrong (e.g., `title` instead of `person_titles`)
2. Array parameters aren't arrays (e.g., `locations: "India"` instead of `locations: ["India"]`)
3. API is returning default/random results because filters are ignored

### Solution
✅ **Already Fixed in `apolloIntegration.js`**

The code now uses:
```javascript
const payload = {
    person_titles: [roleTitle],      // ✅ Correct: array of titles
    locations: [location],            // ✅ Correct: array of locations
    q_keywords: industry              // ✅ Correct: q_keywords not keywords
};
```

### Verify It's Fixed
Run the test and check:
```bash
node test-apollo-payload.js
```

Look for different people for each role:
```
[1/7] Testing: Director of Pharmacy
   Person 1: Rajesh Kumar
   
[2/7] Testing: Chief Medical Officer
   Person 1: Priya Sharma  ← Different person ✅
```

---

## Problem: No Emails Being Returned

### Symptoms
```
🔍 Sample person structure: {
  hasEmail: false,
  hasEmails: false,
  emailKeys: [],
  firstName: 'Mike',
  lastName: undefined
}

✅ Found 0 people with emails out of 25 total results
```

### Root Causes

#### Cause 1: Missing `include_fields`
Apollo won't return email data unless you explicitly request it.

❌ **Wrong:**
```javascript
const payload = {
    person_titles: ["Director"],
    locations: ["India"]
    // No include_fields!
};
```

✅ **Correct:**
```javascript
const payload = {
    person_titles: ["Director"],
    locations: ["India"],
    include_fields: [
        "email",
        "emails",
        "email_status",
        "email_verification_status"
    ]
};
```

**Status:** ✅ Fixed in code

---

#### Cause 2: Apollo Account Email Credits Depleted

If you have include_fields but still no emails:

1. **Check Apollo Dashboard:**
   - Go to https://app.apollo.io/#/settings/account
   - Check "Monthly Enrichment Credits"
   - Email enrichment costs credits

2. **Solution:**
   - Purchase more credits
   - Or use `person/match` endpoint instead (may have different pricing)

3. **Quick Test:**
```javascript
// Try getting just 5 people to minimize credit usage
const payload = {
    person_titles: ["Director of Pharmacy"],
    locations: ["India"],
    per_page: 5,  // ← Reduce to 5
    include_fields: ["email"]
};
```

---

#### Cause 3: Person Records Don't Have Email Data

Some Apollo records may not have email enrichment available.

**Check response:**
```javascript
// In search results, if email is null/undefined:
{
    id: "123",
    first_name: "John",
    email: null,        // ← No email available
    emails: [],
    linkedin_url: "https://linkedin.com/in/john-doe",  // ← Has LinkedIn
    phone_numbers: ["+1-234-5678"]  // ← Has phone
}
```

**What to do:**
- Try alternative methods: phone number + email from LinkedIn
- Use Enrichment API to get email for LinkedIn profile
- Filter out records without emails and try next page

---

## Problem: API Returns Error Status 400

### Symptoms
```
❌ Error Status: 400
   Error Data: {
     "error": "Invalid parameter",
     "message": "person_titles must be an array"
   }
```

### Common Causes and Fixes

| Error Message | Cause | Fix |
|---|---|---|
| `person_titles must be an array` | Passing string instead of array | Change `title: "Director"` to `person_titles: ["Director"]` |
| `Invalid keyword filter` | Using `keywords` instead of `q_keywords` | Use `q_keywords: "Healthcare"` |
| `locations is required` | Field name wrong | Use `locations: ["India"]` |
| `Invalid per_page value` | Too high (max ~100) | Use `per_page: 25` |
| `Unauthorized` | Invalid or missing API key | Check `APOLLO_API_KEY` in `.env` |

---

## Problem: API Returns Error Status 401/403

### Symptoms
```
❌ Error Status: 401
   Error Data: {
     "error": "Unauthorized",
     "message": "API key is invalid or expired"
   }
```

### Solution

1. **Verify API Key:**
```bash
# In your terminal
echo $APOLLO_API_KEY
```

Should output your key, not empty.

2. **Check `.env` file:**
```bash
cat lead-stitch-backend/.env | grep APOLLO_API_KEY
```

Should show:
```
APOLLO_API_KEY=YOUR_ACTUAL_KEY_HERE
```

3. **Regenerate API Key:**
   - Go to https://app.apollo.io/#/settings/integrations/api
   - Click "Generate new key"
   - Copy and update `.env`
   - Restart Node.js process

4. **Check Key Permissions:**
   - Log in to Apollo.io
   - Settings → API keys
   - Verify key has permissions for `/mixed_people/api_search`

---

## Problem: Timeout / Slow Responses

### Symptoms
```
timeout of 15000ms exceeded

❌ Error: ETIMEDOUT
```

### Causes
1. Apollo API is slow (typical response: 2-5 seconds)
2. Network issues
3. Rate limit being hit

### Solution

1. **Increase timeout:**
```javascript
// In apolloIntegration.js callApollo function
const res = await axios({
    ...
    timeout: 30000  // ← Increase from 15000 to 30000ms
});
```

2. **Add delays between requests:**
```javascript
// In linkedinScrapingJob.js
const peopleWithEmails = await apolloIntegration.batchSearchPeopleByRoles(
    decisionMakers,
    {
        location,
        industry,
        per_page: 25,
        delayMs: 500  // ← Increase from 300 to 500
    }
);
```

3. **Check Apollo status:**
   - Go to https://status.apollo.io
   - Check for incidents

---

## Problem: Getting Rate Limited

### Symptoms
```
❌ Error Status: 429
   Error Data: {
     "error": "Too Many Requests",
     "message": "Rate limit exceeded"
   }

Or results are empty even though people should exist.
```

### Solution

**Recommended Rate Limiting:**
```javascript
// Between role searches (what we do)
delayMs: 300  // 300ms between each role

// Between person enrichments
await new Promise(r => setTimeout(r, 200));

// Total time for 7 roles × 25 people
// ~52.5 seconds for 175 people
```

**Add exponential backoff:**
```javascript
async function callWithRetry(apiFn, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await apiFn();
        } catch (error) {
            if (error.response?.status === 429) {
                const delay = Math.pow(2, i) * 1000;  // 1s, 2s, 4s
                console.log(`Rate limited. Waiting ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
            } else {
                throw error;
            }
        }
    }
}
```

---

## Problem: Profiles Saved But No Emails Stored

### Symptoms
```
[Apollo Job] ✅ Stored profile John Smith with email: undefined
```

### Root Cause
Email extraction logic is failing. The email might be in the Apollo response but not being extracted correctly.

### Debug Steps

1. **Check Apollo response structure:**
```javascript
// Add to searchPeopleByRole function
console.log('Person data:', JSON.stringify(person, null, 2));
```

2. **Email might be in different field:**
```javascript
// The code tries multiple locations:
let email = person.email ||                    // Direct field
    person.emails?.[0] ||                      // emails array
    person.emails?.[0]?.address ||             // emails object array
    null;
```

3. **If email is still null, try enrichment:**
```javascript
// The code tries people/match to enrich:
const match = await peopleMatch({
    firstName: person.first_name,
    lastName: person.last_name,
    linkedinUrl: person.linkedin_url
});
email = match.person?.email;
```

---

## Testing & Validation

### Test 1: Verify Payload Structure
```bash
node test-apollo-payload.js
```

Expected output:
- Different people for each role ✅
- Emails populated (not all false) ✅
- Statistics show email coverage ✅

### Test 2: Manual API Call
```javascript
// test-single-role.js
const apollo = require('./apolloIntegration');

(async () => {
    const result = await apollo.directPeopleSearch({
        personTitle: "Director of Pharmacy",
        location: "India",
        industry: "Healthcare",
        per_page: 10
    });
    
    console.log('Results:', result.length);
    result.forEach(p => {
        console.log(`${p.first_name} ${p.last_name}: ${p.email || 'NO EMAIL'}`);
    });
})();
```

### Test 3: Full Job Simulation
```bash
# In database, create a test business requirement:
INSERT INTO business_requirements (
    id, user_id, requirement_name, industry, target_location, status, created_at
) VALUES (
    'test-123',
    'user-123',
    'Test Pharmacy Search',
    'Healthcare',
    'India',
    'identified',
    NOW()
);

# Then queue a test job:
node test-full-apollo-job.js
```

---

## Getting Help from Apollo Support

If after all these steps emails still aren't working:

1. **Gather information:**
   - Your Apollo account email
   - API key (obfuscated for security)
   - Example searches that aren't returning emails
   - Expected vs. actual results

2. **Contact Apollo Support:**
   - Email: support@apollo.io
   - Include your test curl commands
   - Include raw API responses
   - Mention you're using `/mixed_people/api_search` endpoint

3. **Useful info to share:**
   - Your account has email enrichment credits
   - You're requesting `include_fields: ["email", "emails"]`
   - You're searching by `person_titles` (role)
   - Example person IDs that should have emails

---

## Success Indicators

After all fixes are in place, you should see:

```
[Apollo Job] 📊 Job progress: 10% - Starting Apollo.io role-based search
[Apollo Job] 🔍 Searching Apollo for 7 roles...

📋 Batch searching 7 roles...

   [1/7] Searching for: Director of Pharmacy
🎯 Searching Apollo by role: "Director of Pharmacy"
   ✅ Got 25 results from Apollo

   🔍 Sample person structure: {
     hasEmail: true,  ← ✅ Changed from false!
     hasEmails: true,
     emailKeys: ['email', 'emails', 'email_status'],
     firstName: 'Rajesh',
     lastName: 'Kumar'
   }
   ✅ Found 12 people with emails out of 25 total results  ← ✅ Not 0!

[Apollo Job] ✅ Stored profile Rajesh Kumar with email: rajesh.kumar@hospital.com (verified: true)
[Apollo Job] 📊 Job progress: 100% - Complete! Stored 25 profiles with 12 emails
```

---

## Reference Materials

- **Apollo API Docs:** https://apollo.io/api/docs
- **Status Page:** https://status.apollo.io
- **Account Settings:** https://app.apollo.io/#/settings/integrations/api
- **Email Verification:** Apollo offers multiple email verification levels (verified, guessed, unknown)
