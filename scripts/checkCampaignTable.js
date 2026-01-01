require('dotenv').config();
const db = require('../config/database');

async function checkCampaignTable() {
  try {
    console.log('Checking email_campaigns table structure...\n');
    
    // Get all columns in the table
    const result = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'email_campaigns'
      ORDER BY ordinal_position
    `);

    console.log('Columns in email_campaigns table:');
    result.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    // Check for required columns
    const requiredColumns = [
      'id', 'user_id', 'name', 'description', 'template_id', 'smtp_credential_id',
      'subject', 'body_html', 'body_text', 'status', 'scheduled_at', 'started_at',
      'completed_at', 'total_recipients', 'sent_count', 'delivered_count', 'opened_count',
      'clicked_count', 'bounced_count', 'replied_count', 'unsubscribed_count', 'settings',
      'created_at', 'updated_at'
    ];

    const existingColumns = result.rows.map(r => r.column_name);
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));

    if (missingColumns.length > 0) {
      console.log(`\n❌ Missing columns: ${missingColumns.join(', ')}`);
      process.exit(1);
    } else {
      console.log('\n✅ All required columns exist!');
      process.exit(0);
    }
  } catch (error) {
    console.error('Error checking table:', error);
    process.exit(1);
  }
}

checkCampaignTable();


