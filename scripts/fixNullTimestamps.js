/**
 * Script to fix NULL timestamp values in database
 * Run this before sequelize.sync() to prevent errors
 * 
 * Usage:
 * node scripts/fixNullTimestamps.js
 */

require('dotenv').config();
const { PsqlSequelize } = require('../config/model');

async function fixNullTimestamps() {
  try {
    console.log('\n🔄 Fixing NULL timestamp values in database...\n');

    const queries = [
      // Fix decision_maker_roles
      `UPDATE decision_maker_roles 
       SET updated_at = COALESCE(updated_at, created_at, NOW()) 
       WHERE updated_at IS NULL;`,

      `UPDATE decision_maker_roles 
       SET created_at = COALESCE(created_at, NOW()) 
       WHERE created_at IS NULL;`,

      // Fix users table
      `UPDATE users 
       SET updated_at = COALESCE(updated_at, created_at, NOW()) 
       WHERE updated_at IS NULL;`,

      `UPDATE users 
       SET created_at = COALESCE(created_at, NOW()) 
       WHERE created_at IS NULL;`,

      // Fix business_requirements
      `UPDATE business_requirements 
       SET updated_at = COALESCE(updated_at, created_at, NOW()) 
       WHERE updated_at IS NULL;`,

      `UPDATE business_requirements 
       SET created_at = COALESCE(created_at, NOW()) 
       WHERE created_at IS NULL;`,

      // Fix linkedin_profiles
      `UPDATE linkedin_profiles 
       SET updated_at = COALESCE(updated_at, created_at, scraped_at, NOW()) 
       WHERE updated_at IS NULL;`,

      `UPDATE linkedin_profiles 
       SET created_at = COALESCE(created_at, scraped_at, NOW()) 
       WHERE created_at IS NULL;`,

      // Fix email_addresses
      `UPDATE email_addresses 
       SET updated_at = COALESCE(updated_at, created_at, NOW()) 
       WHERE updated_at IS NULL;`,

      `UPDATE email_addresses 
       SET created_at = COALESCE(created_at, NOW()) 
       WHERE created_at IS NULL;`,

      // Fix campaigns
      `UPDATE campaigns 
       SET updated_at = COALESCE(updated_at, created_at, NOW()) 
       WHERE updated_at IS NULL;`,

      `UPDATE campaigns 
       SET created_at = COALESCE(created_at, NOW()) 
       WHERE created_at IS NULL;`,

      // Fix campaign_recipients
      `UPDATE campaign_recipients 
       SET updated_at = COALESCE(updated_at, created_at, NOW()) 
       WHERE updated_at IS NULL;`,

      `UPDATE campaign_recipients 
       SET created_at = COALESCE(created_at, NOW()) 
       WHERE created_at IS NULL;`,

      // Fix email_templates
      `UPDATE email_templates 
       SET updated_at = COALESCE(updated_at, created_at, NOW()) 
       WHERE updated_at IS NULL;`,

      `UPDATE email_templates 
       SET created_at = COALESCE(created_at, NOW()) 
       WHERE created_at IS NULL;`,

      // Fix email_tracking_events
      `UPDATE email_tracking_events 
       SET updated_at = COALESCE(updated_at, created_at, NOW()) 
       WHERE updated_at IS NULL;`,

      `UPDATE email_tracking_events 
       SET created_at = COALESCE(created_at, NOW()) 
       WHERE created_at IS NULL;`,

      // Fix email_tracking_pixels
      `UPDATE email_tracking_pixels 
       SET updated_at = COALESCE(updated_at, created_at, NOW()) 
       WHERE updated_at IS NULL;`,

      `UPDATE email_tracking_pixels 
       SET created_at = COALESCE(created_at, NOW()) 
       WHERE created_at IS NULL;`,

      // Fix NULL campaign_recipient_id in email_tracking_events (delete rows with NULL foreign keys)
      // This is safe because tracking events without recipients are invalid
      `DELETE FROM email_tracking_events 
       WHERE campaign_recipient_id IS NULL;`,
    ];

    console.log('\n🔄 Fixing NULL foreign key values...\n');

    // Fix NULL campaign_recipient_id separately
    try {
      const [deleteResult] = await PsqlSequelize.query(
        `DELETE FROM email_tracking_events WHERE campaign_recipient_id IS NULL;`
      );
      const deletedCount = deleteResult?.rowCount || 0;
      if (deletedCount > 0) {
        console.log(`✅ Deleted ${deletedCount} invalid tracking event(s) with NULL campaign_recipient_id`);
      } else {
        console.log('ℹ️  No invalid tracking events found');
      }
    } catch (error) {
      if (error.message.includes('does not exist')) {
        console.log('ℹ️  email_tracking_events table doesn\'t exist yet, skipping...');
      } else {
        console.error(`⚠️  Error fixing campaign_recipient_id: ${error.message}`);
      }
    }

    for (const query of queries) {
      try {
        const [results] = await PsqlSequelize.query(query);
        const rowCount = results?.rowCount || 0;
        if (rowCount > 0) {
          console.log(`✅ Fixed ${rowCount} row(s)`);
        }
      } catch (error) {
        // Ignore table doesn't exist errors
        if (error.message.includes('does not exist')) {
          console.log(`ℹ️  Table doesn't exist yet, skipping...`);
        } else {
          console.error(`⚠️  Error: ${error.message}`);
        }
      }
    }

    console.log('\n✅ All NULL timestamps fixed!');
    console.log('\n✅ You can now restart the server safely.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

fixNullTimestamps();

