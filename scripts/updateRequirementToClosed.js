require('dotenv').config();
const db = require('../config/database');

/**
 * Update test requirement status to 'closed' so it appears on Leads page
 * Usage: node backend/scripts/updateRequirementToClosed.js
 */

async function updateStatus() {
  try {
    console.log('🔄 Updating requirement status to "closed"...\n');

    // Update the test requirement status
    const result = await db.query(
      `UPDATE business_requirements 
       SET status = 'closed', updated_at = CURRENT_TIMESTAMP 
       WHERE operation_name = 'Tech Team Recruitment - India'
       RETURNING id, operation_name, status`
    );

    if (result.rows.length > 0) {
      const req = result.rows[0];
      console.log('✅ Status updated successfully!');
      console.log(`   Requirement: "${req.operation_name}"`);
      console.log(`   ID: ${req.id}`);
      console.log(`   Status: ${req.status}\n`);
      
      // Get profile count
      const profileCount = await db.query(
        `SELECT COUNT(*) as count FROM linkedin_profiles 
         WHERE business_requirement_id = $1`,
        [req.id]
      );
      
      console.log(`   Profiles: ${profileCount.rows[0].count}`);
      console.log('\n✅ Requirement is now visible on Leads page!');
      console.log('   Visit: http://localhost:5173/leads\n');
    } else {
      console.log('⚠️  Requirement not found. Make sure test data was inserted.');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating status:', error);
    process.exit(1);
  }
}

updateStatus();

