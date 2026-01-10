const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');
const {
    generateEnhancedPrompt,
    getDecisionMakerSchema,
    validateDecisionMakers,
    checkIndustryAlignment,
    extractJSONFromResponse,
    generateIndustryIdentificationPrompt,
    getIndustrySchema,
} = require('../utils/decisionMakerHelpers');
const { BusinessRequirements, DecisionMakerRoles } = require('../config/model');

// Create business requirement
exports.create = async (req, res) => {
    try {
        const { requirementText, industry, productService, targetLocation, targetMarket, operationName } = req.body;
        const userId = req.user?.userId;

        // Validation
        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        if (!requirementText || requirementText.trim().length === 0) {
            return res.status(400).json({ message: 'Requirement text is required' });
        }

        if (requirementText.trim().length < 10) {
            return res.status(400).json({ message: 'Requirement text must be at least 10 characters long' });
        }

        // Validate required fields
        if (!operationName || operationName.trim().length === 0) {
            return res.status(400).json({ message: 'Business name (operation name) is required' });
        }

        if (!targetLocation || targetLocation.trim().length === 0) {
            return res.status(400).json({ message: 'Target location is required' });
        }

        // Ensure target location is a single location (remove commas if present)
        const singleLocation = targetLocation.trim().replace(/,/g, '').trim();

        const requirement = await BusinessRequirements.create({
            user_id: userId,
            requirement_text: requirementText.trim(),
            industry: industry || null,
            product_service: productService || null,
            target_location: singleLocation,
            target_market: targetMarket || null,
            operation_name: operationName.trim()
        });

        res.status(201).json(requirement);
    } catch (error) {
        console.error('Create business requirement error:', error);
        console.error('Error details:', error.message, error.stack);

        let errorMessage = 'Failed to create business requirement.';
        let statusCode = 500;

        // Handle Sequelize validation errors
        if (error.name === 'SequelizeValidationError') {
            errorMessage = 'Validation error: ' + error.errors.map(e => e.message).join(', ');
            statusCode = 400;
        }
        // Handle Sequelize unique constraint errors
        else if (error.name === 'SequelizeUniqueConstraintError') {
            errorMessage = 'A business requirement with this information already exists.';
            statusCode = 409;
        }
        // Handle database connection errors
        else if (error.name === 'SequelizeConnectionError' || error.name === 'SequelizeDatabaseError') {
            errorMessage = 'Database connection error. Please try again later.';
            statusCode = 503;
        }
        // Handle foreign key constraint errors
        else if (error.name === 'SequelizeForeignKeyConstraintError') {
            errorMessage = 'Invalid user reference. Please ensure you are authenticated.';
            statusCode = 400;
        }

        res.status(statusCode).json({
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get all business requirements for user
exports.getAll = async (req, res) => {
    try {
        const userId = req.user.userId;
        const requirements = await BusinessRequirements.findAll({
            where: { user_id: userId },
            order: [['created_at', 'DESC']]
        });
        res.json(requirements);
    } catch (error) {
        console.error('Get business requirements error:', error);
        console.error('Error details:', error.message, error.stack);

        let errorMessage = 'Failed to retrieve business requirements.';
        let statusCode = 500;

        // Handle database connection errors
        if (error.name === 'SequelizeConnectionError' || error.name === 'SequelizeDatabaseError') {
            errorMessage = 'Database connection error. Please try again later.';
            statusCode = 503;
        }
        // Handle authentication errors
        else if (!req.user || !req.user.userId) {
            errorMessage = 'User not authenticated.';
            statusCode = 401;
        }

        res.status(statusCode).json({
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get business requirement by ID
exports.getById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        const requirement = await BusinessRequirements.findOne({
            where: {
                id: id,
                user_id: userId
            },
            include: [{
                model: DecisionMakerRoles,
                as: 'decision_maker_roles',
                order: [['priority', 'DESC']]
            }]
        });

        if (!requirement) {
            return res.status(404).json({ message: 'Business requirement not found' });
        }

        const requirementData = requirement.toJSON();
        requirementData.decisionMakers = requirementData.decision_maker_roles || [];
        delete requirementData.decision_maker_roles;

        res.json(requirementData);
    } catch (error) {
        console.error('Get business requirement error:', error);
        console.error('Error details:', error.message, error.stack);

        let errorMessage = 'Failed to retrieve business requirement.';
        let statusCode = 500;

        // Handle invalid UUID format
        if (error.name === 'SequelizeDatabaseError' && error.message.includes('invalid input syntax for type uuid')) {
            errorMessage = 'Invalid requirement ID format.';
            statusCode = 400;
        }
        // Handle database connection errors
        else if (error.name === 'SequelizeConnectionError' || error.name === 'SequelizeDatabaseError') {
            errorMessage = 'Database connection error. Please try again later.';
            statusCode = 503;
        }
        // Handle authentication errors
        else if (!req.user || !req.user.userId) {
            errorMessage = 'User not authenticated.';
            statusCode = 401;
        }

        res.status(statusCode).json({
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Identify decision makers using AI (OpenAI with fallback to Gemini)
// Implements best practices: structured output, enhanced prompts, validation, retry logic
exports.identifyDecisionMakers = async (req, res) => {
    try {
        console.log('🔵 ===== IDENTIFY DECISION MAKERS CALLED (PRODUCTION MODE) =====');
        const { id } = req.params;
        const userId = req.user?.userId;

        console.log('🔵 Requirement ID:', id);
        console.log('🔵 User ID:', userId);

        if (!userId) {
            console.error('❌ User not authenticated');
            return res.status(401).json({ message: 'User not authenticated' });
        }

        // Get business requirement
        console.log('🔵 Checking requirement ownership...');
        const requirement = await BusinessRequirements.findOne({
            where: {
                id: id,
                user_id: userId
            }
        });

        if (!requirement) {
            console.error('❌ Business requirement not found or not owned by user');
            return res.status(404).json({ message: 'Business requirement not found' });
        }
        console.log('🔵 Requirement found:', requirement.id);
        console.log('🔵 Industry:', requirement.industry || 'Not specified');

        let decisionMakers = [];
        let apiSource = 'unknown';
        let modelUsed = 'unknown';
        let rawResponse = null;
        const maxRetries = 3; // Standard retries for most errors
        const maxRetries503 = 6; // More retries for 503/overloaded errors with longer waits

        // Try OpenAI first with structured output (function calling)
        let openaiSuccess = false;
        if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`🔵 Attempting OpenAI API call (Attempt ${attempt}/${maxRetries})...`);

                    const prompt = generateEnhancedPrompt(requirement, attempt);
                    const schema = getDecisionMakerSchema();

                    const openaiResponse = await axios.post(
                        'https://api.openai.com/v1/chat/completions',
                        {
                            model: 'gpt-4o-mini',
                            messages: [
                                {
                                    role: 'system',
                                    content: 'You are an expert B2B business analyst specializing in identifying decision-makers. Always respond with valid, structured JSON.',
                                },
                                {
                                    role: 'user',
                                    content: prompt,
                                },
                            ],
                            functions: [
                                {
                                    name: 'identify_decision_makers',
                                    description: 'Identify relevant decision-maker roles for a business requirement',
                                    parameters: schema,
                                },
                            ],
                            function_call: { name: 'identify_decision_makers' },
                            temperature: 0.3, // Lower temperature for more consistent results
                            max_tokens: 1000,
                        },
                        {
                            headers: {
                                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                                'Content-Type': 'application/json',
                            },
                        }
                    );

                    console.log('✅ OpenAI API call successful');
                    const functionCall = openaiResponse.data.choices[0].message.function_call;

                    if (!functionCall || !functionCall.arguments) {
                        throw new Error('No function call in OpenAI response');
                    }

                    const parsedArgs = JSON.parse(functionCall.arguments);
                    decisionMakers = parsedArgs.decision_makers || [];

                    console.log('🔵 Raw decision makers from OpenAI:', decisionMakers);

                    // Validate decision makers
                    const validation = validateDecisionMakers(decisionMakers);
                    if (!validation.valid) {
                        console.warn('⚠️  Validation errors:', validation.errors);
                        if (attempt < maxRetries) {
                            console.log(`🔄 Retrying with different prompt (attempt ${attempt + 1})...`);
                            continue;
                        }
                        throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
                    }

                    decisionMakers = validation.cleaned;
                    console.log('✅ Validated decision makers:', decisionMakers);

                    // Check industry alignment
                    const alignment = checkIndustryAlignment(decisionMakers, requirement.industry);
                    console.log(`🔵 Industry alignment score: ${alignment.score.toFixed(2)}`);

                    apiSource = 'openai';
                    modelUsed = 'gpt-4o-mini';
                    rawResponse = {
                        api: 'openai',
                        model: 'gpt-4o-mini',
                        response: openaiResponse.data,
                        parsed_decision_makers: decisionMakers,
                        validation: validation,
                        industry_alignment: alignment,
                        timestamp: new Date().toISOString(),
                    };

                    openaiSuccess = true;
                    break; // Success, exit retry loop
                } catch (openaiError) {
                    console.error(`❌ OpenAI attempt ${attempt} failed:`, openaiError.message);
                    if (attempt === maxRetries) {
                        console.log('⚠️  All OpenAI attempts failed, trying Gemini...');
                    }
                }
            }
        }

        // Fallback to Gemini if OpenAI failed or not configured
        if (!openaiSuccess) {
            console.log('🔵 ===== ATTEMPTING GEMINI API CALL =====');
            console.log('🔵 GEMINI_API_KEY exists:', !!process.env.GEMINI_API_KEY);

            if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here' && process.env.GEMINI_API_KEY.length > 20) {
                const apiKey = process.env.GEMINI_API_KEY;
                const ai = new GoogleGenAI({ apiKey });
                const model = 'gemini-2.5-flash'; // Only use the working model

                let geminiSuccess = false;
                let lastErrorWas503 = false; // Track if last error was 503/overloaded
                let consecutive503Errors = 0; // Track consecutive 503 errors
                let effectiveMaxRetries = maxRetries; // Start with standard retries
                let attempt = 0; // Start at 0, increment at start of loop
                let apiRetryDelaySeconds = null; // Store API-provided retry delay for 429 errors
                
                // Use while loop to allow dynamic extension of retries for 503 errors
                while (attempt < effectiveMaxRetries && !geminiSuccess) {
                    attempt++;

                    try {
                        // Exponential backoff with jitter: wait before retry (except first attempt)
                        if (attempt > 1) {
                            let baseWaitTime;
                            
                            // Check if we have an API-provided retry delay from previous 429 error
                            let usingApiDelay = false;
                            if (apiRetryDelaySeconds && apiRetryDelaySeconds > 0) {
                                // Use API-provided retry delay (convert to milliseconds)
                                baseWaitTime = apiRetryDelaySeconds * 1000;
                                usingApiDelay = true;
                                console.log(`⏳ Using API-provided retry delay: ${apiRetryDelaySeconds}s`);
                                // Reset retry delay so it's only used once
                                apiRetryDelaySeconds = null;
                            } else if (lastErrorWas503) {
                                // For 503 errors, use much longer waits: 5s, 15s, 30s, 60s, 120s, 180s
                                const waitTimes503 = [5000, 15000, 30000, 60000, 120000, 180000];
                                baseWaitTime = waitTimes503[Math.min(attempt - 2, waitTimes503.length - 1)];
                            } else {
                                // Standard exponential backoff for other errors
                                baseWaitTime = Math.pow(2, attempt - 2) * 1000; // 1s, 2s, 4s...
                            }
                            
                            // Add jitter (random 0-20% of wait time) to avoid synchronized retries
                            // For API-provided delays, add minimal jitter (0-5%) since the delay is already precise
                            // For calculated delays, add more jitter (0-20%) to avoid synchronized retries
                            const jitterMultiplier = usingApiDelay ? 0.05 : 0.2;
                            const jitter = baseWaitTime > 0 ? Math.random() * baseWaitTime * jitterMultiplier : 0;
                            const waitTime = Math.floor(baseWaitTime + jitter);
                            
                            console.log(`⏳ Waiting ${(waitTime / 1000).toFixed(1)}s before retry attempt ${attempt}/${effectiveMaxRetries}...`);
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                        }

                        console.log(`🔵 Gemini attempt ${attempt}/${effectiveMaxRetries}, model: ${model}`);

                        const prompt = generateEnhancedPrompt(requirement, attempt);

                        // Try JSON mode first, fallback to regular mode
                        let geminiResponse;
                        try {
                            // Attempt with JSON mode (if supported by model)
                            geminiResponse = await ai.models.generateContent({
                                model: model,
                                contents: prompt,
                                generationConfig: {
                                    temperature: 0.3,
                                    maxOutputTokens: 2000,
                                    responseMimeType: 'application/json', // Structured output
                                },
                            });
                        } catch (jsonModeError) {
                            // Parse error structure
                            const jsonErrorCode = jsonModeError.code || jsonModeError.error?.code;
                            const jsonErrorStatus = jsonModeError.status || jsonModeError.error?.status;
                            let jsonErrorMessage = jsonModeError.message || jsonModeError.error?.message || '';
                            
                            // Parse nested error from message string if needed
                            if (jsonErrorMessage.includes('{"error"')) {
                                try {
                                    const errorMatch = jsonErrorMessage.match(/\{"error":\{[^}]+\}\}/);
                                    if (errorMatch) {
                                        const errorObj = JSON.parse(errorMatch[0]);
                                        if (errorObj.error) {
                                            jsonErrorMessage = errorObj.error.message || jsonErrorMessage;
                                        }
                                    }
                                } catch (parseErr) {
                                    // Ignore parse errors
                                }
                            }
                            
                            // Check if it's a retryable error (503, overloaded) - don't fallback, retry instead
                            const isRetryableJsonError = jsonErrorCode === 503 || 
                                                         jsonErrorCode === 429 ||
                                                         jsonErrorStatus === 'UNAVAILABLE' ||
                                                         jsonErrorMessage.includes('overloaded') ||
                                                         jsonErrorMessage.includes('UNAVAILABLE') ||
                                                         jsonErrorMessage.includes('503');
                            
                            if (isRetryableJsonError) {
                                // Track 503/429 errors early to extend retries
                                if (jsonErrorCode === 503 || jsonErrorStatus === 'UNAVAILABLE' || jsonErrorMessage.includes('overloaded')) {
                                    consecutive503Errors++;
                                    lastErrorWas503 = true;
                                    if (consecutive503Errors === 1 && effectiveMaxRetries < maxRetries503) {
                                        effectiveMaxRetries = maxRetries503;
                                        console.log(`⚠️  503 error detected in JSON mode. Extending retries to ${maxRetries503} attempts...`);
                                    }
                                } else if (jsonErrorCode === 429 || jsonErrorStatus === 'RESOURCE_EXHAUSTED' || jsonErrorMessage.includes('quota')) {
                                    // For 429 errors, extend retries
                                    if (effectiveMaxRetries < maxRetries503) {
                                        effectiveMaxRetries = maxRetries503;
                                        console.log(`⚠️  Quota/rate limit error detected in JSON mode. Extending retries to ${maxRetries503} attempts...`);
                                    }
                                    // Try to extract retry delay from error
                                    if (jsonModeError.error?.details) {
                                        const retryInfo = jsonModeError.error.details.find(d => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
                                        if (retryInfo?.retryDelay) {
                                            const delayMatch = retryInfo.retryDelay.match(/(\d+\.?\d*)s?/);
                                            if (delayMatch) {
                                                apiRetryDelaySeconds = parseFloat(delayMatch[1]);
                                                console.log(`📊 Extracted API retry delay: ${apiRetryDelaySeconds}s`);
                                            }
                                        }
                                    }
                                }
                                // Re-throw to be caught by outer retry logic
                                console.log(`⚠️  Retryable error in JSON mode (${jsonErrorCode || jsonErrorStatus}), will retry...`);
                                throw jsonModeError;
                            }
                            
                            // Fallback to regular mode if JSON mode not supported (non-retryable error)
                            console.log(`⚠️  JSON mode not supported for ${model}, using regular mode`);
                            geminiResponse = await ai.models.generateContent({
                                model: model,
                                contents: prompt + '\n\nCRITICAL INSTRUCTIONS:\n- Return ONLY valid JSON\n- Do NOT use markdown code blocks (no ```json or ```)\n- Do NOT include any explanations or text before/after JSON\n- Start directly with [ or {\n- End directly with ] or }',
                                generationConfig: {
                                    temperature: 0.2, // Lower temperature for more consistent output
                                    maxOutputTokens: 2000,
                                },
                            });
                        }

                        console.log('✅ Gemini API call successful');
                        let content = geminiResponse.text || geminiResponse.response?.text || '';
                        if (typeof content !== 'string') {
                            content = JSON.stringify(content);
                        }
                        content = content.trim();

                        console.log('🔵 Gemini response (raw, first 500 chars):');
                        console.log(content.substring(0, 500));
                        console.log('🔵 Gemini response length:', content.length);

                        // Parse JSON response
                        try {
                            // Log the raw content for debugging
                            console.log('🔵 ===== RAW GEMINI RESPONSE =====');
                            console.log('🔵 Full content length:', content.length);
                            console.log('🔵 First 500 chars:', content.substring(0, 500));
                            console.log('🔵 Last 200 chars:', content.substring(Math.max(0, content.length - 200)));

                            const parsed = extractJSONFromResponse(content);

                            // Handle both {decision_makers: [...]} and [...] formats
                            decisionMakers = parsed.decision_makers || parsed;

                            // If decisionMakers is still not an array, check if it's a single object wrapped in array
                            if (!Array.isArray(decisionMakers)) {
                                if (typeof decisionMakers === 'object' && decisionMakers !== null) {
                                    decisionMakers = [decisionMakers];
                                } else {
                                    throw new Error(`Expected array or object, got: ${typeof decisionMakers}`);
                                }
                            }

                            console.log('🔵 Raw decision makers from Gemini:', JSON.stringify(decisionMakers, null, 2));

                            // Validate decision makers
                            const validation = validateDecisionMakers(decisionMakers);
                            if (!validation.valid) {
                                console.warn('⚠️  Validation errors:', validation.errors);
                                if (attempt < maxRetries) {
                                    continue; // Try again with next attempt
                                }
                                throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
                            }

                            decisionMakers = validation.cleaned;
                            console.log('✅ Validated decision makers:', decisionMakers);

                            // Check industry alignment
                            const alignment = checkIndustryAlignment(decisionMakers, requirement.industry);
                            console.log(`🔵 Industry alignment score: ${alignment.score.toFixed(2)}`);

                            apiSource = 'gemini';
                            modelUsed = model;
                            rawResponse = {
                                api: 'gemini',
                                model: model,
                                response: {
                                    text: content,
                                    fullResponse: geminiResponse
                                },
                                parsed_decision_makers: decisionMakers,
                                validation: validation,
                                industry_alignment: alignment,
                                timestamp: new Date().toISOString(),
                            };

                            geminiSuccess = true;

                            // Track Gemini API usage
                            try {
                                console.log('🔍 [Tracking] Attempting to track Gemini API usage...');
                                const geminiUsageService = require('../services/geminiUsageService');
                                const usageMetadata = geminiResponse.usageMetadata || geminiResponse.response?.usageMetadata;
                                console.log('🔍 [Tracking] Usage metadata:', usageMetadata ? 'Found' : 'Not found');
                                const tokens = usageMetadata ? {
                                    promptTokens: usageMetadata.promptTokenCount || 0,
                                    completionTokens: usageMetadata.candidatesTokenCount || usageMetadata.totalTokenCount || 0,
                                    totalTokens: usageMetadata.totalTokenCount || 0
                                } : null;
                                console.log('🔍 [Tracking] Calling trackLocalUsage with model:', model, 'tokens:', tokens);
                                geminiUsageService.trackLocalUsage(model, tokens);
                                console.log('✅ [Tracking] Gemini API usage tracked successfully');
                            } catch (trackError) {
                                console.error('❌ [Tracking] Could not track Gemini usage:', trackError.message);
                                console.error('❌ [Tracking] Error stack:', trackError.stack);
                            }

                            break; // Success, exit retry loop
                        } catch (parseError) {
                            console.error(`❌ JSON parsing error:`, parseError.message);
                            if (attempt < maxRetries) {
                                continue; // Try again with next attempt
                            }
                            throw parseError;
                        }
                    } catch (error) {
                        console.error(`❌ Gemini ${model} failed (attempt ${attempt}/${effectiveMaxRetries}):`, error.message);
                        
                        // Parse error structure - Gemini API wraps errors in nested structure
                        // Error format: ApiError: {"error":{"code":429,"message":"...","status":"RESOURCE_EXHAUSTED","details":[...]}}
                        let errorCode = null;
                        let errorStatus = null;
                        let errorMessage = error.message || '';
                        let retryDelaySeconds = null; // Extract retry delay from API response
                        
                        // Try to extract from nested error structure (error.error)
                        if (error.error) {
                            errorCode = error.error.code;
                            errorStatus = error.error.status;
                            errorMessage = error.error.message || errorMessage;
                            
                            // Try to extract retry delay from error details
                            if (error.error.details && Array.isArray(error.error.details)) {
                                const retryInfo = error.error.details.find(d => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
                                if (retryInfo && retryInfo.retryDelay) {
                                    // Parse retry delay (format: "18s" or "18.5s")
                                    const delayMatch = retryInfo.retryDelay.match(/(\d+\.?\d*)s?/);
                                    if (delayMatch) {
                                        retryDelaySeconds = parseFloat(delayMatch[1]);
                                    }
                                }
                            }
                        } else if (error.code) {
                            errorCode = error.code;
                        }
                        
                        // Also check error message string for JSON-like structure (common format)
                        if (errorMessage.includes('{"error"')) {
                            try {
                                // Try to parse the full error JSON from message string
                                // The error message often contains the full JSON structure
                                let errorObj = null;
                                
                                // Try to extract complete JSON object (may span multiple lines)
                                const jsonStart = errorMessage.indexOf('{"error"');
                                if (jsonStart !== -1) {
                                    let braceCount = 0;
                                    let jsonEnd = jsonStart;
                                    let inString = false;
                                    let escapeNext = false;
                                    
                                    // Find the matching closing brace
                                    for (let i = jsonStart; i < errorMessage.length; i++) {
                                        const char = errorMessage[i];
                                        if (escapeNext) {
                                            escapeNext = false;
                                            continue;
                                        }
                                        if (char === '\\') {
                                            escapeNext = true;
                                            continue;
                                        }
                                        if (char === '"' && !escapeNext) {
                                            inString = !inString;
                                            continue;
                                        }
                                        if (!inString) {
                                            if (char === '{') braceCount++;
                                            if (char === '}') {
                                                braceCount--;
                                                if (braceCount === 0) {
                                                    jsonEnd = i + 1;
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                    
                                    if (jsonEnd > jsonStart) {
                                        const jsonStr = errorMessage.substring(jsonStart, jsonEnd);
                                        errorObj = JSON.parse(jsonStr);
                                    }
                                }
                                
                                // Fallback: try simple regex match
                                if (!errorObj) {
                                    const errorMatch = errorMessage.match(/\{"error":\{[^}]+\}\}/);
                                    if (errorMatch) {
                                        errorObj = JSON.parse(errorMatch[0]);
                                    }
                                }
                                
                                if (errorObj && errorObj.error) {
                                    errorCode = errorCode || errorObj.error.code;
                                    errorStatus = errorStatus || errorObj.error.status;
                                    errorMessage = errorObj.error.message || errorMessage;
                                    
                                    // Extract retry delay from details
                                    if (errorObj.error.details && Array.isArray(errorObj.error.details)) {
                                        const retryInfo = errorObj.error.details.find(d => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
                                        if (retryInfo && retryInfo.retryDelay && !retryDelaySeconds) {
                                            const delayMatch = retryInfo.retryDelay.match(/(\d+\.?\d*)s?/);
                                            if (delayMatch) {
                                                retryDelaySeconds = parseFloat(delayMatch[1]);
                                            }
                                        }
                                    }
                                }
                            } catch (parseErr) {
                                // Ignore JSON parse errors, but log for debugging
                                console.error('⚠️  Could not parse error JSON:', parseErr.message);
                            }
                        }
                        
                        // Also try to extract retry delay from error message text (fallback)
                        if (!retryDelaySeconds && errorMessage.includes('retry in')) {
                            const retryMatch = errorMessage.match(/retry in ([\d.]+)s/i);
                            if (retryMatch) {
                                retryDelaySeconds = parseFloat(retryMatch[1]);
                            }
                        }
                        
                        // Check error message for keywords
                        const hasOverloaded = errorMessage.includes('overloaded') || errorMessage.includes('UNAVAILABLE');
                        const hasQuotaExceeded = errorMessage.includes('quota') || errorMessage.includes('exceeded') || errorStatus === 'RESOURCE_EXHAUSTED';
                        const hasRateLimit = errorMessage.includes('rate limit') || errorCode === 429 || hasQuotaExceeded;
                        const has503 = errorCode === 503 || errorStatus === 'UNAVAILABLE' || errorMessage.includes('503');
                        
                        console.error(`❌ Error details - Code: ${errorCode}, Status: ${errorStatus}, Message: ${errorMessage.substring(0, 200)}`);
                        
                        // Store API-provided retry delay for 429/quota errors
                        if (retryDelaySeconds && retryDelaySeconds > 0 && hasRateLimit) {
                            apiRetryDelaySeconds = retryDelaySeconds;
                            console.log(`📊 API provided retry delay: ${retryDelaySeconds}s for quota/rate limit error`);
                        }
                        
                        // Track consecutive 503 errors and adjust retry strategy dynamically
                        if (has503 || hasOverloaded) {
                            consecutive503Errors++;
                            lastErrorWas503 = true;
                            // Switch to extended retries if we hit a 503 error (only once)
                            if (consecutive503Errors === 1 && effectiveMaxRetries < maxRetries503) {
                                effectiveMaxRetries = maxRetries503;
                                console.log(`⚠️  503 error detected. Extending retries to ${maxRetries503} attempts with longer waits (5s, 15s, 30s, 60s, 120s, 180s)...`);
                            }
                        } else {
                            consecutive503Errors = 0;
                            lastErrorWas503 = false;
                        }
                        
                        // For 429/quota errors, extend retries and use longer waits
                        if (hasRateLimit && !has503 && !hasOverloaded) {
                            // Extend retries for quota errors (they often resolve after waiting)
                            if (effectiveMaxRetries < maxRetries503) {
                                effectiveMaxRetries = maxRetries503;
                                console.log(`⚠️  Quota/rate limit error detected. Extending retries to ${maxRetries503} attempts...`);
                            }
                        }
                        
                        // Check if it's a retryable error (503, 429, network errors, UNAVAILABLE)
                        const isRetryable = has503 || 
                                          hasRateLimit ||
                                          hasOverloaded ||
                                          errorMessage.includes('network') ||
                                          errorMessage.includes('timeout') ||
                                          errorMessage.includes('ECONNREFUSED') ||
                                          errorMessage.includes('ETIMEDOUT');
                        
                        // Use current effective max retries (may have been extended for 503/429 errors)
                        if (attempt === effectiveMaxRetries) {
                            // Last attempt - throw error with better message
                            let userFriendlyMessage = 'Failed to get response from Gemini API.';
                            if (hasQuotaExceeded) {
                                userFriendlyMessage = 'Gemini API quota exceeded. You have reached the daily limit (20 requests for free tier). Please wait until tomorrow or upgrade your plan.';
                            } else if (has503 || hasOverloaded) {
                                userFriendlyMessage = 'Gemini API is temporarily overloaded. Please wait 1-2 minutes and try again. The service is experiencing high demand.';
                            } else if (hasRateLimit) {
                                userFriendlyMessage = 'AI service rate limit exceeded. Please try again in a few minutes.';
                            } else if (errorMessage) {
                                userFriendlyMessage = errorMessage;
                            }
                            throw new Error(userFriendlyMessage);
                        }
                        
                        if (!isRetryable) {
                            // Non-retryable error - throw immediately
                            throw error;
                        }
                        
                        // Retryable error - log and continue to next retry
                        // Note: Wait happens at the start of next loop iteration, not here
                        console.log(`⏳ Retryable error detected (${errorCode || errorStatus || 'overloaded'}). Will retry in next attempt (${attempt + 1}/${effectiveMaxRetries})...`);
                    }
                }

                if (!geminiSuccess) {
                    throw new Error('All Gemini attempts failed');
                }
            } else {
                throw new Error('GEMINI_API_KEY not configured');
            }
        }

        // Save decision makers to database with metadata
        if (decisionMakers.length === 0) {
            throw new Error('No decision makers identified after all attempts');
        }

        console.log('💾 Saving decision makers to database...');
        const savedRoles = [];

        for (const dm of decisionMakers) {
            const [role, created] = await DecisionMakerRoles.findOrCreate({
                where: {
                    business_requirement_id: id,
                    role_title: dm.role || dm.role_title
                },
                defaults: {
                    business_requirement_id: id,
                    role_title: dm.role || dm.role_title,
                    industry: requirement.industry, // Auto-assign requirement's industry to each decision maker
                    priority: dm.priority || 0,
                    api_source: apiSource,
                    raw_api_response: rawResponse ? JSON.stringify(rawResponse) : null,
                    reasoning: dm.reasoning || null,
                    industry_relevance: dm.industry_relevance || null,
                    confidence: dm.confidence || null
                }
            });

            if (created) {
                savedRoles.push(role);
            } else {
                // Update existing role
                await role.update({
                    industry: requirement.industry, // Update industry even for existing roles
                    priority: dm.priority || role.priority,
                    api_source: apiSource,
                    raw_api_response: rawResponse ? JSON.stringify(rawResponse) : role.raw_api_response,
                    reasoning: dm.reasoning || role.reasoning,
                    industry_relevance: dm.industry_relevance || role.industry_relevance,
                    confidence: dm.confidence || role.confidence
                });
                savedRoles.push(role);
            }
        }

        console.log(`✅ Successfully saved ${savedRoles.length} decision makers`);

        return res.json({
            message: `Decision makers identified successfully using ${apiSource.toUpperCase()} API`,
            decisionMakers: savedRoles,
            requirementId: id,
            apiSource: apiSource,
            model: modelUsed,
            count: savedRoles.length,
            validation: {
                passed: true,
                industry_alignment: rawResponse.industry_alignment,
            },
            rawResponse: process.env.NODE_ENV === 'development' ? rawResponse : undefined,
        });

    } catch (error) {
        console.error('❌ ===== IDENTIFY DECISION MAKERS ERROR =====');
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);

        let errorMessage = 'Failed to identify decision makers.';
        let statusCode = 500;

        // Handle API key configuration errors
        if (error.message.includes('API key') || error.message.includes('GEMINI_API_KEY') || error.message.includes('OPENAI_API_KEY')) {
            errorMessage = 'AI service API keys are not configured. Please add GEMINI_API_KEY or OPENAI_API_KEY to your backend/.env file and restart the server.';
            statusCode = 503;
        }
        // Handle validation errors
        else if (error.message.includes('Validation failed')) {
            errorMessage = `AI response validation failed: ${error.message.replace('Validation failed: ', '')}. Please try again with a more detailed requirement.`;
            statusCode = 422;
        }
        // Handle no decision makers found
        else if (error.message.includes('No decision makers') || error.message.includes('All attempts failed') || error.message.includes('All Gemini attempts failed')) {
            errorMessage = 'Could not identify any decision makers. The AI service may be temporarily unavailable. Please try again in a few moments.';
            statusCode = 503;
        }
        // Handle Gemini overloaded/temporarily unavailable
        else if (error.message.includes('overloaded') || error.message.includes('temporarily unavailable') || error.message.includes('try again later')) {
            errorMessage = 'AI service is temporarily overloaded. Please wait a moment and try again.';
            statusCode = 503;
        }
        // Handle HTTP/API errors
        else if (error.response?.status) {
            statusCode = error.response.status;
            if (error.response.status === 401 || error.response.status === 403) {
                errorMessage = 'Invalid or unauthorized AI service API key. Please check your API keys in the backend/.env file.';
            } else if (error.response.status === 429) {
                errorMessage = 'AI service rate limit exceeded. Please try again in a few minutes.';
            } else if (error.response.status === 500 || error.response.status === 502 || error.response.status === 503) {
                errorMessage = 'AI service is temporarily unavailable. Please try again later.';
            } else {
                errorMessage = `AI service error (${error.response.status}). Please try again later.`;
            }
        }
        // Handle Gemini API nested error structure (error.error.code)
        // Error format: ApiError: {"error":{"code":503,"message":"...","status":"UNAVAILABLE"}}
        else if (error.error?.code === 503 || error.error?.status === 'UNAVAILABLE' || 
                 error.message?.includes('overloaded') || error.message?.includes('UNAVAILABLE')) {
            errorMessage = 'Gemini API is temporarily overloaded. Please wait a moment and try again.';
            statusCode = 503;
        }
        // Handle Gemini API rate limit (429) and quota exceeded
        else if (error.error?.code === 429 || error.error?.status === 'RATE_LIMIT_EXCEEDED' || 
                 error.error?.status === 'RESOURCE_EXHAUSTED' ||
                 error.message?.includes('quota') || error.message?.includes('exceeded') ||
                 (error.message?.includes('rate limit') && !error.response)) {
            // Check if it's a quota exceeded error (more specific)
            if (error.message?.includes('quota') || error.error?.status === 'RESOURCE_EXHAUSTED') {
                errorMessage = 'Gemini API quota exceeded. You have reached the daily limit (20 requests for free tier). Please wait until tomorrow or upgrade your plan at https://ai.google.dev/gemini-api/docs/rate-limits';
            } else {
                errorMessage = 'AI service rate limit exceeded. Please try again in a few minutes.';
            }
            statusCode = 429;
        }
        // Try to parse error from message string if it contains JSON
        else if (error.message && error.message.includes('{"error"')) {
            try {
                const errorMatch = error.message.match(/\{"error":\{[^}]+\}\}/);
                if (errorMatch) {
                    const errorObj = JSON.parse(errorMatch[0]);
                    if (errorObj.error) {
                        if (errorObj.error.code === 503 || errorObj.error.status === 'UNAVAILABLE') {
                            errorMessage = 'Gemini API is temporarily overloaded. Please wait a moment and try again.';
                            statusCode = 503;
                        } else if (errorObj.error.code === 429 || errorObj.error.status === 'RESOURCE_EXHAUSTED') {
                            if (errorObj.error.message?.includes('quota') || errorObj.error.status === 'RESOURCE_EXHAUSTED') {
                                errorMessage = 'Gemini API quota exceeded. You have reached the daily limit (20 requests for free tier). Please wait until tomorrow or upgrade your plan.';
                            } else {
                                errorMessage = 'AI service rate limit exceeded. Please try again in a few minutes.';
                            }
                            statusCode = 429;
                        } else if (errorObj.error.message) {
                            errorMessage = errorObj.error.message;
                            statusCode = 503;
                        }
                    }
                }
            } catch (parseErr) {
                // If parsing fails, continue with default error handling
                console.error('Could not parse error JSON:', parseErr);
            }
        }
        // Handle network errors
        else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
            errorMessage = 'Unable to connect to AI service. Please check your internet connection and try again.';
            statusCode = 503;
        }
        // Handle database errors
        else if (error.name === 'SequelizeConnectionError' || error.name === 'SequelizeDatabaseError') {
            errorMessage = 'Database connection error. Please try again later.';
            statusCode = 503;
        }
        // Handle invalid requirement ID
        else if (error.name === 'SequelizeDatabaseError' && error.message.includes('invalid input syntax for type uuid')) {
            errorMessage = 'Invalid requirement ID format.';
            statusCode = 400;
        }
        // Handle requirement not found
        else if (error.message.includes('not found')) {
            errorMessage = 'Business requirement not found or you do not have permission to access it.';
            statusCode = 404;
        }

        return res.status(statusCode).json({
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// Identify industry from requirement text using AI
exports.identifyIndustry = async (req, res) => {
    try {
        console.log('🔵 ===== IDENTIFY INDUSTRY CALLED =====');
        const { requirementText } = req.body;
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        if (!requirementText || requirementText.trim().length === 0) {
            return res.status(400).json({ message: 'Requirement text is required' });
        }

        if (requirementText.trim().length < 10) {
            return res.status(400).json({ message: 'Requirement text must be at least 10 characters long' });
        }

        const normalizeIndustries = (value) => {
            if (!value) return [];
            const list = Array.isArray(value) ? value : [value];
            const cleaned = list
                .map(item => (item ? String(item).trim() : ''))
                .filter(Boolean)
                .map(item => item
                    .replace(/^```json|```$|^```|```$/g, '')
                    .replace(/^\s*industries\s*[:=]\s*/i, '')
                    .replace(/^\s*industry\s*[:=]\s*/i, '')
                    .replace(/^['"]|['"]$/g, '')
                    .split('\n')[0]
                    .split('\r')[0]
                    .replace(/[.,;:!?]+$/, '')
                    .trim()
                )
                .filter(Boolean);

            // Deduplicate while preserving order
            const seen = new Set();
            return cleaned.filter(item => {
                const key = item.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            }).slice(0, 3);
        };

        let identifiedIndustry = null;
        let industryList = [];
        let apiSource = 'unknown';
        let modelUsed = 'unknown';
        const maxRetries = 3;
        const maxRetries503 = 6;

        // Try OpenAI first
        let openaiSuccess = false;
        if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`🔵 OpenAI attempt ${attempt}/${maxRetries} for industry identification...`);

                    const prompt = generateIndustryIdentificationPrompt(requirementText.trim(), attempt);
                    const schema = getIndustrySchema();

                    const openaiResponse = await axios.post(
                        'https://api.openai.com/v1/chat/completions',
                        {
                            model: 'gpt-4o-mini',
                            messages: [
                                {
                                    role: 'system',
                                    content: 'You are an expert business analyst specializing in industry classification. Always return a single industry name.',
                                },
                                {
                                    role: 'user',
                                    content: prompt,
                                },
                            ],
                            functions: [
                                {
                                    name: 'identify_industry',
                                    description: 'Identify the top 3 industries for a business requirement',
                                    parameters: schema,
                                },
                            ],
                            function_call: { name: 'identify_industry' },
                            temperature: 0.2,
                            max_tokens: 120,
                        },
                        {
                            headers: {
                                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                                'Content-Type': 'application/json',
                            },
                        }
                    );

                    const functionCall = openaiResponse.data.choices[0].message.function_call;
                    if (!functionCall || !functionCall.arguments) {
                        throw new Error('No function call in OpenAI response');
                    }

                    const parsedArgs = JSON.parse(functionCall.arguments);
                    industryList = normalizeIndustries(parsedArgs.industries || parsedArgs.industry);
                    identifiedIndustry = industryList[0];

                    if (!identifiedIndustry || industryList.length === 0) {
                        throw new Error('Industry not found in OpenAI response');
                    }

                    console.log('✅ OpenAI identified industries:', industryList);
                    apiSource = 'openai';
                    modelUsed = 'gpt-4o-mini';
                    openaiSuccess = true;
                    break;
                } catch (openaiError) {
                    console.error(`❌ OpenAI attempt ${attempt} failed:`, openaiError.message);
                    if (attempt === maxRetries) {
                        console.log('⚠️  All OpenAI attempts failed, trying Gemini...');
                    }
                }
            }
        }

        // Fallback to Gemini
        if (!openaiSuccess) {
            console.log('🔵 ===== ATTEMPTING GEMINI API CALL FOR INDUSTRY =====');

            if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here' && process.env.GEMINI_API_KEY.length > 20) {
                const apiKey = process.env.GEMINI_API_KEY;
                const ai = new GoogleGenAI({ apiKey });
                const model = 'gemini-2.5-flash';

                let geminiSuccess = false;
                let effectiveMaxRetries = maxRetries;
                let attempt = 0;

                while (attempt < effectiveMaxRetries && !geminiSuccess) {
                    attempt++;

                    try {
                        if (attempt > 1) {
                            const baseWaitTime = Math.pow(2, attempt - 2) * 1000;
                            const jitter = Math.random() * baseWaitTime * 0.2;
                            const waitTime = Math.floor(baseWaitTime + jitter);
                            console.log(`⏳ Waiting ${(waitTime / 1000).toFixed(1)}s before retry attempt ${attempt}...`);
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                        }

                        console.log(`🔵 Gemini attempt ${attempt}/${effectiveMaxRetries} for industry identification...`);

                        const prompt = generateIndustryIdentificationPrompt(requirementText.trim(), attempt);

                        let geminiResponse;
                        try {
                            geminiResponse = await ai.models.generateContent({
                                model: model,
                                contents: prompt,
                                generationConfig: {
                                    temperature: 0.2,
                                    maxOutputTokens: 100,
                                    responseMimeType: 'application/json',
                                },
                            });
                        } catch (jsonModeError) {
                            console.log('⚠️  JSON mode not supported, using regular mode');
                            geminiResponse = await ai.models.generateContent({
                                model: model,
                                contents: prompt + '\n\nCRITICAL: Return ONLY the industry name as plain text, no JSON, no markdown, no explanations.',
                                generationConfig: {
                                    temperature: 0.2,
                                    maxOutputTokens: 100,
                                },
                            });
                        }

                        let content = geminiResponse.text || geminiResponse.response?.text || '';
                        if (typeof content !== 'string') {
                            content = JSON.stringify(content);
                        }
                        content = content.trim();

                        console.log('🔵 Gemini raw response:', content);

                        // Try to parse as JSON first
                        try {
                            const parsed = extractJSONFromResponse(content);
                            if (parsed && typeof parsed === 'object' && Array.isArray(parsed.industries)) {
                                industryList = normalizeIndustries(parsed.industries);
                            } else if (parsed && typeof parsed === 'object' && parsed.industry) {
                                industryList = normalizeIndustries(parsed.industry);
                            } else if (Array.isArray(parsed)) {
                                industryList = normalizeIndustries(parsed);
                            } else if (parsed && typeof parsed === 'string') {
                                industryList = normalizeIndustries(parsed);
                            } else {
                                industryList = normalizeIndustries(content);
                            }
                        } catch (jsonError) {
                            // If not JSON, treat as plain text
                            industryList = normalizeIndustries(content);
                        }

                        // Fallbacks: if we parsed an array but normalization stripped everything, keep originals
                        if (industryList.length === 0) {
                            try {
                                const parsed = extractJSONFromResponse(content);
                                if (Array.isArray(parsed)) {
                                    industryList = parsed.map(item => String(item).trim()).filter(Boolean).slice(0, 3);
                                } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.industries)) {
                                    industryList = parsed.industries.map(item => String(item).trim()).filter(Boolean).slice(0, 3);
                                }
                            } catch (fallbackParseError) {
                                // ignore, keep best-effort
                            }
                        }

                        identifiedIndustry = industryList[0];

                        if (!identifiedIndustry || industryList.length === 0) {
                            throw new Error('Industry not found in Gemini response');
                        }
                        console.log('✅ Gemini identified industries:', industryList);
                        apiSource = 'gemini';
                        modelUsed = model;
                        geminiSuccess = true;
                        break;
                    } catch (error) {
                        console.error(`❌ Gemini attempt ${attempt} failed:`, error.message);
                        if (attempt === effectiveMaxRetries) {
                            throw error;
                        }
                    }
                }

                if (!geminiSuccess) {
                    throw new Error('All Gemini attempts failed');
                }
            } else {
                throw new Error('GEMINI_API_KEY not configured');
            }
        }

        if (!identifiedIndustry || identifiedIndustry.length === 0) {
            throw new Error('Failed to identify industry from requirement text');
        }

        // Ensure we always return three options if possible
        if (industryList.length === 0 && identifiedIndustry) {
            industryList = [identifiedIndustry];
        }

        while (industryList.length < 3 && industryList.length > 0) {
            industryList.push(industryList[industryList.length - 1]);
        }

        // Final safety: if still empty, surface the raw content that failed
        if (industryList.length === 0) {
            throw new Error('Industry not found in Gemini response');
        }

        return res.json({
            industry: identifiedIndustry,
            primaryIndustry: identifiedIndustry,
            industries: industryList,
            apiSource: apiSource,
            model: modelUsed,
            message: 'Industry identified successfully',
        });

    } catch (error) {
        console.error('❌ ===== IDENTIFY INDUSTRY ERROR =====');
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);

        let errorMessage = 'Failed to identify industry.';
        let statusCode = 500;

        if (error.message.includes('API key') || error.message.includes('GEMINI_API_KEY') || error.message.includes('OPENAI_API_KEY')) {
            errorMessage = 'AI service API keys are not configured. Please add GEMINI_API_KEY or OPENAI_API_KEY to your backend/.env file.';
            statusCode = 503;
        } else if (error.message.includes('quota') || error.message.includes('exceeded')) {
            errorMessage = 'AI service quota exceeded. Please try again later.';
            statusCode = 429;
        } else if (error.message.includes('overloaded') || error.message.includes('UNAVAILABLE')) {
            errorMessage = 'AI service is temporarily overloaded. Please try again in a moment.';
            statusCode = 503;
        }

        return res.status(statusCode).json({
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// Delete business requirement by ID
exports.delete = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        // Find the requirement and verify ownership
        const requirement = await BusinessRequirements.findOne({
            where: {
                id: id,
                user_id: userId
            }
        });

        if (!requirement) {
            return res.status(404).json({ message: 'Business requirement not found' });
        }

        // Delete the requirement (CASCADE will handle related DecisionMakerRoles and LinkedInProfiles)
        await requirement.destroy();

        res.json({
            message: 'Business requirement deleted successfully',
            id: id
        });
    } catch (error) {
        console.error('Delete business requirement error:', error);
        console.error('Error details:', error.message, error.stack);

        let errorMessage = 'Failed to delete business requirement.';
        let statusCode = 500;

        // Handle invalid UUID format
        if (error.name === 'SequelizeDatabaseError' && error.message.includes('invalid input syntax for type uuid')) {
            errorMessage = 'Invalid requirement ID format.';
            statusCode = 400;
        }
        // Handle database connection errors
        else if (error.name === 'SequelizeConnectionError' || error.name === 'SequelizeDatabaseError') {
            errorMessage = 'Database connection error. Please try again later.';
            statusCode = 503;
        }
        // Handle foreign key constraint errors (if requirement is referenced elsewhere)
        else if (error.name === 'SequelizeForeignKeyConstraintError') {
            errorMessage = 'Cannot delete requirement because it is still being used. Please remove all associated data first.';
            statusCode = 409;
        }
        // Handle authentication errors
        else if (!req.user || !req.user.userId) {
            errorMessage = 'User not authenticated.';
            statusCode = 401;
        }

        res.status(statusCode).json({
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

