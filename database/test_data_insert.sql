-- Test Data Insert Script
-- Creates a test requirement and stores sample LinkedIn scraping data

-- First, get a user ID (assuming you have at least one user)
-- If no users exist, create one first
DO $$
DECLARE
    test_user_id UUID;
    test_requirement_id UUID;
BEGIN
    -- Get or create a test user
    SELECT id INTO test_user_id FROM users LIMIT 1;
    
    IF test_user_id IS NULL THEN
        -- Create a test user if none exists
        INSERT INTO users (email, password_hash, first_name, last_name)
        VALUES ('test@example.com', '$2b$10$dummyhash', 'Test', 'User')
        RETURNING id INTO test_user_id;
    END IF;

    -- Create a test business requirement
    INSERT INTO business_requirements (
        user_id,
        requirement_text,
        industry,
        product_service,
        target_location,
        target_market,
        operation_name,
        status
    ) VALUES (
        test_user_id,
        'We need to find software engineers and senior developers for our tech team in India',
        'Technology',
        'Software Development',
        'India',
        'B2B',
        'Tech Team Recruitment - India',
        'enriched'  -- Set to enriched since we're adding scraped profiles
    ) RETURNING id INTO test_requirement_id;

    -- Insert sample LinkedIn profiles from scraping service
    -- Profile 1: Shivam Sharma
    INSERT INTO linkedin_profiles (
        business_requirement_id,
        profile_url,
        name,
        profession,
        title,
        location,
        company_name,
        decision_maker_role,
        experience_details,
        scraped_at
    ) VALUES (
        test_requirement_id,
        'https://www.linkedin.com/in/shivamsharma2102/',
        'Shivam Sharma',
        'Software Engineer',
        'Software Engineer',
        'Noida, Uttar Pradesh, India',
        'Microsoft',
        'Software Engineer',
        '[
            {
                "title": "Software Engineer",
                "company": "Microsoft",
                "duration": "Jun 2023 - Present · 2 yrs 3 mos",
                "description": ""
            }
        ]'::jsonb,
        CURRENT_TIMESTAMP
    ) ON CONFLICT (profile_url) DO UPDATE SET
        name = EXCLUDED.name,
        title = EXCLUDED.title,
        company_name = EXCLUDED.company_name,
        experience_details = EXCLUDED.experience_details,
        updated_at = CURRENT_TIMESTAMP;

    -- Profile 2: Srinidhi Reddy Chintala
    INSERT INTO linkedin_profiles (
        business_requirement_id,
        profile_url,
        name,
        profession,
        title,
        location,
        company_name,
        decision_maker_role,
        experience_details,
        scraped_at
    ) VALUES (
        test_requirement_id,
        'https://www.linkedin.com/in/srinidhi-reddy-chintala-2b6065164/',
        'Srinidhi Reddy Chintala',
        'Software Engineer',
        'Software Engineer',
        'Hyderabad, Telangana, India',
        'Microsoft',
        'Software Engineer',
        '[
            {
                "title": "Software Engineer",
                "company": "Microsoft",
                "duration": "Mar 2024 - Present · 1 yr 6 mos",
                "description": ""
            }
        ]'::jsonb,
        CURRENT_TIMESTAMP
    ) ON CONFLICT (profile_url) DO UPDATE SET
        name = EXCLUDED.name,
        title = EXCLUDED.title,
        company_name = EXCLUDED.company_name,
        experience_details = EXCLUDED.experience_details,
        updated_at = CURRENT_TIMESTAMP;

    -- Create decision maker roles for this requirement
    INSERT INTO decision_maker_roles (
        business_requirement_id,
        role_title,
        priority,
        api_source
    ) VALUES (
        test_requirement_id,
        'Software Engineer',
        1,
        'manual'
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Test requirement created with ID: %', test_requirement_id;
    RAISE NOTICE 'Requirement name: Tech Team Recruitment - India';
    RAISE NOTICE '2 LinkedIn profiles inserted';
END $$;

-- Verify the data
SELECT 
    br.operation_name as requirement_name,
    br.status,
    COUNT(lp.id) as total_profiles
FROM business_requirements br
LEFT JOIN linkedin_profiles lp ON br.id = lp.business_requirement_id
WHERE br.operation_name = 'Tech Team Recruitment - India'
GROUP BY br.id, br.operation_name, br.status;

