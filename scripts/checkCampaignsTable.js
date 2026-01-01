require('dotenv').config();
const db = require('../config/database');

async function checkCampaignsTable() {
  try {
    console.log('Checking campaigns table structure...\n');
    
    // Check if campaigns table exists
    const tableCheck = await db.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'campaigns'
      )`
    );
    
    if (!tableCheck.rows[0].exists) {
      console.log('❌ campaigns table does NOT exist!');
      console.log('\nChecking if email_campaigns table exists...');
      
      const emailCampaignsCheck = await db.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'email_campaigns'
        )`
      );
      
      if (emailCampaignsCheck.rows[0].exists) {
        console.log('✅ email_campaigns table EXISTS');
        console.log('\n⚠️  ISSUE: The code is using "campaigns" table but "email_campaigns" exists!');
      } else {
        console.log('❌ email_campaigns table also does NOT exist!');
      }
      process.exit(1);
    }
    
    console.log('✅ campaigns table EXISTS\n');
    
    // Get columns
    const columns = await db.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' 
       AND table_name = 'campaigns'
       ORDER BY ordinal_position`
    );
    
    console.log('Columns in campaigns table:');
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
    });
    
    // Check foreign key constraints on campaign_recipients
    console.log('\nChecking foreign key constraints on campaign_recipients...');
    const fkCheck = await db.query(
      `SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'campaign_recipients'
        AND kcu.column_name = 'campaign_id'`
    );
    
    if (fkCheck.rows.length > 0) {
      console.log('\nForeign key constraint found:');
      fkCheck.rows.forEach(fk => {
        console.log(`  Constraint: ${fk.constraint_name}`);
        console.log(`  Points to: ${fk.foreign_table_name}.${fk.foreign_column_name}`);
      });
    } else {
      console.log('\n⚠️  No foreign key constraint found on campaign_recipients.campaign_id');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error checking tables:', error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

checkCampaignsTable();

