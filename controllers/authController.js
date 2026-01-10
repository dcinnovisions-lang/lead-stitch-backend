const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const nodemailer = require('nodemailer');
const { Users } = require('../config/model');

// Register
exports.register = async (req, res) => {
    try {
        const { email, password, firstName, lastName } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Check if user exists using Sequelize
        const existingUser = await Users.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Create user using Sequelize
        const user = await Users.create({
            email,
            password_hash: passwordHash,
            first_name: firstName || null,
            last_name: lastName || null,
        });

        // Generate JWT token
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is not configured in environment variables');
        }
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        res.status(201).json({
            message: 'User registered successfully. Waiting for admin approval.',
            token,
            approvalStatus: user.approval_status,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                approvalStatus: user.approval_status,
            },
        });
    } catch (error) {
        console.error('Registration error:', error);
        console.error('Error stack:', error.stack);
        
        // Handle specific Sequelize errors
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).json({ 
                message: 'This email is already registered. Please use a different email or try logging in.'
            });
        }
        
        if (error.name === 'SequelizeValidationError') {
            const validationErrors = error.errors.map(err => err.message).join(', ');
            return res.status(400).json({ 
                message: `Validation error: ${validationErrors}`
            });
        }
        
        if (error.name === 'SequelizeDatabaseError') {
            return res.status(500).json({ 
                message: 'Database error occurred. Please try again later or contact support if the problem persists.'
            });
        }
        
        // Handle JWT errors
        if (error.message && error.message.includes('JWT_SECRET')) {
            return res.status(500).json({ 
                message: 'Server configuration error. Please contact support.'
            });
        }
        
        // Generic error - provide user-friendly message
        res.status(500).json({
            message: 'Unable to create account at this time. Please try again in a few moments. If the problem continues, please contact support.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Login - Step 1: Verify credentials and send OTP
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Find user using Sequelize
        const user = await Users.findOne({
            where: { email },
            attributes: ['id', 'email', 'password_hash', 'first_name', 'last_name', 'role', 'is_active', 'approval_status', 'rejection_reason']
        });

        if (!user) {
            return res.status(404).json({
                message: 'USER_NOT_FOUND',
                error: 'No user found with this email. Please sign up to create an account.'
            });
        }

        // Check if user is active
        if (!user.is_active) {
            return res.status(403).json({
                message: 'ACCOUNT_SUSPENDED',
                error: 'Your account has been suspended. Please contact support.'
            });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({
                message: 'INVALID_CREDENTIALS',
                error: 'Invalid email or password. Please check your credentials and try again.'
            });
        }

        // Check approval status (not for admins)
        if (user.role !== 'admin') {
            if (user.approval_status === 'pending') {
                return res.status(403).json({
                    message: 'PENDING_APPROVAL',
                    error: 'Your account is pending admin approval. Please check back later.',
                    approvalStatus: 'pending'
                });
            }

            if (user.approval_status === 'rejected') {
                return res.status(403).json({
                    message: 'ACCOUNT_REJECTED',
                    error: 'Your account has been rejected. Please contact support for more information.',
                    approvalStatus: 'rejected',
                    rejectionReason: user.rejection_reason
                });
            }
        }

        // Check if user is admin - skip OTP for admin
        if (user.role === 'admin') {
            console.log('✅ Admin login detected, skipping OTP for:', user.email);
            // Generate JWT token directly for admin
            if (!process.env.JWT_SECRET) {
                throw new Error('JWT_SECRET is not configured in environment variables');
            }
            const token = jwt.sign(
                { userId: user.id, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
            );

            // Update last_login_at
            await user.update({ last_login_at: new Date() });

            return res.json({
                message: 'Login successful',
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    role: user.role || 'admin',
                    is_active: user.is_active !== undefined ? user.is_active : true,
                },
                requiresOTP: false
            });
        }

        console.log('📧 Non-admin login, attempting to send OTP to:', user.email);

        // For non-admin users, send OTP for 2FA
        // Generate OTP for 2FA
        const otp = generateOTP();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

        // Save OTP to database
        await user.update({
            otp,
            otp_expires_at: otpExpiresAt,
            updated_at: new Date()
        });

        // Send OTP via email
        const transporter = createOTPTransporter();
        if (!transporter) {
            console.error('❌ Cannot send OTP email: SMTP not configured');
            return res.status(500).json({
                message: 'Email service not configured. Please contact support.'
            });
        }

        try {
            await transporter.sendMail({
                from: process.env.OTP_EMAIL_FROM || process.env.SMTP_USER || 'noreply@leadstitch.com',
                to: user.email,
                subject: 'Login OTP - Lead Stitch',
                html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0;">Lead Stitch</h1>
            </div>
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
              <h2 style="color: #1f2937; margin-top: 0;">Login Verification</h2>
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                Hello ${user.first_name || 'User'},
              </p>
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                You have requested to login to your account. Please use the following OTP to complete your login:
              </p>
              <div style="background: white; border: 2px dashed #2563eb; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
                <div style="font-size: 32px; font-weight: bold; color: #2563eb; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                  ${otp}
                </div>
              </div>
              <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">
                This OTP will expire in 10 minutes. If you didn't request this login, please ignore this email and consider changing your password.
              </p>
              <p style="color: #6b7280; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                This is an automated message. Please do not reply to this email.
              </p>
            </div>
          </div>
        `,
                text: `
          Login Verification - Lead Stitch
          
          Hello ${user.first_name || 'User'},
          
          You have requested to login to your account. Please use the following OTP to complete your login:
          
          OTP: ${otp}
          
          This OTP will expire in 10 minutes. If you didn't request this login, please ignore this email and consider changing your password.
          
          This is an automated message. Please do not reply to this email.
        `,
            });

            console.log(`✅ Login OTP sent to ${user.email}`);
        } catch (emailError) {
            console.error('Error sending login OTP email:', emailError);
            return res.status(500).json({
                message: 'Failed to send OTP email. Please try again later.'
            });
        }

        res.json({
            message: 'OTP has been sent to your email address',
            email: user.email,
            requiresOTP: true
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get current user
exports.getCurrentUser = async (req, res) => {
    try {
        const user = await Users.findByPk(req.user.userId, {
            attributes: ['id', 'email', 'first_name', 'last_name', 'role', 'is_active', 'created_at']
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if user is active
        if (!user.is_active) {
            return res.status(403).json({ message: 'Account is suspended' });
        }

        res.json({
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role || 'user',
            is_active: user.is_active !== undefined ? user.is_active : true,
            createdAt: user.created_at,
        });
    } catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Helper function to generate 6-digit OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Helper function to create email transporter for OTP emails
const createOTPTransporter = () => {
    // Use environment variables for OTP email configuration
    // If not set, use a default configuration (for development)
    const config = {
        host: process.env.OTP_SMTP_HOST || process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.OTP_SMTP_PORT || process.env.SMTP_PORT || '587'),
        secure: process.env.OTP_SMTP_SECURE === 'true' || false, // true for 465, false for other ports
        auth: {
            user: process.env.OTP_SMTP_USER || process.env.SMTP_USER,
            pass: process.env.OTP_SMTP_PASS || process.env.SMTP_PASS,
        },
    };

    // If no auth credentials, return null (will log error)
    if (!config.auth.user || !config.auth.pass) {
        console.warn('⚠️ OTP email credentials not configured. Set OTP_SMTP_USER and OTP_SMTP_PASS in .env');
        return null;
    }

    return nodemailer.createTransport(config);
};

// Forgot Password - Send OTP
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        // Validate input
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        // Check if user exists using Sequelize
        const user = await Users.findOne({
            where: { email },
            attributes: ['id', 'email', 'first_name']
        });

        if (!user) {
            // Don't reveal if email exists or not for security
            // But user requested to show "Kindly signup" message
            return res.status(404).json({ message: 'Kindly signup' });
        }

        // Generate OTP
        const otp = generateOTP();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

        // Save OTP to database using Sequelize
        await user.update({
            otp,
            otp_expires_at: otpExpiresAt,
            updated_at: new Date()
        });

        // Send OTP via email
        const transporter = createOTPTransporter();
        if (!transporter) {
            console.error('❌ Cannot send OTP email: SMTP not configured');
            return res.status(500).json({
                message: 'Email service not configured. Please contact support.'
            });
        }

        try {
            await transporter.sendMail({
                from: process.env.OTP_EMAIL_FROM || process.env.SMTP_USER || 'noreply@leadstitch.com',
                to: user.email,
                subject: 'Password Reset OTP - Lead Stitch',
                html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0;">Lead Stitch</h1>
            </div>
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
              <h2 style="color: #1f2937; margin-top: 0;">Password Reset Request</h2>
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                Hello ${user.first_name || 'User'},
              </p>
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                You have requested to reset your password. Please use the following OTP to verify your identity:
              </p>
              <div style="background: white; border: 2px dashed #2563eb; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
                <div style="font-size: 32px; font-weight: bold; color: #2563eb; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                  ${otp}
                </div>
              </div>
              <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">
                This OTP will expire in 10 minutes. If you didn't request this, please ignore this email.
              </p>
              <p style="color: #6b7280; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                This is an automated message. Please do not reply to this email.
              </p>
            </div>
          </div>
        `,
                text: `
          Password Reset Request - Lead Stitch
          
          Hello ${user.first_name || 'User'},
          
          You have requested to reset your password. Please use the following OTP to verify your identity:
          
          OTP: ${otp}
          
          This OTP will expire in 10 minutes. If you didn't request this, please ignore this email.
          
          This is an automated message. Please do not reply to this email.
        `,
            });

            console.log(`✅ OTP sent to ${user.email}`);
        } catch (emailError) {
            console.error('Error sending OTP email:', emailError);
            return res.status(500).json({
                message: 'Failed to send OTP email. Please try again later.'
            });
        }

        res.json({
            message: 'OTP has been sent to your email address',
            email: user.email // Return email for frontend to display
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Verify OTP
exports.verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        // Validate input
        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required' });
        }

        // Find user and check OTP using Sequelize
        const user = await Users.findOne({
            where: { email },
            attributes: ['id', 'email', 'otp', 'otp_expires_at']
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if OTP exists
        if (!user.otp) {
            return res.status(400).json({ message: 'No OTP found. Please request a new one.' });
        }

        // Check if OTP is expired
        if (new Date() > new Date(user.otp_expires_at)) {
            return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
        }

        // Verify OTP
        if (user.otp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
        }

        // OTP is valid - clear it from database (optional, or keep for password reset)
        // We'll keep it for now in case user wants to reset password after verification

        res.json({
            message: 'OTP verified successfully',
            verified: true
        });
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Reset Password (after OTP verification)
exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword, confirmPassword } = req.body;

        // Validate input
        if (!email || !otp || !newPassword || !confirmPassword) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // Check if passwords match
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ message: 'Passwords do not match' });
        }

        // Validate password strength (minimum 6 characters)
        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters long' });
        }

        // Find user and verify OTP again using Sequelize
        const user = await Users.findOne({
            where: { email },
            attributes: ['id', 'email', 'otp', 'otp_expires_at', 'first_name']
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify OTP is still valid
        if (!user.otp) {
            return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
        }

        if (new Date() > new Date(user.otp_expires_at)) {
            return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
        }

        if (user.otp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP. Please verify again.' });
        }

        // Hash new password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(newPassword, saltRounds);

        // Update password and clear OTP using Sequelize
        await user.update({
            password_hash: passwordHash,
            otp: null,
            otp_expires_at: null,
            updated_at: new Date()
        });

        // Send email with username and password
        const transporter = createOTPTransporter();
        if (transporter) {
            try {
                // Get user's first name for personalization (already loaded)
                const firstName = user.first_name || 'User';

                await transporter.sendMail({
                    from: process.env.OTP_EMAIL_FROM || process.env.SMTP_USER || 'noreply@leadstitch.com',
                    to: user.email,
                    subject: 'Password Reset Successful - Lead Stitch',
                    html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">Lead Stitch</h1>
              </div>
              <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
                <h2 style="color: #1f2937; margin-top: 0;">Password Reset Successful</h2>
                <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                  Hello ${firstName},
                </p>
                <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                  Your password has been successfully reset. Please find your login credentials below:
                </p>
                <div style="background: white; border: 2px solid #2563eb; border-radius: 8px; padding: 20px; margin: 30px 0;">
                  <div style="margin-bottom: 15px;">
                    <strong style="color: #1f2937; display: block; margin-bottom: 5px;">Username (Email):</strong>
                    <span style="color: #2563eb; font-size: 16px; font-weight: 600;">${user.email}</span>
                  </div>
                  <div>
                    <strong style="color: #1f2937; display: block; margin-bottom: 5px;">Password:</strong>
                    <span style="color: #2563eb; font-size: 16px; font-weight: 600; font-family: 'Courier New', monospace;">${newPassword}</span>
                  </div>
                </div>
                <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                  You can now login to your account using these credentials. For security reasons, please change your password after logging in.
                </p>
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 10px;">Login to Your Account</a>
                </div>
                <p style="color: #6b7280; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                  <strong>Security Notice:</strong> If you did not request this password reset, please contact our support team immediately.
                </p>
                <p style="color: #6b7280; font-size: 12px; margin-top: 10px;">
                  This is an automated message. Please do not reply to this email.
                </p>
              </div>
            </div>
          `,
                    text: `
            Password Reset Successful - Lead Stitch
            
            Hello ${firstName},
            
            Your password has been successfully reset. Please find your login credentials below:
            
            Username (Email): ${user.email}
            Password: ${newPassword}
            
            You can now login to your account using these credentials. For security reasons, please change your password after logging in.
            
            Login URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/login
            
            Security Notice: If you did not request this password reset, please contact our support team immediately.
            
            This is an automated message. Please do not reply to this email.
          `,
                });

                console.log(`✅ Password reset confirmation email sent to ${user.email}`);
            } catch (emailError) {
                console.error('Error sending password reset confirmation email:', emailError);
                // Don't fail the request if email fails, password is already reset
            }
        } else {
            console.warn('⚠️ Could not send password reset confirmation email: SMTP not configured');
        }

        res.json({
            message: 'Password reset successfully. You can now login with your new password. A confirmation email has been sent to your email address.',
            success: true
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Update Password (for authenticated users)
exports.updatePassword = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { currentPassword, newPassword } = req.body;

        // Validate input
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ 
                message: 'Current password and new password are required' 
            });
        }

        // Validate password strength (minimum 6 characters)
        if (newPassword.length < 6) {
            return res.status(400).json({ 
                message: 'Password must be at least 6 characters long' 
            });
        }

        // Find user using Sequelize
        const user = await Users.findOne({
            where: { id: userId },
            attributes: ['id', 'email', 'password_hash', 'first_name']
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify current password
        const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ 
                message: 'Current password is incorrect' 
            });
        }

        // Check if new password is different from current password
        const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
        if (isSamePassword) {
            return res.status(400).json({ 
                message: 'New password must be different from current password' 
            });
        }

        // Hash new password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(newPassword, saltRounds);

        // Update password using Sequelize
        await user.update({
            password_hash: passwordHash,
            updated_at: new Date()
        });

        // Send email notification
        const transporter = createOTPTransporter();
        if (transporter) {
            try {
                const firstName = user.first_name || 'User';

                await transporter.sendMail({
                    from: process.env.OTP_EMAIL_FROM || process.env.SMTP_USER || 'noreply@leadstitch.com',
                    to: user.email,
                    subject: 'Password Updated - Lead Stitch',
                    html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">Lead Stitch</h1>
              </div>
              <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb;">
                <h2 style="color: #1f2937; margin-top: 0;">Password Updated Successfully</h2>
                <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                  Hello ${firstName},
                </p>
                <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                  Your password has been successfully updated. Please find your new password below:
                </p>
                <div style="background: white; border: 2px solid #2563eb; border-radius: 8px; padding: 20px; margin: 30px 0;">
                  <div style="margin-bottom: 15px;">
                    <strong style="color: #1f2937; display: block; margin-bottom: 5px;">Email:</strong>
                    <span style="color: #2563eb; font-size: 16px; font-weight: 600;">${user.email}</span>
                  </div>
                  <div>
                    <strong style="color: #1f2937; display: block; margin-bottom: 5px;">New Password:</strong>
                    <span style="color: #2563eb; font-size: 16px; font-weight: 600; font-family: 'Courier New', monospace;">${newPassword}</span>
                  </div>
                </div>
                <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                  You can now login to your account using your new password.
                </p>
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 10px;">Login to Your Account</a>
                </div>
                <p style="color: #6b7280; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                  <strong>Security Notice:</strong> If you did not update your password, please contact our support team immediately.
                </p>
                <p style="color: #6b7280; font-size: 12px; margin-top: 10px;">
                  This is an automated message. Please do not reply to this email.
                </p>
              </div>
            </div>
          `,
                    text: `
            Password Updated - Lead Stitch
            
            Hello ${firstName},
            
            Your password has been successfully updated. Please find your new password below:
            
            Email: ${user.email}
            New Password: ${newPassword}
            
            You can now login to your account using your new password.
            
            Login URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/login
            
            Security Notice: If you did not update your password, please contact our support team immediately.
            
            This is an automated message. Please do not reply to this email.
          `,
                });

                console.log(`✅ Password update confirmation email sent to ${user.email}`);
            } catch (emailError) {
                console.error('Error sending password update confirmation email:', emailError);
                // Don't fail the request if email fails, password is already updated
            }
        } else {
            console.warn('⚠️ Could not send password update confirmation email: SMTP not configured');
        }

        res.json({
            message: 'Password updated successfully. A confirmation email has been sent to your email address.',
            success: true
        });
    } catch (error) {
        console.error('Update password error:', error);
        res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Verify Login OTP - Step 2: Verify OTP and return JWT token
exports.verifyLoginOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        // Validate input
        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required' });
        }

        // Validate OTP format (must be 6 digits)
        if (!/^\d{6}$/.test(otp)) {
            return res.status(400).json({ message: 'OTP must be 6 digits' });
        }

        // Find user and check OTP using Sequelize
        const user = await Users.findOne({
            where: { email },
            attributes: ['id', 'email', 'otp', 'otp_expires_at', 'first_name', 'last_name', 'role', 'is_active']
        });

        if (!user) {
            return res.status(404).json({
                message: 'USER_NOT_FOUND',
                error: 'User not found'
            });
        }

        // Check if user is active
        if (!user.is_active) {
            return res.status(403).json({
                message: 'ACCOUNT_SUSPENDED',
                error: 'Your account has been suspended. Please contact support.'
            });
        }

        // Check if OTP exists
        if (!user.otp) {
            return res.status(400).json({
                message: 'INVALID_OTP',
                error: 'No OTP found. Please login again to receive a new OTP.'
            });
        }

        // Check if OTP is expired
        if (new Date() > new Date(user.otp_expires_at)) {
            return res.status(400).json({
                message: 'OTP_EXPIRED',
                error: 'OTP has expired. Please login again to receive a new OTP.'
            });
        }

        // Verify OTP
        if (user.otp !== otp) {
            return res.status(400).json({
                message: 'INVALID_OTP',
                error: 'Invalid OTP. Please check and try again.'
            });
        }

        // OTP is valid - generate JWT token
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is not configured in environment variables');
        }
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        // Clear OTP and update last_login_at
        await user.update({
            otp: null,
            otp_expires_at: null,
            last_login_at: new Date(),
            updated_at: new Date()
        });

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role || 'user',
                is_active: user.is_active !== undefined ? user.is_active : true,
            },
        });
    } catch (error) {
        console.error('Verify login OTP error:', error);
        res.status(500).json({
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get user approval status
exports.getApprovalStatus = async (req, res) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({
                message: 'Authentication required',
                code: 'NOT_AUTHENTICATED'
            });
        }

        const user = await Users.findByPk(userId, {
            attributes: ['id', 'email', 'approval_status', 'rejection_reason']
        });

        if (!user) {
            return res.status(404).json({
                message: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        res.json({
            success: true,
            approvalStatus: user.approval_status,
            rejectionReason: user.approval_status === 'rejected' ? user.rejection_reason : null
        });

    } catch (error) {
        console.error('❌ Get approval status error:', error);
        res.status(500).json({
            message: 'Error checking approval status',
            code: 'STATUS_CHECK_ERROR'
        });
    }
};
