// Load .env from backend directory
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { PsqlSequelize } = require('../config/model');
const fs = require('fs');

async function addTicketIndexes() {
  try {
    await PsqlSequelize.authenticate();
    console.log('✅ Database connected successfully');

    // Check if tickets table exists
    const [tables] = await PsqlSequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('tickets', 'ticket_comments', 'ticket_attachments')
    `);

    const existingTables = tables.map(t => t.table_name);
    
    if (!existingTables.includes('tickets')) {
      console.log('\n⚠️  Ticket tables do not exist yet.');
      console.log('💡 The tables will be created automatically when you start the server.');
      console.log('💡 Steps to follow:');
      console.log('   1. Start your backend server: node server.js');
      console.log('   2. Wait for tables to be created (check server logs)');
      console.log('   3. Then run this script again: node scripts/addTicketIndexes.js\n');
      process.exit(0);
    }

    console.log('\n🔄 Adding indexes for ticket system...\n');

    const sqlFile = path.join(__dirname, '../../database/indexes_tickets.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    // Split by semicolon and execute each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      try {
        await PsqlSequelize.query(statement);
        console.log(`✅ Executed: ${statement.substring(0, 50)}...`);
      } catch (error) {
        // Ignore "already exists" errors
        if (error.message.includes('already exists')) {
          console.log(`ℹ️  Index already exists: ${statement.substring(0, 50)}...`);
        } else {
          console.error(`❌ Error executing: ${statement.substring(0, 50)}...`);
          console.error(`   ${error.message}`);
        }
      }
    }

    console.log('\n✅ Ticket system indexes added successfully!');
    console.log('✅ Database performance optimized for ticket queries.\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding indexes:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

addTicketIndexes();

