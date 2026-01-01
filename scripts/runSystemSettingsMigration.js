/**
 * Database Migration Script: Create system_settings table
 * 
 * This script creates the system_settings table and inserts the default
 * records_per_role setting.
 * 
 * Usage:
 *   node backend/scripts/runSystemSettingsMigration.js
 * 
 * Or from project root:
 *   node backend/scripts/runSystemSettingsMigration.js
 */

require('dotenv').config();
const path = require('path');

// Resolve path to config/model.js (works from both project root and backend directory)
const modelPath = path.resolve(__dirname, '../config/model.js');
const { PsqlSequelize } = require(modelPath);
const { QueryTypes } = require('sequelize');

async function runMigration() {
  console.log('\n' + '='.repeat(80));
  console.log('🔄 Starting System Settings Migration');
  console.log('='.repeat(80) + '\n');

  try {
    // Test database connection
    console.log('📡 Step 1: Testing database connection...');
    await PsqlSequelize.authenticate();
    console.log('✅ Database connection successful\n');

    // Create system_settings table
    console.log('📋 Step 2: Creating system_settings table...');
    await PsqlSequelize.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          key VARCHAR(255) UNIQUE NOT NULL,
          value TEXT NOT NULL,
          description TEXT,
          updated_by UUID,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
      );
    `, { type: QueryTypes.RAW });
    console.log('✅ Table created successfully\n');

    // Create index
    console.log('📊 Step 3: Creating index on key column...');
    await PsqlSequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);
    `, { type: QueryTypes.RAW });
    console.log('✅ Index created successfully\n');

    // Insert default records_per_role setting
    console.log('💾 Step 4: Inserting default records_per_role setting...');
    
    // Try to insert, handle duplicate gracefully
    try {
      await PsqlSequelize.query(`
        INSERT INTO system_settings (key, value, description)
        VALUES ('records_per_role', '2', 'Number of LinkedIn profiles to scrape per decision maker role')
        ON CONFLICT (key) DO NOTHING;
      `, { type: QueryTypes.RAW });
      console.log('✅ Default setting inserted (or already exists)');
    } catch (insertError) {
      // If it's a duplicate key error, that's fine - it already exists
      if (insertError.original && insertError.original.code === '23505') {
        console.log('ℹ️  Setting already exists (duplicate key)');
      } else {
        console.error('❌ Insert error:', insertError.message);
        throw insertError;
      }
    }
    console.log('');

    // Verify migration
    console.log('✅ Step 5: Verifying migration...');
    const settings = await PsqlSequelize.query(`
      SELECT key, value, description, created_at, updated_at 
      FROM system_settings 
      WHERE key = 'records_per_role';
    `, { type: QueryTypes.SELECT });

    // Sequelize returns [results, metadata] for SELECT queries
    const settingsData = Array.isArray(settings) && settings.length > 0 ? settings[0] : settings;
    
    if (settingsData && settingsData.length > 0) {
      const setting = settingsData[0];
      console.log('✅ Migration verified successfully!');
      console.log('📊 Current setting:');
      console.log('   Key:', setting.key);
      console.log('   Value:', setting.value);
      console.log('   Description:', setting.description);
      console.log('   Created:', setting.created_at);
    } else {
      // Try one more time with a simpler query
      const retrySettings = await PsqlSequelize.query(`
        SELECT COUNT(*) as count FROM system_settings WHERE key = 'records_per_role';
      `, { type: QueryTypes.SELECT });
      
      if (retrySettings && retrySettings[0] && retrySettings[0][0] && retrySettings[0][0].count > 0) {
        console.log('✅ Migration verified successfully! (setting exists)');
      } else {
        console.log('⚠️  Warning: Could not verify setting, but migration completed');
        console.log('   You can verify manually by checking the database');
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Migration completed successfully!');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('❌ Migration failed!');
    console.error('='.repeat(80));
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('='.repeat(80) + '\n');
    process.exit(1);
  } finally {
    await PsqlSequelize.close();
  }
}

// Run migration
runMigration();

