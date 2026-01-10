/**
 * User Approval Controller
 * Handles admin approval/rejection of new users
 */

const { Users, PsqlSequelize } = require('../config/model');
const { Op } = require('sequelize');

// Get all pending users
exports.getPendingUsers = async (req, res) => {
    try {
        const { page = 1, limit = 20, status = 'pending' } = req.query;

        const offset = (page - 1) * limit;

        // Build where clause based on status filter
        const whereClause = {};
        if (status === 'pending') {
            whereClause.approval_status = 'pending';
        } else if (status === 'approved') {
            whereClause.approval_status = 'approved';
        } else if (status === 'rejected') {
            whereClause.approval_status = 'rejected';
        } else if (status === 'all') {
            whereClause.approval_status = { [Op.in]: ['pending', 'approved', 'rejected'] };
        }

        const { count, rows } = await Users.findAndCountAll({
            where: whereClause,
            attributes: [
                'id', 'email', 'first_name', 'last_name', 'role',
                'approval_status', 'created_at', 'approved_at', 'rejection_reason', 'approved_by'
            ],
            include: [{
                model: Users,
                as: 'approvedByUser',
                attributes: ['id', 'email', 'first_name', 'last_name'],
                required: false
            }],
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        const totalPages = Math.ceil(count / limit);

        res.json({
            success: true,
            data: rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count,
                pages: totalPages
            }
        });

    } catch (error) {
        console.error('❌ Get pending users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users'
        });
    }
};

// Get single user details
exports.getUserDetails = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await Users.findByPk(userId, {
            attributes: [
                'id', 'email', 'first_name', 'last_name', 'role',
                'approval_status', 'created_at', 'approved_at', 'rejection_reason', 'approved_by'
            ],
            include: [{
                model: Users,
                as: 'approvedByUser',
                attributes: ['id', 'email', 'first_name', 'last_name'],
                required: false
            }]
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: user
        });

    } catch (error) {
        console.error('❌ Get user details error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user details'
        });
    }
};

// Approve user (works for pending, rejected, or re-approval)
exports.approveUser = async (req, res) => {
    const transaction = await PsqlSequelize.transaction();

    try {
        const { userId } = req.params;
        const adminId = req.user.userId;

        const user = await Users.findByPk(userId, { transaction });

        if (!user) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const previousStatus = user.approval_status;

        // Don't allow approving admin accounts
        if (user.role === 'admin' && previousStatus === 'approved') {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Cannot modify admin account approval status'
            });
        }

        // Update user approval (clear rejection reason on approval)
        await user.update(
            {
                approval_status: 'approved',
                approved_by: adminId,
                approved_at: new Date(),
                rejection_reason: null // Clear rejection reason on approval
            },
            { transaction }
        );

        await transaction.commit();

        const actionMessage = previousStatus === 'rejected' 
            ? `re-approved (was previously rejected)` 
            : previousStatus === 'approved'
            ? `approval confirmed`
            : `approved`;

        console.log(`✅ User ${user.email} ${actionMessage} by admin ${adminId}`);

        res.json({
            success: true,
            message: `User ${user.email} has been ${actionMessage}`,
            data: {
                id: user.id,
                email: user.email,
                approvalStatus: user.approval_status,
                approvedAt: user.approved_at,
                previousStatus
            }
        });

    } catch (error) {
        await transaction.rollback();
        console.error('❌ Approve user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to approve user'
        });
    }
};

// Reject user (works for pending, approved, or re-rejection)
exports.rejectUser = async (req, res) => {
    const transaction = await PsqlSequelize.transaction();

    try {
        const { userId } = req.params;
        const { reason } = req.body;
        const adminId = req.user.userId;

        if (!reason || reason.trim().length === 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required'
            });
        }

        const user = await Users.findByPk(userId, { transaction });

        if (!user) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const previousStatus = user.approval_status;

        // Don't allow rejecting admin accounts
        if (user.role === 'admin') {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'Cannot reject admin account'
            });
        }

        // Update user rejection
        await user.update(
            {
                approval_status: 'rejected',
                approved_by: adminId,
                rejection_reason: reason,
                approved_at: new Date() // Keep timestamp for audit trail
            },
            { transaction }
        );

        await transaction.commit();

        const actionMessage = previousStatus === 'approved'
            ? `revoked and rejected (was previously approved)`
            : previousStatus === 'rejected'
            ? `re-rejected with updated reason`
            : `rejected`;

        console.log(`❌ User ${user.email} ${actionMessage} by admin ${adminId}. Reason: ${reason}`);

        res.json({
            success: true,
            message: `User ${user.email} has been ${actionMessage}`,
            data: {
                id: user.id,
                email: user.email,
                approvalStatus: user.approval_status,
                rejectionReason: user.rejection_reason,
                previousStatus
            }
        });

    } catch (error) {
        await transaction.rollback();
        console.error('❌ Reject user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject user'
        });
    }
};

// Bulk approval
exports.bulkApproveUsers = async (req, res) => {
    const transaction = await PsqlSequelize.transaction();

    try {
        const { userIds } = req.body;
        const adminId = req.user.userId;

        if (!Array.isArray(userIds) || userIds.length === 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'User IDs array is required'
            });
        }

        // Update all selected users
        const updated = await Users.update(
            {
                approval_status: 'approved',
                approved_by: adminId,
                approved_at: new Date()
            },
            {
                where: { id: { [Op.in]: userIds } },
                transaction
            }
        );

        await transaction.commit();

        console.log(`✅ Bulk approved ${updated[0]} users`);

        res.json({
            success: true,
            message: `${updated[0]} users have been approved`,
            approvedCount: updated[0]
        });

    } catch (error) {
        await transaction.rollback();
        console.error('❌ Bulk approve users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to bulk approve users'
        });
    }
};

// Get approval statistics
exports.getApprovalStats = async (req, res) => {
    try {
        const stats = await Users.findAll({
            attributes: [
                'approval_status',
                [PsqlSequelize.fn('COUNT', PsqlSequelize.col('id')), 'count']
            ],
            group: ['approval_status'],
            raw: true
        });

        const statObj = {
            pending: 0,
            approved: 0,
            rejected: 0,
            total: 0
        };

        stats.forEach(stat => {
            const count = parseInt(stat.count);
            statObj[stat.approval_status] = count;
            statObj.total += count;
        });

        res.json({
            success: true,
            data: statObj
        });

    } catch (error) {
        console.error('❌ Get approval stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch approval statistics'
        });
    }
};
