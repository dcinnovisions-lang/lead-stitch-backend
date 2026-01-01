require('dotenv').config();
const db = require('../config/database');
const fs = require('fs');
const path = require('path');

async function addMissingColumns() {
  try {
    console.log('Adding missing columns to campaign_recipients table...\n');

    // Check and add lead_id
    const leadIdCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'campaign_recipients' 
      AND column_name = 'lead_id'
    `);

    if (leadIdCheck.rows.length === 0) {
      console.log('Adding lead_id column...');
      await db.query(`
        ALTER TABLE campaign_recipients 
        ADD COLUMN lead_id UUID REFERENCES linkedin_profiles(id) ON DELETE CASCADE
      `);
      
      // Copy data from linkedin_profile_id if it exists
      const linkedinProfileIdCheck = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'campaign_recipients' 
        AND column_name = 'linkedin_profile_id'
      `);
      
      if (linkedinProfileIdCheck.rows.length > 0) {
        await db.query(`
          UPDATE campaign_recipients 
          SET lead_id = linkedin_profile_id 
          WHERE linkedin_profile_id IS NOT NULL
        `);
        console.log('  ✅ Copied data from linkedin_profile_id to lead_id');
      }
      console.log('  ✅ lead_id column added');
    } else {
      console.log('  ✅ lead_id column already exists');
    }

    // Add email column
    const emailCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'campaign_recipients' 
      AND column_name = 'email'
    `);

    if (emailCheck.rows.length === 0) {
      console.log('Adding email column...');
      await db.query(`
        ALTER TABLE campaign_recipients 
        ADD COLUMN email VARCHAR(255)
      `);
      console.log('  ✅ email column added');
    } else {
      console.log('  ✅ email column already exists');
    }

    // Add name column
    const nameCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'campaign_recipients' 
      AND column_name = 'name'
    `);

    if (nameCheck.rows.length === 0) {
      console.log('Adding name column...');
      await db.query(`
        ALTER TABLE campaign_recipients 
        ADD COLUMN name VARCHAR(255)
      `);
      console.log('  ✅ name column added');
    } else {
      console.log('  ✅ name column already exists');
    }

    // Add delivered_at column
    const deliveredAtCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'campaign_recipients' 
      AND column_name = 'delivered_at'
    `);

    if (deliveredAtCheck.rows.length === 0) {
      console.log('Adding delivered_at column...');
      await db.query(`
        ALTER TABLE campaign_recipients 
        ADD COLUMN delivered_at TIMESTAMP
      `);
      console.log('  ✅ delivered_at column added');
    } else {
      console.log('  ✅ delivered_at column already exists');
    }

    // Add error_message column
    const errorMessageCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'campaign_recipients' 
      AND column_name = 'error_message'
    `);

    if (errorMessageCheck.rows.length === 0) {
      console.log('Adding error_message column...');
      await db.query(`
        ALTER TABLE campaign_recipients 
        ADD COLUMN error_message TEXT
      `);
      console.log('  ✅ error_message column added');
    } else {
      console.log('  ✅ error_message column already exists');
    }

    // Add personalization_data column
    const personalizationDataCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'campaign_recipients' 
      AND column_name = 'personalization_data'
    `);

    if (personalizationDataCheck.rows.length === 0) {
      console.log('Adding personalization_data column...');
      await db.query(`
        ALTER TABLE campaign_recipients 
        ADD COLUMN personalization_data JSONB
      `);
      console.log('  ✅ personalization_data column added');
    } else {
      console.log('  ✅ personalization_data column already exists');
    }

    console.log('\n✅ All missing columns have been added!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding columns:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  }
}

addMissingColumns();

