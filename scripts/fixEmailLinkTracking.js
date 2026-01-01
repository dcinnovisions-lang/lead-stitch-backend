require('dotenv').config();
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { PsqlSequelize } = require('../config/model');

async function fixEmailLinkTracking() {
  try {
    await PsqlSequelize.authenticate();
    console.log('✅ Database connected successfully');
    console.log('\n🔄 Checking email_link_tracking table...\n');

    // Check if table exists and has updated_at column
    const [columns] = await PsqlSequelize.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'email_link_tracking'
      AND column_name = 'updated_at'
    `);

    if (columns.length > 0) {
      console.log('✅ email_link_tracking.updated_at column exists');
      
      // Check for NULL values
      const [nullCheck] = await PsqlSequelize.query(`
        SELECT COUNT(*) as count
        FROM email_link_tracking
        WHERE updated_at IS NULL
      `);

      const nullCount = parseInt(nullCheck[0].count);
      if (nullCount > 0) {
        console.log(`⚠️  Found ${nullCount} rows with NULL updated_at, fixing...`);
        await PsqlSequelize.query(`
          UPDATE email_link_tracking 
          SET updated_at = COALESCE(updated_at, created_at, NOW()) 
          WHERE updated_at IS NULL
        `);
        console.log('✅ Fixed NULL updated_at values');
      } else {
        console.log('✅ No NULL values found');
      }

      // Make sure column is NOT NULL if it should be
      try {
        await PsqlSequelize.query(`
          ALTER TABLE email_link_tracking 
          ALTER COLUMN updated_at SET NOT NULL
        `);
        console.log('✅ Set updated_at to NOT NULL');
      } catch (error) {
        if (error.message.includes('already')) {
          console.log('ℹ️  Column already has NOT NULL constraint');
        } else {
          console.log('⚠️  Could not set NOT NULL:', error.message);
        }
      }
    } else {
      console.log('ℹ️  email_link_tracking table or updated_at column does not exist yet');
    }

    console.log('\n✅ Fix complete!');
    console.log('✅ You can now restart the server.\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

fixEmailLinkTracking();

