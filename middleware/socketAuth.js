const jwt = require('jsonwebtoken');

/**
 * Socket.io Authentication Middleware
 * Authenticates WebSocket connections using JWT token
 */
function authenticateSocket(socket, next) {
  try {
    // Get token from handshake auth or query
    const token = socket.handshake.auth?.token || 
                  socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.user = decoded;
    
    next();
  } catch (error) {
    console.error('Socket authentication error:', error.message);
    next(new Error('Authentication error: Invalid token'));
  }
}

module.exports = { authenticateSocket };
















