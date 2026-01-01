require('dotenv').config();
const db = require('../config/database');
const fs = require('fs');
const path = require('path');

/**
 * Script to run migration and insert test data
 * Usage: node backend/scripts/runMigrationAndInsertData.js
 */

async function runMigration() {
  try {
    console.log('🔄 Running migration to add status column...\n');
    
    const migrationSQL = `
      -- Add status field to business_requirements table
      ALTER TABLE business_requirements 
      ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'draft';

      -- Update existing requirements to 'draft' if they don't have profiles
      UPDATE business_requirements 
      SET status = 'draft' 
      WHERE status IS NULL;

      -- Create index for better query performance
      CREATE INDEX IF NOT EXISTS idx_business_requirements_status ON business_requirements(status);
    `;

    await db.query(migrationSQL);
    console.log('✅ Migration completed successfully\n');
    return true;
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('✅ Status column already exists\n');
      return true;
    }
    console.error('❌ Migration error:', error.message);
    return false;
  }
}

async function insertTestData() {
  try {
    console.log('🚀 Starting test data insertion...\n');

    // Get or create a test user
    let userResult = await db.query('SELECT id FROM users LIMIT 1');
    let userId;

    if (userResult.rows.length === 0) {
      console.log('📝 Creating test user...');
      const newUser = await db.query(
        `INSERT INTO users (email, password_hash, first_name, last_name)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['test@example.com', '$2b$10$dummyhash', 'Test', 'User']
      );
      userId = newUser.rows[0].id;
      console.log(`✅ Created test user: ${userId}\n`);
    } else {
      userId = userResult.rows[0].id;
      console.log(`✅ Using existing user: ${userId}\n`);
    }

    // Create test business requirement
    console.log('📝 Creating test requirement...');
    const requirementResult = await db.query(
      `INSERT INTO business_requirements (
        user_id,
        requirement_text,
        industry,
        product_service,
        target_location,
        target_market,
        operation_name,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, operation_name`,
      [
        userId,
        'We need to find software engineers and senior developers for our tech team in India',
        'Technology',
        'Software Development',
        'India',
        'B2B',
        'Tech Team Recruitment - India',
        'enriched' // Set to enriched since we're adding scraped profiles
      ]
    );

    const requirementId = requirementResult.rows[0].id;
    const requirementName = requirementResult.rows[0].operation_name;
    console.log(`✅ Created requirement: "${requirementName}" (ID: ${requirementId})\n`);

    // Sample LinkedIn profiles from scraping service
    const profiles = [
      {
        profile_url: 'https://www.linkedin.com/in/shivamsharma2102/',
        name: 'Shivam Sharma',
        profession: 'Software Engineer',
        title: 'Software Engineer',
        location: 'Noida, Uttar Pradesh, India',
        company_name: 'Microsoft',
        decision_maker_role: 'Software Engineer',
        experience_details: [{
          title: 'Software Engineer',
          company: 'Microsoft',
          duration: 'Jun 2023 - Present · 2 yrs 3 mos',
          description: ''
        }]
      },
      {
        profile_url: 'https://www.linkedin.com/in/srinidhi-reddy-chintala-2b6065164/',
        name: 'Srinidhi Reddy Chintala',
        profession: 'Software Engineer',
        title: 'Software Engineer',
        location: 'Hyderabad, Telangana, India',
        company_name: 'Microsoft',
        decision_maker_role: 'Software Engineer',
        experience_details: [{
          title: 'Software Engineer',
          company: 'Microsoft',
          duration: 'Mar 2024 - Present · 1 yr 6 mos',
          description: ''
        }]
      }
    ];

    // Insert LinkedIn profiles
    console.log('📝 Inserting LinkedIn profiles...');
    const insertedProfiles = [];

    for (const profile of profiles) {
      try {
        const result = await db.query(
          `INSERT INTO linkedin_profiles (
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
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (profile_url) DO UPDATE SET
            name = EXCLUDED.name,
            title = EXCLUDED.title,
            company_name = EXCLUDED.company_name,
            experience_details = EXCLUDED.experience_details,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id, name`,
          [
            requirementId,
            profile.profile_url,
            profile.name,
            profile.profession,
            profile.title,
            profile.location,
            profile.company_name,
            profile.decision_maker_role,
            JSON.stringify(profile.experience_details),
            new Date()
          ]
        );

        if (result.rows.length > 0) {
          insertedProfiles.push(result.rows[0]);
          console.log(`  ✅ Inserted: ${result.rows[0].name}`);
        }
      } catch (error) {
        console.error(`  ❌ Error inserting ${profile.name}:`, error.message);
      }
    }

    // Create decision maker role
    console.log('\n📝 Creating decision maker role...');
    await db.query(
      `INSERT INTO decision_maker_roles (
        business_requirement_id,
        role_title,
        priority,
        api_source
      ) VALUES ($1, $2, $3, $4)
      ON CONFLICT DO NOTHING`,
      [requirementId, 'Software Engineer', 1, 'manual']
    );
    console.log('  ✅ Created decision maker role: Software Engineer\n');

    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ TEST DATA INSERTION COMPLETE');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Requirement: "${requirementName}"`);
    console.log(`Requirement ID: ${requirementId}`);
    console.log(`Status: enriched (ready for email enrichment)`);
    console.log(`Profiles inserted: ${insertedProfiles.length}`);
    insertedProfiles.forEach(p => {
      console.log(`  - ${p.name} (${p.id})`);
    });
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('Next steps:');
    console.log('  1. Enrich profiles with emails via Apollo.io');
    console.log('  2. Status will change to "closed" automatically');
    console.log('  3. View leads on /leads page\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error inserting test data:', error);
    process.exit(1);
  }
}

// Main execution
async function main() {
  const migrationSuccess = await runMigration();
  if (migrationSuccess) {
    await insertTestData();
  } else {
    console.error('❌ Migration failed. Please run migration manually.');
    process.exit(1);
  }
}

main();

