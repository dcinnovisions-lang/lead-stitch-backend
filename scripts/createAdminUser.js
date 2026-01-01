/**
 * Script to create or update a user to admin role with password
 * 
 * Usage (Interactive Mode):
 * node scripts/createAdminUser.js
 * 
 * Usage (Command Line Arguments):
 * node scripts/createAdminUser.js <email> <password>
 * 
 * Examples:
 * node scripts/createAdminUser.js
 * node scripts/createAdminUser.js admin@example.com admin123
 * node scripts/createAdminUser.js admin@example.com "MySecurePassword123!"
 */

// node scripts / createAdminUser.js "$ADMIN_EMAIL" "$ADMIN_PASSWORD"

require('dotenv').config();
const bcrypt = require('bcryptjs');
const readline = require('readline');
const { Users, PsqlSequelize } = require('../config/model');

// Helper function to prompt for user input
function promptInput(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

// Helper function to prompt for password (hidden input)
function promptPassword(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function createAdminUser() {
    try {
        let email = process.argv[2];
        let password = process.argv[3];

        // Interactive mode if arguments not provided
        if (!email || !password) {
            console.log('\n🔐 Admin User Creation Script');
            console.log('================================\n');

            if (!email) {
                email = await promptInput('Enter admin email: ');
                if (!email) {
                    console.error('❌ Error: Email is required');
                    process.exit(1);
                }
            }

            if (!password) {
                password = await promptPassword('Enter admin password: ');
                if (!password) {
                    console.error('❌ Error: Password is required');
                    process.exit(1);
                }

                // Confirm password
                const confirmPassword = await promptPassword('Confirm password: ');
                if (password !== confirmPassword) {
                    console.error('❌ Error: Passwords do not match');
                    process.exit(1);
                }
            }
        }

        // Validate email format (basic check)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.error('❌ Error: Invalid email format');
            process.exit(1);
        }

        // Validate password length
        if (password.length < 6) {
            console.error('❌ Error: Password must be at least 6 characters long');
            process.exit(1);
        }

        console.log(`\n🔍 Looking for user with email: ${email}`);

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
            }
        });

        if (created) {
            console.log('✅ User created as admin');
        } else {
            // Update existing user to admin and set password
            await user.update({
                password_hash: passwordHash,
                role: 'admin',
                is_active: true,
            });
            console.log('✅ User updated to admin role with new password');
        }

        console.log('\n📋 User Details:');
        console.log(`   Email: ${user.email}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Active: ${user.is_active}`);
        console.log(`   ID: ${user.id}`);

        console.log('\n✅ Admin user created/updated successfully!');
        console.log('\n📝 Login Instructions:');
        console.log('   1. Go to: http://localhost:5173/login');
        console.log(`   2. Email: ${email}`);
        console.log(`   3. Password: ${password}`);
        console.log('   4. After login, you will see "Admin" link in the sidebar');
        console.log('   5. Click "Admin" to access admin dashboard');

        console.log('\n✅ Done!');

        // Close database connection
        await PsqlSequelize.close();

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.stack) {
            console.error('\nStack trace:', error.stack);
        }

        // Close database connection on error
        try {
            await PsqlSequelize.close();
        } catch (closeError) {
            // Ignore close errors
        }

        process.exit(1);
    }
}

// Run the script
createAdminUser();

