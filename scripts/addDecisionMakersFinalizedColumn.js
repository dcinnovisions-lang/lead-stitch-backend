require('dotenv').config();
const { PsqlSequelize: sequelize } = require('../config/model');

async function addDecisionMakersFinalizedColumn() {
  try {
    console.log('🔄 Adding decision_makers_finalized_at column to business_requirements table...');
    
    // Check if column already exists
    const [results] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='business_requirements' 
      AND column_name='decision_makers_finalized_at'
    `);
    
    if (results.length > 0) {
      console.log('✅ Column decision_makers_finalized_at already exists');
      process.exit(0);
    }
    
    // Add the column
    await sequelize.query(`
      ALTER TABLE business_requirements 
      ADD COLUMN decision_makers_finalized_at TIMESTAMP NULL
    `);
    
    console.log('✅ Successfully added decision_makers_finalized_at column');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding column:', error.message);
    if (error.original) {
      console.error('   Original error:', error.original.message);
    }
    process.exit(1);
  }
}

addDecisionMakersFinalizedColumn();

