# Apollo API Integration Fix Guide

## Problem Analysis

Your Apollo API integration was experiencing the following issues:

### 1. **Same Person Returned for All Roles**
- Apollo was returning the same person ("Mike Br***m") for every role search
- This indicates the search filters were not being properly applied

### 2. **No Emails Being Retrieved**
- All results showed `hasEmail: false` and `hasEmails: false`
- Email data was not being extracted from Apollo responses

### 3. **Incorrect API Payload Structure**
The original payload structure was using incorrect field names:
```javascript
// ❌ WRONG - Using incorrect field names
{
  page: 1,
  per_page: 25,
  title: "Director of Pharmacy",          // ❌ Should be person_titles (array)
  locations: ["India"],                   // ❌ Should be location (array)
  keywords: "Healthcare"                  // ❌ Should be q_keywords
}
```

## Solution Implemented

### 1. **Corrected API Payload Structure**
The Apollo.io API expects the following field names:
```javascript
// ✅ CORRECT - Using proper Apollo API field names
{
  page: 1,
  per_page: 25,
  person_titles: ["Director of Pharmacy"],  // ✅ Array of titles
  locations: ["India"],                     // ✅ Array of locations
  q_keywords: "Healthcare",                 // ✅ Keywords for industry
  include_fields: [                         // ✅ Request specific fields
    "email",
    "emails",
    "email_status",
    "email_verification_status",
    "first_name",
    "last_name",
    "title",
    "organization_name",
    "phone_numbers",
    "linkedin_url",
    "id"
  ]
}
```

### 2. **New Direct Search Function**
Added `directPeopleSearch()` function in `apolloIntegration.js` that:
- Uses the correct field names from Apollo API docs
- Explicitly requests email fields
- Properly structures arrays for multi-value parameters
- Includes `include_fields` to ensure email data is returned

### 3. **Updated SearchPeopleByRole**
Modified `searchPeopleByRole()` to call the new `directPeopleSearch()` function instead of the generic `peopleSearch()`.

## Key API Parameter Mappings

| Wrong Parameter | Correct Parameter | Type | Example |
|---|---|---|---|
| `title` | `person_titles` | Array | `["Director of Pharmacy", "Chief Medical Officer"]` |
| `keywords` | `q_keywords` | String | `"Healthcare"` |
| `locations` | `locations` | Array | `["India", "United States"]` |
| N/A | `include_fields` | Array | Email data won't return unless requested |

## Testing the Fix

### 1. Run the Test Script
```bash
cd lead-stitch-backend
node test-apollo-payload.js
```

Expected output:
- Different people for each role (not the same person)
- Email addresses populated (not all false)
- Statistics showing email, phone, and LinkedIn coverage

### 2. Manual Testing
You can also test with curl:
```bash
curl -X POST https://api.apollo.io/api/v1/mixed_people/api_search \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_APOLLO_API_KEY" \
  -d '{
    "page": 1,
    "per_page": 25,
    "person_titles": ["Director of Pharmacy"],
    "locations": ["India"],
    "q_keywords": "Healthcare",
    "include_fields": ["email", "emails", "email_status", "first_name", "last_name", "title", "organization_name", "linkedin_url"]
  }'
```

## Files Modified

1. **apolloIntegration.js**
   - Fixed `peopleSearch()` function to use correct parameter names
   - Added new `directPeopleSearch()` function
   - Updated `searchPeopleByRole()` to use the new function
   - Added `include_fields` to request email data

2. **Created test-apollo-payload.js**
   - Test script to validate the fixes
   - Tests 3 sample roles
   - Shows statistics on email/phone/LinkedIn coverage

## Expected Results After Fix

### Before
```
[1/7] Searching for: Hospital Administrator
✅ Found 0 people with emails out of 25 total results

[2/7] Searching for: Chief Financial Officer  
✅ Found 0 people with emails out of 25 total results
```

### After (Expected)
```
[1/7] Searching for: Hospital Administrator
✅ Found 12 people with emails out of 25 total results
Email: john.smith@hospital.com
Email: sarah.patel@healthcare.org

[2/7] Searching for: Chief Financial Officer
✅ Found 8 people with emails out of 25 total results
Email: rajesh.kumar@hospital.net
Email: priya.sharma@healthsystem.com
```

## Troubleshooting

### If still getting same person for all searches:
1. Check API key is valid: `echo $APOLLO_API_KEY`
2. Check rate limiting: Add delays between requests
3. Verify pagination: Try different page numbers
4. Check Apollo account: Ensure account has API search credits

### If still no emails:
1. Verify `include_fields` parameter is being sent
2. Check Apollo account email credit balance
3. Ensure person_titles array is properly formatted
4. Try searching without location filter first

### Check Apollo API Response:
Add this to see raw API response:
```javascript
console.log('Raw Apollo Response:', JSON.stringify(res, null, 2));
```

## Apollo API Documentation References

- **Base URL**: `https://api.apollo.io/api/v1`
- **Endpoint**: `/mixed_people/api_search`
- **Authentication**: Header `X-Api-Key: YOUR_KEY`
- **Rate Limit**: Typically 600 requests per minute (1 request per 100ms)

## Next Steps

1. Run `test-apollo-payload.js` to verify the fix works
2. Check database for newly imported profiles with emails
3. Monitor Apollo API credit usage
4. Consider implementing caching to reduce API calls
5. Update frontend to show email discovery statistics
