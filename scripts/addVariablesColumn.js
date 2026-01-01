require('dotenv').config();
const db = require('../config/database');
const fs = require('fs');
const path = require('path');

async function addVariablesColumn() {
  try {
    console.log('Checking if variables column exists in email_templates...\n');
    
    // Check if column exists
    const checkResult = await db.query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_schema = 'public' 
       AND table_name = 'email_templates' 
       AND column_name = 'variables'`
    );

    if (checkResult.rows.length > 0) {
      console.log('✅ Column "variables" already exists in email_templates table');
      process.exit(0);
    }

    console.log('❌ Column "variables" does not exist. Adding it...\n');

    // Add the column
    await db.query(`
      ALTER TABLE email_templates 
      ADD COLUMN variables JSONB
    `);

    console.log('✅ Column "variables" successfully added to email_templates table!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding variables column:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  }
}

addVariablesColumn();


