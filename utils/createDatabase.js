const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function createDatabase() {
  const dbName = process.env.DB_NAME || 'lead_stitch';
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  };

  if (!dbConfig.password) {
    console.error('❌ DB_PASSWORD not found in .env file');
    process.exit(1);
  }

  // Connect to default postgres database to create our database
  const adminPool = new Pool({
    ...dbConfig,
    database: 'postgres', // Connect to default database
  });

  try {
    console.log('Connecting to PostgreSQL...');
    
    // Check if database exists
    const checkResult = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );

    if (checkResult.rows.length === 0) {
      // Create database
      console.log(`Creating database '${dbName}'...`);
      await adminPool.query(`CREATE DATABASE ${dbName}`);
      console.log('✅ Database created successfully');
    } else {
      console.log('✅ Database already exists');
    }

    await adminPool.end();

    // Now connect to our database and run schema
    console.log('Connecting to database...');
    const dbPool = new Pool({
      ...dbConfig,
      database: dbName,
    });

    // Read and execute schema
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    console.log('Reading schema file...');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Execute schema
    console.log('Executing schema...');
    await dbPool.query(schema);
    console.log('✅ Database schema created successfully');

    // Verify tables were created
    const tablesResult = await dbPool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    console.log(`✅ Created ${tablesResult.rows.length} tables:`);
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    await dbPool.end();
    console.log('\n✅ Database setup complete!');
  } catch (error) {
    console.error('❌ Database setup error:', error.message);
    if (error.code === '28P01') {
      console.error('   Authentication failed. Please check DB_PASSWORD in .env file.');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('   Could not connect to PostgreSQL. Make sure PostgreSQL is running.');
    }
    process.exit(1);
  }
}

if (require.main === module) {
  createDatabase();
}

module.exports = createDatabase;

