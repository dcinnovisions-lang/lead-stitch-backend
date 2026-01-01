/**
 * Script to fix NULL values in email_tracking_events
 * Deletes rows with NULL required fields since they're invalid
 * 
 * Usage:
 * node scripts/fixCampaignRecipientId.js
 */

require('dotenv').config();
const { PsqlSequelize } = require('../config/model');

async function fixEmailTrackingEvents() {
  try {
    console.log('\n🔄 Fixing NULL values in email_tracking_events...\n');

    const columnsToFix = [
      'campaign_recipient_id',
      'campaign_id',
      'recipient_id',
      'event_type'
    ];

    // Step 1: Make all required columns nullable temporarily
    for (const column of columnsToFix) {
      try {
        await PsqlSequelize.query(`
          ALTER TABLE email_tracking_events 
          ALTER COLUMN ${column} DROP NOT NULL;
        `);
        console.log(`✅ Made ${column} nullable temporarily`);
      } catch (error) {
        if (error.message.includes('does not exist') || error.message.includes('column') && error.message.includes('does not exist')) {
          console.log(`ℹ️  Column ${column} already nullable or table doesn't exist`);
        } else {
          console.log(`ℹ️  ${column}: ${error.message}`);
        }
      }
    }

    // Step 2: Delete rows with NULL required fields
    try {
      const [result] = await PsqlSequelize.query(`
        DELETE FROM email_tracking_events 
        WHERE campaign_recipient_id IS NULL 
           OR campaign_id IS NULL 
           OR recipient_id IS NULL 
           OR event_type IS NULL;
      `);
      const deletedCount = result?.rowCount || 0;
      if (deletedCount > 0) {
        console.log(`\n✅ Deleted ${deletedCount} invalid tracking event(s) with NULL required fields`);
      } else {
        console.log('\nℹ️  No invalid tracking events found');
      }
    } catch (error) {
      if (error.message.includes('does not exist')) {
        console.log('ℹ️  email_tracking_events table doesn\'t exist yet');
      } else {
        throw error;
      }
    }

    // Step 3: Make columns NOT NULL again
    for (const column of columnsToFix) {
      try {
        await PsqlSequelize.query(`
          ALTER TABLE email_tracking_events 
          ALTER COLUMN ${column} SET NOT NULL;
        `);
        console.log(`✅ Made ${column} NOT NULL again`);
      } catch (error) {
        console.log(`⚠️  Warning: Could not set NOT NULL for ${column}: ${error.message}`);
        console.log(`   This is okay - the column will remain nullable`);
      }
    }

    console.log('\n✅ Fix completed!\n');
    console.log('✅ You can now restart the server safely.\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

fixEmailTrackingEvents();

