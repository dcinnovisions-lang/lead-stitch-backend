require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function setupDatabase() {
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: 'postgres', // Connect to default database first
  };

  if (!dbConfig.password) {
    console.error('❌ DB_PASSWORD not found in .env file');
    process.exit(1);
  }

  console.log('🔄 Setting up database...');
  console.log(`   Host: ${dbConfig.host}`);
  console.log(`   User: ${dbConfig.user}`);
  console.log(`   Database: ${process.env.DB_NAME || 'lead_stitch'}`);

  // Step 1: Connect to postgres database to create our database
  const adminPool = new Pool(dbConfig);

  try {
    // Check if database exists
    const checkResult = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [process.env.DB_NAME || 'lead_stitch']
    );

    if (checkResult.rows.length === 0) {
      console.log('📦 Creating database...');
      await adminPool.query(`CREATE DATABASE ${process.env.DB_NAME || 'lead_stitch'}`);
      console.log('✅ Database created successfully');
    } else {
      console.log('✅ Database already exists');
    }

    await adminPool.end();

    // Step 2: Connect to our database and run schema
    const dbPool = new Pool({
      ...dbConfig,
      database: process.env.DB_NAME || 'lead_stitch',
    });

    console.log('📋 Running database schema...');
    
    // Read schema file
    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Split by semicolons and execute each statement
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await dbPool.query(statement);
        } catch (err) {
          // Ignore "already exists" errors
          if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
            console.warn(`⚠️  Warning: ${err.message}`);
          }
        }
      }
    }

    console.log('✅ Database schema created successfully');
    await dbPool.end();

    console.log('');
    console.log('🎉 Database setup complete!');
    console.log('   You can now start the backend server.');

  } catch (error) {
    console.error('❌ Database setup error:', error.message);
    if (error.message.includes('password authentication')) {
      console.error('   Please check your DB_PASSWORD in .env file');
    } else if (error.message.includes('does not exist')) {
      console.error('   Please check your PostgreSQL server is running');
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  setupDatabase();
}

module.exports = setupDatabase;

