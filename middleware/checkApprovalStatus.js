/**
 * Middleware to check if user is approved
 * Allows approved users and admins only
 * Rejects pending/rejected users with clear messages
 */

const { Users } = require('../config/model');

exports.checkApprovalStatus = async (req, res, next) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ 
                message: 'Authentication required',
                code: 'NOT_AUTHENTICATED'
            });
        }

        // Get user with approval status
        const user = await Users.findByPk(userId, {
            attributes: ['id', 'email', 'role', 'approval_status', 'rejection_reason']
        });

        if (!user) {
            return res.status(404).json({ 
                message: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        // Admins always have access
        if (user.role === 'admin') {
            return next();
        }

        // Check approval status
        if (user.approval_status === 'pending') {
            return res.status(403).json({
                message: 'Your account is pending admin approval',
                code: 'PENDING_APPROVAL',
                status: 'pending',
                userEmail: user.email
            });
        }

        if (user.approval_status === 'rejected') {
            return res.status(403).json({
                message: 'Your account has been rejected',
                code: 'ACCOUNT_REJECTED',
                status: 'rejected',
                reason: user.rejection_reason,
                contactEmail: process.env.SUPPORT_EMAIL || 'support@leadstitch.com'
            });
        }

        if (user.approval_status === 'approved') {
            return next();
        }

        // Fallback (should not reach here)
        return res.status(403).json({
            message: 'Invalid approval status',
            code: 'INVALID_STATUS'
        });

    } catch (error) {
        console.error('❌ Approval status check error:', error);
        res.status(500).json({
            message: 'Error checking account status',
            code: 'STATUS_CHECK_ERROR'
        });
    }
};

/**
 * Middleware to check if user is admin
 * Used for admin-only endpoints
 */
exports.checkApprovalStatusAdmin = async (req, res, next) => {
    try {
        console.log('[checkApprovalStatusAdmin] Called');
        const userId = req.user?.userId;
        if (!userId) {
            console.warn('[checkApprovalStatusAdmin] No userId in token');
            // If this is the stats endpoint, always return a valid stats object
            if (req.originalUrl && req.originalUrl.includes('/user-approval/stats')) {
                return res.status(401).json({
                    message: 'Authentication required',
                    code: 'NOT_AUTHENTICATED',
                    data: { pending: 0, approved: 0, rejected: 0, total: 0 }
                });
            }
            return res.status(401).json({ 
                message: 'Authentication required',
                code: 'NOT_AUTHENTICATED'
            });
        }
        console.log('[checkApprovalStatusAdmin] userId:', userId);
        const user = await Users.findByPk(userId, {
            attributes: ['id', 'role']
        });
        if (!user) {
            console.warn('[checkApprovalStatusAdmin] User not found:', userId);
            if (req.originalUrl && req.originalUrl.includes('/user-approval/stats')) {
                return res.status(403).json({
                    message: 'Admin access required',
                    code: 'ADMIN_ONLY',
                    data: { pending: 0, approved: 0, rejected: 0, total: 0 }
                });
            }
            return res.status(403).json({
                message: 'Admin access required',
                code: 'ADMIN_ONLY'
            });
        }
        console.log('[checkApprovalStatusAdmin] user.role:', user.role);
        if (user.role !== 'admin') {
            console.warn('[checkApprovalStatusAdmin] User is not admin:', userId);
            if (req.originalUrl && req.originalUrl.includes('/user-approval/stats')) {
                return res.status(403).json({
                    message: 'Admin access required',
                    code: 'ADMIN_ONLY',
                    data: { pending: 0, approved: 0, rejected: 0, total: 0 }
                });
            }
            return res.status(403).json({
                message: 'Admin access required',
                code: 'ADMIN_ONLY'
            });
        }
        console.log('[checkApprovalStatusAdmin] User is admin, proceeding');
        next();
    } catch (error) {
        console.error('❌ Admin check error:', error);
        if (req.originalUrl && req.originalUrl.includes('/user-approval/stats')) {
            return res.status(500).json({
                message: 'Error checking admin status',
                code: 'ADMIN_CHECK_ERROR',
                data: { pending: 0, approved: 0, rejected: 0, total: 0 }
            });
        }
        res.status(500).json({
            message: 'Error checking admin status',
            code: 'ADMIN_CHECK_ERROR'
        });
    }
};
