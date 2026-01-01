const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'lead_stitch',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
    console.error('   Please check:');
    console.error('   1. PostgreSQL is running');
    console.error('   2. Database exists (run: node utils/createDatabase.js)');
    console.error('   3. DB_PASSWORD in .env is correct');
  } else {
    console.log('✅ Database connected successfully');
    console.log(`   Database: ${process.env.DB_NAME || 'lead_stitch'}`);
  }
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  // Don't exit in development, just log the error
  if (process.env.NODE_ENV === 'production') {
    process.exit(-1);
  }
});

module.exports = pool;

