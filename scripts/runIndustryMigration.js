// Run database migration for adding industry column to decision_maker_roles table
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'lead_stitch',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting database migration: Add industry to decision_maker_roles');
    console.log('=' .repeat(80));
    
    // Read migration file (database folder is in project root, not in backend)
    const migrationPath = path.join(__dirname, '..', '..', 'database', 'migrations', 'add_industry_to_decision_makers.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Migration file loaded:', migrationPath);
    console.log('');
    
    // Start transaction
    await client.query('BEGIN');
    console.log('✅ Transaction started');
    
    // Check if column already exists
    const checkColumnQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'decision_maker_roles' 
      AND column_name = 'industry';
    `;
    const checkResult = await client.query(checkColumnQuery);
    
    if (checkResult.rows.length > 0) {
      console.log('⚠️  Column "industry" already exists in decision_maker_roles table');
      console.log('   Skipping migration (already applied)');
      await client.query('ROLLBACK');
      return;
    }
    
    console.log('📝 Adding "industry" column to decision_maker_roles table...');
    
    // Execute migration
    await client.query(migrationSQL);
    
    console.log('✅ Migration SQL executed successfully');
    console.log('');
    
    // Verify the column was added
    const verifyResult = await client.query(checkColumnQuery);
    if (verifyResult.rows.length === 0) {
      throw new Error('Column was not added successfully');
    }
    
    console.log('✅ Verified: Column "industry" exists');
    
    // Check if index was created
    const checkIndexQuery = `
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'decision_maker_roles' 
      AND indexname = 'idx_decision_maker_roles_industry';
    `;
    const indexResult = await client.query(checkIndexQuery);
    
    if (indexResult.rows.length > 0) {
      console.log('✅ Verified: Index "idx_decision_maker_roles_industry" created');
    }
    
    // Check how many rows were updated
    const countQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(industry) as with_industry
      FROM decision_maker_roles;
    `;
    const countResult = await client.query(countQuery);
    const stats = countResult.rows[0];
    
    console.log('');
    console.log('📊 Migration Statistics:');
    console.log(`   Total decision makers: ${stats.total}`);
    console.log(`   With industry assigned: ${stats.with_industry}`);
    console.log(`   Remaining (no industry): ${stats.total - stats.with_industry}`);
    
    // Commit transaction
    await client.query('COMMIT');
    console.log('');
    console.log('✅ Transaction committed');
    console.log('');
    console.log('=' .repeat(80));
    console.log('🎉 Migration completed successfully!');
    console.log('=' .repeat(80));
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('');
    console.error('=' .repeat(80));
    console.error('❌ Migration failed!');
    console.error('=' .repeat(80));
    console.error('Error:', error.message);
    console.error('');
    console.error('Stack trace:');
    console.error(error.stack);
    console.error('');
    console.error('Transaction rolled back. No changes were made to the database.');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
runMigration().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
