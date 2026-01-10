/**
 * Migration Script: Add User Approval System
 * Run this after updating the code
 * Usage: node scripts/migrateUserApproval.js
 */

const { PsqlSequelize, Users } = require('../config/model');

async function migrate() {
    try {
        console.log('🔄 Starting User Approval System Migration...\n');

        // Check if columns already exist
        const tableInfo = await PsqlSequelize.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='users' AND column_name='approval_status'
        `);

        if (tableInfo[0].length > 0) {
            console.log('✅ approval_status column already exists. Checking other columns...\n');
        } else {
            console.log('📦 Creating new columns for approval system...\n');

            // Add new columns
            await PsqlSequelize.query(`
                ALTER TABLE users 
                ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50) DEFAULT 'pending',
                ADD COLUMN IF NOT EXISTS approved_by UUID,
                ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
                ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
            `);

            console.log('✅ Added columns:');
            console.log('   - approval_status (VARCHAR, default: "pending")');
            console.log('   - approved_by (UUID reference to approving admin)');
            console.log('   - approved_at (TIMESTAMP)');
            console.log('   - rejection_reason (TEXT)\n');
        }

        // Set all existing users to 'approved' status (backward compatibility)
        console.log('🔄 Updating existing users to "approved" status (backward compatibility)...\n');
        await Users.update(
            { approval_status: 'approved' },
            { where: { approval_status: null } }
        );

        console.log('✅ Updated existing users\n');

        // Create index for faster queries
        console.log('📊 Creating database index for approval_status...\n');
        await PsqlSequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_users_approval_status 
            ON users(approval_status);
        `);

        console.log('✅ Index created\n');

        // Log summary
        console.log('📊 Migration Statistics:\n');
        const stats = await Users.findAll({
            attributes: [
                'approval_status',
                [PsqlSequelize.fn('COUNT', PsqlSequelize.col('id')), 'count']
            ],
            group: ['approval_status'],
            raw: true
        });

        stats.forEach(stat => {
            const icon = 
                stat.approval_status === 'pending' ? '⏳' :
                stat.approval_status === 'approved' ? '✅' :
                stat.approval_status === 'rejected' ? '❌' : '❓';
            console.log(`${icon} ${stat.approval_status}: ${stat.count} users`);
        });

        console.log('\n✅ Migration completed successfully!\n');
        console.log('📝 Next steps:');
        console.log('   1. Create an admin user (if not exists): node scripts/createAdminUser.js');
        console.log('   2. Access admin panel at: /admin/user-approvals');
        console.log('   3. New users will need admin approval to use the app\n');

    } catch (error) {
        console.error('❌ Migration error:', error);
        process.exit(1);
    }
}

// Run migration
migrate().then(() => {
    process.exit(0);
}).catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
