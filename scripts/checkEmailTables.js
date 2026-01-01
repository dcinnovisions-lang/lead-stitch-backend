require('dotenv').config();
const db = require('../config/database');
const fs = require('fs');
const path = require('path');

async function checkEmailTables() {
  try {
    console.log('Checking if email system tables exist...\n');
    
    const tables = [
      'email_smtp_credentials',
      'email_templates',
      'email_campaigns',
      'campaign_recipients',
      'email_tracking_events',
      'email_tracking_pixels',
      'email_link_tracking',
      'email_bounces',
      'email_replies',
      'email_unsubscribes'
    ];

    const missingTables = [];
    
    for (const table of tables) {
      try {
        const result = await db.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )`,
          [table]
        );
        
        const exists = result.rows[0].exists;
        if (exists) {
          console.log(`✅ ${table} - EXISTS`);
        } else {
          console.log(`❌ ${table} - MISSING`);
          missingTables.push(table);
        }
      } catch (error) {
        console.log(`❌ ${table} - ERROR: ${error.message}`);
        missingTables.push(table);
      }
    }

    if (missingTables.length > 0) {
      console.log(`\n⚠️  ${missingTables.length} table(s) are missing!`);
      console.log('\nTo create the missing tables, run the migration:');
      console.log('  psql -d your_database_name -f database/migration_add_email_system.sql');
      console.log('\nOr use pgAdmin to run the SQL file: database/migration_add_email_system.sql');
      process.exit(1);
    } else {
      console.log('\n✅ All email system tables exist!');
      process.exit(0);
    }
  } catch (error) {
    console.error('Error checking tables:', error);
    process.exit(1);
  }
}

checkEmailTables();

