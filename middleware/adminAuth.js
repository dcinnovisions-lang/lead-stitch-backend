const { Users } = require('../config/model');

/**
 * Admin Authentication Middleware
 * Checks if user is authenticated AND has admin role
 */
exports.requireAdmin = async (req, res, next) => {
  try {
    // First check if user is authenticated (should be set by authenticateToken)
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Get user from database to check role
    const user = await Users.findByPk(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({ message: 'Account is suspended' });
    }

    // Check if user is admin
    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    // Attach user object to request for use in controllers
    req.adminUser = user;
    next();
  } catch (error) {
    console.error('Admin auth middleware error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

