// Verify industry migration - check database state
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'lead_stitch',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function verifyMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Verifying Industry Migration');
    console.log('=' .repeat(80));
    console.log('');
    
    // 1. Check column exists
    const columnCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'decision_maker_roles' 
      AND column_name = 'industry';
    `);
    
    if (columnCheck.rows.length > 0) {
      console.log('✅ Column "industry" exists');
      console.log(`   Type: ${columnCheck.rows[0].data_type}`);
    } else {
      console.log('❌ Column "industry" NOT found');
      return;
    }
    
    // 2. Check index exists
    const indexCheck = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'decision_maker_roles' 
      AND indexname = 'idx_decision_maker_roles_industry';
    `);
    
    if (indexCheck.rows.length > 0) {
      console.log('✅ Index "idx_decision_maker_roles_industry" exists');
    } else {
      console.log('⚠️  Index NOT found (may need to be created)');
    }
    
    console.log('');
    
    // 3. Get statistics
    const statsQuery = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(industry) as with_industry,
        COUNT(DISTINCT industry) as unique_industries
      FROM decision_maker_roles;
    `);
    
    const stats = statsQuery.rows[0];
    console.log('📊 Statistics:');
    console.log(`   Total decision makers: ${stats.total}`);
    console.log(`   With industry: ${stats.with_industry}`);
    console.log(`   Without industry: ${stats.total - stats.with_industry}`);
    console.log(`   Unique industries: ${stats.unique_industries}`);
    console.log('');
    
    // 4. Show industry distribution
    const industryDist = await client.query(`
      SELECT industry, COUNT(*) as count
      FROM decision_maker_roles
      WHERE industry IS NOT NULL
      GROUP BY industry
      ORDER BY count DESC
      LIMIT 10;
    `);
    
    console.log('🏭 Top 10 Industries:');
    industryDist.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.industry}: ${row.count} decision makers`);
    });
    console.log('');
    
    // 5. Show sample decision makers with industry
    const sampleQuery = await client.query(`
      SELECT 
        dm.role_title,
        dm.industry,
        br.industry as requirement_industry,
        br.operation_name
      FROM decision_maker_roles dm
      JOIN business_requirements br ON dm.business_requirement_id = br.id
      WHERE dm.industry IS NOT NULL
      LIMIT 5;
    `);
    
    console.log('📋 Sample Decision Makers (with industry):');
    sampleQuery.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.role_title} (${row.industry})`);
      console.log(`      Requirement: ${row.operation_name}`);
      console.log(`      Requirement Industry: ${row.requirement_industry || 'N/A'}`);
      console.log('');
    });
    
    console.log('=' .repeat(80));
    console.log('✅ Migration verification complete!');
    console.log('=' .repeat(80));
    
  } catch (error) {
    console.error('❌ Verification error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

verifyMigration();
