/**
 * Create Tables from Sequelize Models
 * 
 * This script uses Sequelize to create all tables defined in model.js
 * It's safe to run multiple times - it won't drop existing tables
 * 
 * Usage: node scripts/createTablesFromModels.js
 */

require('dotenv').config();
const { PsqlSequelize } = require('../config/model');

async function createTables() {
    try {
        console.log('🔄 Connecting to database...');
        console.log(`   Host: ${process.env.DB_HOST || 'localhost'}`);
        console.log(`   Database: ${process.env.DB_NAME || 'lead_stitch'}`);
        console.log(`   User: ${process.env.DB_USER || 'postgres'}`);

        // Test connection
        await PsqlSequelize.authenticate();
        console.log('✅ Database connection established\n');

        console.log('🔄 Creating tables from models...');
        console.log('   (This may take a few moments)\n');

        // Sync all models - creates tables if they don't exist
        // alter: true = adds missing columns (safe for existing tables)
        // force: false = does NOT drop existing tables (safe)
        await PsqlSequelize.sync({
            alter: false,  // Set to true if you want to add missing columns
            force: false   // NEVER set to true in production (drops all tables!)
        });

        console.log('✅ All tables created successfully!\n');

        // List all tables
        const [results] = await PsqlSequelize.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);

        console.log(`📊 Created ${results.length} tables:\n`);
        results.forEach((row, index) => {
            console.log(`   ${index + 1}. ${row.table_name}`);
        });

        console.log('\n✅ Database setup complete!');
        console.log('💡 Next step: Run indexes.sql to create indexes for better performance');
        console.log('   psql -h your-host -U postgres -d lead_stitch -f database/indexes.sql\n');

    } catch (error) {
        console.error('\n❌ Error creating tables:', error.message);

        if (error.message.includes('password authentication')) {
            console.error('\n💡 Check your DB_PASSWORD in .env file or AWS Secrets Manager');
        } else if (error.message.includes('ECONNREFUSED')) {
            console.error('\n💡 Check:');
            console.error('   1. PostgreSQL is running');
            console.error('   2. DB_HOST and DB_PORT are correct');
            console.error('   3. Security groups allow connection (for AWS)');
        } else if (error.message.includes('does not exist')) {
            console.error('\n💡 Database does not exist. Creating it...');
            // Try to create database
            try {
                const { Pool } = require('pg');
                const adminPool = new Pool({
                    host: process.env.DB_HOST || 'localhost',
                    port: process.env.DB_PORT || 5432,
                    user: process.env.DB_USER || 'postgres',
                    password: process.env.DB_PASSWORD,
                    database: 'postgres' // Connect to default database
                });

                await adminPool.query(`CREATE DATABASE ${process.env.DB_NAME || 'lead_stitch'}`);
                await adminPool.end();
                console.log('✅ Database created! Please run this script again.');
            } catch (createError) {
                console.error('❌ Could not create database:', createError.message);
            }
        }

        process.exit(1);
    } finally {
        await PsqlSequelize.close();
    }
}

// Run if called directly
if (require.main === module) {
    createTables();
}

module.exports = createTables;
