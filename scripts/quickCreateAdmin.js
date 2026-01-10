/**
 * Quick script to create admin user without interactive prompts
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Users, PsqlSequelize } = require('../config/model');

async function createAdminUser() {
    try {
        const email = 'admin@leadstitch.com';
        const password = 'AdminPass123!';

        console.log('\n🔐 Creating Admin User...\n');
        console.log(`📧 Email: ${email}`);
        console.log(`🔑 Password: ${password}\n`);

        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Find or create user
        const [user, created] = await Users.findOrCreate({
            where: { email: email },
            defaults: {
                email: email,
                password_hash: passwordHash,
                role: 'admin',
                is_active: true,
                approval_status: 'approved', // Auto-approve admin
                approved_at: new Date()
            }
        });

        if (created) {
            console.log('✅ Admin user created successfully!');
        } else {
            // Update existing user to admin and set password
            await user.update({
                password_hash: passwordHash,
                role: 'admin',
                is_active: true,
                approval_status: 'approved',
                approved_at: new Date()
            });
            console.log('✅ Existing user updated to admin role!');
        }

        console.log('\n📋 Admin User Details:');
        console.log(`   Email: ${user.email}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Status: ${user.approval_status}`);
        console.log(`   Active: ${user.is_active}`);
        console.log(`   User ID: ${user.id}`);

        console.log('\n🚀 Login Instructions:');
        console.log('   1. Go to: http://localhost:5173/login');
        console.log(`   2. Email: admin@leadstitch.com`);
        console.log(`   3. Password: AdminPass123!`);
        console.log('   4. After login, click "Admin" in sidebar');
        console.log('   5. Access: Admin Dashboard > User Approvals');

        console.log('\n✅ Setup Complete!\n');

        // Close database connection
        await PsqlSequelize.close();
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('\nStack trace:', error.stack);

        try {
            await PsqlSequelize.close();
        } catch (closeError) {
            // Ignore
        }

        process.exit(1);
    }
}

createAdminUser();
