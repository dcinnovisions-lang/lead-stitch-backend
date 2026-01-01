/**
 * Decision Maker Identification - Production-Ready Helper Functions
 * Implements best practices: structured output, enhanced prompts, validation, retry logic
 */

// Industry-specific decision maker mappings
const INDUSTRY_DECISION_MAKERS = {
    'Technology': ['CTO', 'VP of Engineering', 'Chief Product Officer', 'IT Director', 'VP of Technology'],
    'Healthcare': ['Chief Medical Officer', 'VP of Clinical Operations', 'Healthcare Administrator', 'Medical Director'],
    'Finance': ['CFO', 'VP of Finance', 'Chief Risk Officer', 'Finance Director', 'Treasurer'],
    'Retail': ['VP of Merchandising', 'Retail Operations Manager', 'Buyer', 'Category Manager'],
    'Manufacturing': ['VP of Operations', 'Plant Manager', 'Operations Director', 'Supply Chain Director'],
    'Sales': ['VP of Sales', 'Chief Revenue Officer', 'Sales Director', 'Head of Sales'],
    'Marketing': ['CMO', 'VP of Marketing', 'Marketing Director', 'Head of Growth'],
    'Education': ['Superintendent', 'Principal', 'Dean', 'Education Director'],
    'Real Estate': ['Property Manager', 'Real Estate Director', 'Facilities Manager'],
    'Legal': ['General Counsel', 'Legal Director', 'Chief Legal Officer'],
};

// Common decision maker roles by hierarchy
const ROLE_HIERARCHY = {
    'C-Level': ['CEO', 'CTO', 'CFO', 'CMO', 'COO', 'CHRO', 'Chief Revenue Officer', 'Chief Product Officer'],
    'VP-Level': ['VP of Sales', 'VP of Marketing', 'VP of Engineering', 'VP of Operations', 'VP of Finance'],
    'Director-Level': ['Director of Sales', 'Director of Marketing', 'Director of Engineering', 'Operations Director'],
    'Manager-Level': ['Sales Manager', 'Marketing Manager', 'Operations Manager', 'Product Manager'],
};

/**
 * Generate enhanced prompt with industry context and few-shot examples
 */
function generateEnhancedPrompt(requirement, attemptNumber = 1) {
    const industry = requirement.industry || 'General Business';
    const targetMarket = requirement.target_market || 'B2B';
    const productService = requirement.product_service || 'Product/Service';

    // Get industry-specific examples
    const industryExamples = INDUSTRY_DECISION_MAKERS[industry] || [];
    const industryContext = industryExamples.length > 0
        ? `\n\nFor ${industry} industry, typical decision makers include: ${industryExamples.slice(0, 3).join(', ')}`
        : '';

    // Few-shot examples showing single, clean role titles
    const examples = `
Example 1:
Input: "I want to sell enterprise CRM software to technology companies in the Netherlands"
Output: [
  {"role": "VP of Sales", "priority": 1, "reasoning": "Has budget authority for sales tools and technology", "industry_relevance": "high", "confidence": 0.95},
  {"role": "Chief Revenue Officer", "priority": 2, "reasoning": "Strategic decision maker for revenue operations", "industry_relevance": "high", "confidence": 0.90},
  {"role": "Sales Operations Director", "priority": 3, "reasoning": "Operational decision maker for sales technology", "industry_relevance": "medium", "confidence": 0.85}
]

Example 2:
Input: "I want to sell medical equipment to hospitals in Germany"
Output: [
  {"role": "Chief Medical Officer", "priority": 1, "reasoning": "Clinical decision authority for medical equipment", "industry_relevance": "high", "confidence": 0.95},
  {"role": "VP of Clinical Operations", "priority": 2, "reasoning": "Operational authority for clinical equipment procurement", "industry_relevance": "high", "confidence": 0.90},
  {"role": "Healthcare Administrator", "priority": 3, "reasoning": "Budget and procurement decision maker", "industry_relevance": "medium", "confidence": 0.80}
]

Example 3:
Input: "I want to sell marketing automation tools to e-commerce companies"
Output: [
  {"role": "CMO", "priority": 1, "reasoning": "Strategic decision maker for marketing technology", "industry_relevance": "high", "confidence": 0.95},
  {"role": "VP of Marketing", "priority": 2, "reasoning": "Operational decision maker for marketing tools", "industry_relevance": "high", "confidence": 0.90},
  {"role": "Head of Growth", "priority": 3, "reasoning": "Tactical decision maker for growth tools", "industry_relevance": "medium", "confidence": 0.85}
]

IMPORTANT: Each "role" field contains ONLY ONE clean job title. Do NOT use "/" or "or" (e.g., DON'T write "Sales Director / Head of Sales", INSTEAD write just "Sales Director" OR just "Head of Sales" - pick the most common/standard title).`;

    // Prompt variations for retry logic
    const promptVariations = [
        // Attempt 1: Standard comprehensive prompt
        `You are an expert B2B business analyst specializing in identifying decision-makers for sales and marketing purposes.

Business Requirement: "${requirement.requirement_text}"
Industry: ${industry}
Product/Service: ${productService}
Target Location: ${requirement.target_location || 'Not specified'}
Target Market: ${targetMarket}${industryContext}

Your task: Identify 5-8 relevant decision-maker roles who have:
1. Budget authority for ${productService}
2. Influence over purchasing decisions
3. Strategic alignment with this requirement
4. Industry-specific relevance

${examples}

Return a JSON array of decision maker objects. Each object must have:
- role: string (job title/role - SINGLE CLEAN TITLE ONLY, NO alternatives like "CEO / Chief Executive" - just "CEO")
- priority: number (1 = highest priority, higher numbers = lower priority)
- reasoning: string (brief explanation why this role is relevant)
- industry_relevance: string ("high", "medium", or "low")
- confidence: number (0.0 to 1.0, your confidence in this recommendation)

CRITICAL RULES:
1. Return ONLY valid JSON (no markdown, no \`\`\`json or \`\`\`)
2. Each role must be a SINGLE CLEAN job title (e.g., "VP of Sales" NOT "VP of Sales / Sales Director")
3. Do NOT use "/" or "or" to provide alternatives - choose the BEST single title
4. Start directly with [ or {.`,

        // Attempt 2: More focused, less verbose
        `Identify decision-makers for this B2B requirement:

"${requirement.requirement_text}"
Industry: ${industry}
Product: ${productService}
Location: ${requirement.target_location || 'Any'}

Return JSON array with objects: {role, priority, reasoning, industry_relevance, confidence}
Priority: 1 = highest, higher = lower
Industry relevance: "high", "medium", or "low"
Confidence: 0.0 to 1.0

Return 5-8 roles. CRITICAL: Return pure JSON only (no markdown, no \`\`\`, no code blocks). Start directly with [ or {.`,

        // Attempt 3: Simplified, direct
        `Business: "${requirement.requirement_text}"
Industry: ${industry}
Product: ${productService}

List 5-8 decision-maker job titles as JSON array of objects:
[{role: "title", priority: 1-8, reasoning: "why", industry_relevance: "high/medium/low", confidence: 0.0-1.0}]

CRITICAL: Return pure JSON only. No markdown, no \`\`\`, no code blocks. Start with [.`
    ];

    return promptVariations[Math.min(attemptNumber - 1, promptVariations.length - 1)];
}

/**
 * JSON Schema for structured output (OpenAI function calling)
 */
function getDecisionMakerSchema() {
    return {
        type: 'object',
        properties: {
            decision_makers: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        role: {
                            type: 'string',
                            description: 'Job title or role of the decision maker - SINGLE CLEAN TITLE ONLY (e.g., "VP of Sales" not "VP of Sales / Sales Director"). Do not use "/" or "or" for alternatives.',
                            pattern: '^[^/]+$'  // Regex to disallow "/" character
                        },
                        priority: {
                            type: 'number',
                            description: 'Priority ranking (1 = highest priority)',
                            minimum: 1,
                            maximum: 10
                        },
                        reasoning: {
                            type: 'string',
                            description: 'Brief explanation why this role is relevant'
                        },
                        industry_relevance: {
                            type: 'string',
                            enum: ['high', 'medium', 'low'],
                            description: 'How relevant this role is to the specified industry'
                        },
                        confidence: {
                            type: 'number',
                            description: 'Confidence score (0.0 to 1.0)',
                            minimum: 0,
                            maximum: 1
                        }
                    },
                    required: ['role', 'priority', 'reasoning', 'industry_relevance', 'confidence']
                },
                minItems: 3,
                maxItems: 10
            }
        },
        required: ['decision_makers']
    };
}

/**
 * Validate decision maker objects
 */
function validateDecisionMakers(decisionMakers) {
    const errors = [];
    const seenRoles = new Set();

    if (!Array.isArray(decisionMakers)) {
        errors.push('Decision makers must be an array');
        return { valid: false, errors, cleaned: [] };
    }

    if (decisionMakers.length === 0) {
        errors.push('Decision makers array is empty');
        return { valid: false, errors, cleaned: [] };
    }

    if (decisionMakers.length < 3) {
        errors.push(`Too few decision makers (${decisionMakers.length}). Minimum 3 required.`);
    }

    if (decisionMakers.length > 10) {
        errors.push(`Too many decision makers (${decisionMakers.length}). Maximum 10 allowed.`);
    }

    const cleaned = [];

    for (let i = 0; i < decisionMakers.length; i++) {
        const dm = decisionMakers[i];
        const index = i + 1;

        // Validate structure
        if (typeof dm !== 'object' || dm === null) {
            errors.push(`Decision maker ${index}: Must be an object`);
            continue;
        }

        // Validate role
        if (!dm.role || typeof dm.role !== 'string' || dm.role.trim().length === 0) {
            errors.push(`Decision maker ${index}: Missing or invalid role`);
            continue;
        }

        const role = dm.role.trim();

        // Check for duplicates (case-insensitive)
        const roleLower = role.toLowerCase();
        if (seenRoles.has(roleLower)) {
            errors.push(`Decision maker ${index}: Duplicate role "${role}"`);
            continue;
        }
        seenRoles.add(roleLower);

        // Validate priority
        if (typeof dm.priority !== 'number' || dm.priority < 1 || dm.priority > 10) {
            errors.push(`Decision maker ${index}: Invalid priority (must be 1-10)`);
            continue;
        }

        // Validate reasoning
        if (!dm.reasoning || typeof dm.reasoning !== 'string' || dm.reasoning.trim().length < 10) {
            errors.push(`Decision maker ${index}: Reasoning too short (minimum 10 characters)`);
            continue;
        }

        // Validate industry_relevance
        if (!['high', 'medium', 'low'].includes(dm.industry_relevance)) {
            errors.push(`Decision maker ${index}: Invalid industry_relevance (must be "high", "medium", or "low")`);
            continue;
        }

        // Validate confidence
        if (typeof dm.confidence !== 'number' || dm.confidence < 0 || dm.confidence > 1) {
            errors.push(`Decision maker ${index}: Invalid confidence (must be 0.0 to 1.0)`);
            continue;
        }

        // Clean and normalize role title - handle multiple options separated by "/" or "or"
        let cleanedRole = role;

        // Check if role contains alternatives (/, or, etc.)
        if (role.includes('/') || role.includes(' or ')) {
            // Split by common separators and take the first (primary) option
            const options = role
                .split(/\/|\bor\b/)
                .map(opt => opt.trim())
                .filter(opt => opt.length > 0);

            if (options.length > 0) {
                cleanedRole = options[0]; // Take the first/primary option
                console.log(`🔧 Cleaned role from "${role}" to "${cleanedRole}"`);
            }
        }

        // Remove parenthetical notes like "(CFO)"
        cleanedRole = cleanedRole.replace(/\([^)]*\)/g, '').trim();

        // Remove extra whitespace
        cleanedRole = cleanedRole.replace(/\s+/g, ' ').trim();

        cleaned.push({
            role: cleanedRole,
            priority: Math.round(dm.priority),
            reasoning: dm.reasoning.trim(),
            industry_relevance: dm.industry_relevance.toLowerCase(),
            confidence: Math.round(dm.confidence * 100) / 100, // Round to 2 decimals
        });
    }

    // Sort by priority (ascending - lower number = higher priority)
    cleaned.sort((a, b) => a.priority - b.priority);

    // Re-assign priorities to ensure sequential 1, 2, 3...
    cleaned.forEach((dm, index) => {
        dm.priority = index + 1;
    });

    return {
        valid: errors.length === 0 && cleaned.length >= 3,
        errors,
        cleaned
    };
}

/**
 * Check industry alignment
 */
function checkIndustryAlignment(decisionMakers, industry) {
    if (!industry) return { aligned: true, score: 0.5 };

    const industryRoles = INDUSTRY_DECISION_MAKERS[industry] || [];
    if (industryRoles.length === 0) return { aligned: true, score: 0.5 };

    let alignedCount = 0;
    for (const dm of decisionMakers) {
        const roleLower = dm.role.toLowerCase();
        if (industryRoles.some(ir => ir.toLowerCase().includes(roleLower) || roleLower.includes(ir.toLowerCase()))) {
            alignedCount++;
        }
    }

    const alignmentScore = decisionMakers.length > 0 ? alignedCount / decisionMakers.length : 0;

    return {
        aligned: alignmentScore >= 0.3, // At least 30% alignment
        score: alignmentScore
    };
}

/**
 * Extract and parse JSON from response (handles markdown, extra text, etc.)
 */
function extractJSONFromResponse(content) {
    if (!content || typeof content !== 'string') {
        throw new Error('Invalid content: must be a string');
    }

    console.log('🔵 Extracting JSON from content (length:', content.length, ')');
    console.log('🔵 First 300 chars:', content.substring(0, 300));

    // Step 1: Directly find and extract JSON (most reliable approach)
    // First, try to find JSON array or object directly, ignoring markdown
    let jsonMatch = null;

    // Try to find JSON array first (most common format) - use greedy matching to get full array
    const arrayMatch = content.match(/\[[\s\S]*\]/);
    if (arrayMatch && arrayMatch[0]) {
        jsonMatch = arrayMatch[0];
        console.log('🔵 Found JSON array directly (length:', jsonMatch.length, ')');
    } else {
        // Try to find JSON object - use greedy matching to get full object
        const objectMatch = content.match(/\{[\s\S]*\}/);
        if (objectMatch && objectMatch[0]) {
            jsonMatch = objectMatch[0];
            console.log('🔵 Found JSON object directly (length:', jsonMatch.length, ')');
        }
    }

    // If we found JSON directly, try parsing it first
    if (jsonMatch) {
        try {
            // Clean up: remove trailing commas
            let jsonString = jsonMatch.replace(/,(\s*[\]\}])/g, '$1').trim();
            console.log('🔵 Attempting to parse directly extracted JSON (first 200 chars):', jsonString.substring(0, 200));
            const parsed = JSON.parse(jsonString);
            console.log('✅ Successfully parsed directly extracted JSON');
            return parsed;
        } catch (e) {
            console.warn('⚠️  Direct extraction failed, trying cleaned approach:', e.message);
        }
    }

    // Step 2: Aggressively remove markdown code blocks (fallback)
    let cleaned = content;

    console.log('🔵 Original content starts with:', cleaned.substring(0, 50));

    // Remove ALL backticks (single, double, triple)
    cleaned = cleaned.replace(/`+/g, '');
    // Remove "json" keyword if it appears after removing backticks
    cleaned = cleaned.replace(/\bjson\b/gi, '');
    // Remove any leading/trailing whitespace and newlines
    cleaned = cleaned.trim();

    console.log('🔵 After removing all backticks starts with:', cleaned.substring(0, 50));

    // Remove any leading text before first [ or {
    const firstBracket = cleaned.search(/[\[\{]/);
    if (firstBracket > 0) {
        cleaned = cleaned.substring(firstBracket);
        console.log('🔵 Removed leading text before JSON, new start:', cleaned.substring(0, 50));
    }

    // Remove any trailing text after last ] or }
    const lastBracket = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
    if (lastBracket > 0 && lastBracket < cleaned.length - 1) {
        cleaned = cleaned.substring(0, lastBracket + 1);
        console.log('🔵 Removed trailing text after JSON');
    }

    console.log('🔵 After markdown removal (length:', cleaned.length, ')');
    console.log('🔵 First 300 chars after cleaning:', cleaned.substring(0, 300));
    console.log('🔵 Last 100 chars after cleaning:', cleaned.substring(Math.max(0, cleaned.length - 100)));

    // Step 2: Try to find and extract JSON (object or array) from cleaned content
    let jsonMatch2 = null;

    // Try to find JSON object first (for structured responses)
    const objectMatch2 = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch2) {
        jsonMatch2 = objectMatch2[0];
        console.log('🔵 Found JSON object pattern (length:', jsonMatch2.length, ')');
    } else {
        // Try to find JSON array
        const arrayMatch2 = cleaned.match(/\[[\s\S]*\]/);
        if (arrayMatch2) {
            jsonMatch2 = arrayMatch2[0];
            console.log('🔵 Found JSON array pattern (length:', jsonMatch2.length, ')');
        }
    }

    // Step 3: Parse the extracted JSON
    if (jsonMatch2) {
        try {
            // Clean up the matched JSON string
            let jsonString = jsonMatch2.trim();

            // Remove any trailing commas before closing brackets
            jsonString = jsonString.replace(/,(\s*[\]\}])/g, '$1');

            console.log('🔵 Attempting to parse JSON (first 200 chars):', jsonString.substring(0, 200));
            const parsed = JSON.parse(jsonString);
            console.log('✅ Successfully parsed JSON from match');
            return parsed;
        } catch (e) {
            console.warn('⚠️  Failed to parse matched JSON:', e.message);
            console.warn('⚠️  JSON string preview:', jsonMatch2.substring(0, 300));

            // Try parsing the whole cleaned content as fallback
            try {
                console.log('🔵 Trying to parse full cleaned content as fallback');
                const parsed = JSON.parse(cleaned);
                console.log('✅ Successfully parsed full cleaned content');
                return parsed;
            } catch (e2) {
                console.error('❌ Failed to parse cleaned content:', e2.message);
                throw new Error(`Failed to parse JSON: ${e2.message}. Content preview: ${cleaned.substring(0, 300)}`);
            }
        }
    }

    // Step 4: Last resort - try parsing the whole cleaned content
    try {
        console.log('🔵 Attempting to parse full cleaned content as last resort');
        // Remove trailing commas
        let finalContent = cleaned.replace(/,(\s*[\]\}])/g, '$1');
        const parsed = JSON.parse(finalContent);
        console.log('✅ Successfully parsed full content');
        return parsed;
    } catch (e) {
        // Step 5: If JSON parsing fails completely, treat as plain text response
        console.warn('⚠️ JSON parsing failed, treating response as plain text');
        console.warn('⚠️ Raw content:', cleaned.substring(0, 200));

        // Check if it's a simple string value (e.g., "Retail", "Healthcare", "Finance")
        const trimmedContent = cleaned.trim().replace(/^["']|["']$/g, '');
        if (trimmedContent && !trimmedContent.includes('{') && !trimmedContent.includes('[')) {
            console.log('✅ Treating plain text response as value:', trimmedContent);
            return trimmedContent;
        }

        // If all else fails, throw error
        console.error('❌ All JSON parsing attempts failed');
        console.error('❌ Error:', e.message);
        console.error('❌ Original content (first 500 chars):', content.substring(0, 500));
        console.error('❌ Cleaned content (first 500 chars):', cleaned.substring(0, 500));
        throw new Error(`Failed to extract valid JSON from response: ${e.message}. Original content preview: ${content.substring(0, 300)}`);
    }
}

/**
 * Generate prompt for industry identification from requirement text
 * Returns a single industry value
 */
function generateIndustryIdentificationPrompt(requirementText, attemptNumber = 1) {
    const promptVariations = [
        // Attempt 1: Comprehensive prompt
        `You are an expert business analyst specializing in industry classification.

Business Requirement: "${requirementText}"

Your task: Identify the PRIMARY industry for this business requirement. Return ONLY a single industry name (e.g., "Technology", "Healthcare", "Finance", "Retail", "Manufacturing", "Education", etc.).

Important:
- Return ONLY the industry name as a single word or short phrase (2-3 words max)
- Use standard industry classifications
- Be specific but not overly detailed (e.g., "Technology" not "Enterprise Software Technology Sector")
- Do NOT include any explanations, reasoning, or additional text
- Return ONLY the industry name

Examples:
- Input: "I want to sell enterprise software to tech companies in Europe"
  Output: Technology

- Input: "I need to find hospitals to sell medical equipment to"
  Output: Healthcare

- Input: "Looking to sell books to libraries and schools"
  Output: Education

- Input: "I want to sell CRM software to financial institutions"
  Output: Finance

Return ONLY the industry name (no JSON, no markdown, no explanations):`,

        // Attempt 2: More direct
        `Identify the industry for: "${requirementText}"

Return ONLY the industry name (one word or short phrase). Examples: Technology, Healthcare, Finance, Retail, Manufacturing, Education, Real Estate, Legal.

Industry:`,

        // Attempt 3: Simplest
        `"${requirementText}"

Industry (single word/phrase only):`,
    ];

    return promptVariations[Math.min(attemptNumber - 1, promptVariations.length - 1)];
}

/**
 * Schema for industry identification (OpenAI function calling)
 */
function getIndustrySchema() {
    return {
        type: 'object',
        properties: {
            industry: {
                type: 'string',
                description: 'The primary industry name (single word or short phrase, e.g., "Technology", "Healthcare")'
            }
        },
        required: ['industry']
    };
}

module.exports = {
    generateEnhancedPrompt,
    getDecisionMakerSchema,
    validateDecisionMakers,
    checkIndustryAlignment,
    extractJSONFromResponse,
    generateIndustryIdentificationPrompt,
    getIndustrySchema,
    INDUSTRY_DECISION_MAKERS,
    ROLE_HIERARCHY,
};

