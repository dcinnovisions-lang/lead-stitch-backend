/**
 * Script to manually add admin columns to users table
 * Run this if sequelize.sync() hasn't added the columns yet
 * 
 * Usage:
 * node scripts/addAdminColumns.js
 */

require('dotenv').config();
const { PsqlSequelize } = require('../config/model');

async function addAdminColumns() {
  try {
    console.log('\n🔄 Adding admin columns to users table...\n');

    // Check if columns exist and add them
    const queries = [
      // Create ENUM type if it doesn't exist
      `DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
              CREATE TYPE user_role AS ENUM ('user', 'admin');
          END IF;
      END $$;`,

      // Add role column
      `ALTER TABLE users 
       ADD COLUMN IF NOT EXISTS role VARCHAR(10) DEFAULT 'user';`,

      // Convert role column to ENUM type (if it's VARCHAR)
      `DO $$
      BEGIN
          IF EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'users' 
              AND column_name = 'role' 
              AND data_type = 'character varying'
          ) THEN
              ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;
          END IF;
      END $$;`,

      // Add is_active column
      `ALTER TABLE users 
       ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;`,

      // Add last_login_at column
      `ALTER TABLE users 
       ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;`,

      // Add suspended_at column
      `ALTER TABLE users 
       ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP;`,

      // Update existing users to have default values
      `UPDATE users SET role = 'user' WHERE role IS NULL;`,
      `UPDATE users SET is_active = true WHERE is_active IS NULL;`,

      // Create indexes
      `CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);`,
      `CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);`,
    ];

    for (const query of queries) {
      try {
        await PsqlSequelize.query(query);
        console.log('✅ Executed query successfully');
      } catch (error) {
        // Ignore "already exists" errors
        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
          console.log('ℹ️  Column/index already exists, skipping...');
        } else {
          throw error;
        }
      }
    }

    console.log('\n✅ All admin columns added successfully!');
    console.log('\n📋 Added columns:');
    console.log('   - role (ENUM: user, admin)');
    console.log('   - is_active (BOOLEAN)');
    console.log('   - last_login_at (TIMESTAMP)');
    console.log('   - suspended_at (TIMESTAMP)');
    console.log('\n✅ You can now run: node scripts/createAdminUser.js admin@gmail.com admin123');
    console.log('\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

addAdminColumns();

