// Run this script to create the database
// Usage: node CREATE_DATABASE.js

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const dbName = process.env.DB_NAME || 'lead_stitch';
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
};

console.log('=== Database Setup Script ===\n');
console.log('Configuration:');
console.log(`  Host: ${dbConfig.host}`);
console.log(`  Port: ${dbConfig.port}`);
console.log(`  User: ${dbConfig.user}`);
console.log(`  Database: ${dbName}`);
console.log(`  Password: ${dbConfig.password ? '***' + dbConfig.password.slice(-2) : 'NOT SET'}\n`);

if (!dbConfig.password) {
  console.error('❌ ERROR: DB_PASSWORD is not set in .env');
  console.error('   Please add: DB_PASSWORD=your_actual_password');
  process.exit(1);
}

async function setupDatabase() {
  // Step 1: Connect to postgres database
  console.log('Step 1: Connecting to PostgreSQL...');
  const adminPool = new Pool({
    ...dbConfig,
    database: 'postgres',
  });

  try {
    await adminPool.query('SELECT NOW()');
    console.log('✅ Connected to PostgreSQL\n');

    // Step 2: Check if database exists
    console.log('Step 2: Checking if database exists...');
    const checkResult = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );

    if (checkResult.rows.length === 0) {
      console.log(`Creating database '${dbName}'...`);
      await adminPool.query(`CREATE DATABASE ${dbName}`);
      console.log('✅ Database created\n');
    } else {
      console.log('✅ Database already exists\n');
    }

    await adminPool.end();

    // Step 3: Connect to our database and create tables
    console.log('Step 3: Connecting to database...');
    const dbPool = new Pool({
      ...dbConfig,
      database: dbName,
    });

    await dbPool.query('SELECT NOW()');
    console.log('✅ Connected to database\n');

    // Step 4: Read and execute schema
    console.log('Step 4: Reading schema file...');
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found: ${schemaPath}`);
    }
    const schema = fs.readFileSync(schemaPath, 'utf8');
    console.log('✅ Schema file loaded\n');

    console.log('Step 5: Creating tables...');
    await dbPool.query(schema);
    console.log('✅ Tables created\n');

    // Step 6: Verify tables
    console.log('Step 6: Verifying tables...');
    const tablesResult = await dbPool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    console.log(`✅ Found ${tablesResult.rows.length} tables:`);
    tablesResult.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.table_name}`);
    });

    await dbPool.end();

    console.log('\n=== ✅ Database Setup Complete! ===\n');
    console.log('You can now start the backend server and test the application.');
    console.log('Frontend: http://localhost:5173');
    console.log('Backend: http://localhost:5000/api\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    
    if (error.code === '28P01') {
      console.error('\n🔐 Authentication failed!');
      console.error('   The password in .env is incorrect.');
      console.error('   Current password in .env: ' + (dbConfig.password ? '***' + dbConfig.password.slice(-2) : 'NOT SET'));
      console.error('   Please update DB_PASSWORD in backend/.env with your actual PostgreSQL password.');
      console.error('\n   To find your password:');
      console.error('   - Check what you set during PostgreSQL installation');
      console.error('   - Or reset it in pgAdmin');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n🔌 Connection refused!');
      console.error('   PostgreSQL is not running or not accessible.');
      console.error('   Please make sure PostgreSQL service is running.');
    } else if (error.code === '3D000') {
      console.error('\n📁 Database does not exist and could not be created.');
      console.error('   Please check PostgreSQL permissions.');
    } else {
      console.error('\n💡 Error details:', error.message);
    }
    
    process.exit(1);
  }
}

setupDatabase();

