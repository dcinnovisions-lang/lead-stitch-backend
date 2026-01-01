require('dotenv').config();
const db = require('../config/database');

async function checkCampaignRecipientsTable() {
  try {
    console.log('Checking campaign_recipients table structure...\n');
    
    // Get all columns in the table
    const result = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'campaign_recipients'
      ORDER BY ordinal_position
    `);

    console.log('Columns in campaign_recipients table:');
    result.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    // Check for required columns
    const requiredColumns = [
      'id', 'campaign_id', 'lead_id', 'email', 'name', 'status',
      'sent_at', 'delivered_at', 'opened_at', 'clicked_at', 'bounced_at',
      'replied_at', 'error_message', 'personalization_data', 'created_at'
    ];

    const existingColumns = result.rows.map(r => r.column_name);
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));

    if (missingColumns.length > 0) {
      console.log(`\n❌ Missing columns: ${missingColumns.join(', ')}`);
      console.log('\nTo add missing columns, run:');
      console.log('  psql -d your_database -f database/migration_add_email_system.sql');
      process.exit(1);
    } else {
      console.log('\n✅ All required columns exist!');
    }

    // Check linkedin_profiles table structure
    console.log('\nChecking linkedin_profiles table structure...\n');
    const profilesResult = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'linkedin_profiles'
      AND column_name IN ('id', 'email', 'first_name', 'last_name', 'company', 'position')
      ORDER BY column_name
    `);

    console.log('Required columns in linkedin_profiles table:');
    const profileColumns = profilesResult.rows.map(r => r.column_name);
    const requiredProfileColumns = ['id', 'email', 'first_name', 'last_name', 'company', 'position'];
    const missingProfileColumns = requiredProfileColumns.filter(col => !profileColumns.includes(col));

    if (missingProfileColumns.length > 0) {
      console.log(`❌ Missing columns: ${missingProfileColumns.join(', ')}`);
      process.exit(1);
    } else {
      requiredProfileColumns.forEach(col => {
        const colInfo = profilesResult.rows.find(r => r.column_name === col);
        if (colInfo) {
          console.log(`  ✅ ${col} (${colInfo.data_type})`);
        }
      });
    }

    console.log('\n✅ All required columns exist in both tables!');
    process.exit(0);
  } catch (error) {
    console.error('Error checking tables:', error);
    process.exit(1);
  }
}

checkCampaignRecipientsTable();


