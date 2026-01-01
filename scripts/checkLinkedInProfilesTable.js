require('dotenv').config();
const db = require('../config/database');

async function checkLinkedInProfilesTable() {
  try {
    console.log('Checking linkedin_profiles table structure...\n');
    
    const result = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'linkedin_profiles'
      ORDER BY ordinal_position
    `);

    console.log('Columns in linkedin_profiles table:');
    result.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkLinkedInProfilesTable();


