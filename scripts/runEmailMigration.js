const fs = require('fs');
const path = require('path');
const db = require('../config/database');

async function runEmailMigration() {
  try {
    console.log('🔄 Running email system migration...');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, '../../database/migration_add_email_system.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split by semicolons and execute each statement
    // Remove comments and empty lines
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📝 Found ${statements.length} SQL statements to execute...`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          await db.query(statement);
          console.log(`✅ Statement ${i + 1}/${statements.length} executed successfully`);
        } catch (error) {
          // Ignore "already exists" errors
          if (error.code === '42P07' || error.message.includes('already exists')) {
            console.log(`⚠️  Statement ${i + 1}/${statements.length} - Table/index already exists, skipping...`);
          } else {
            console.error(`❌ Error executing statement ${i + 1}:`, error.message);
            throw error;
          }
        }
      }
    }
    
    console.log('✅ Email system migration completed successfully!');
    console.log('📊 Created tables:');
    console.log('   - email_smtp_credentials');
    console.log('   - email_templates');
    console.log('   - email_campaigns');
    console.log('   - campaign_recipients');
    console.log('   - email_tracking_events');
    console.log('   - email_tracking_pixels');
    console.log('   - email_link_tracking');
    console.log('   - email_bounces');
    console.log('   - email_replies');
    console.log('   - email_unsubscribes');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
runEmailMigration();

