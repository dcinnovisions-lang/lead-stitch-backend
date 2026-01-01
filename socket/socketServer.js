const { Server } = require('socket.io');
const { authenticateSocket } = require('../middleware/socketAuth');

let io = null;

/**
 * Initialize Socket.io server
 * @param {http.Server} server - HTTP server instance
 * @returns {Server} Socket.io server instance
 */
function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling'], // Fallback to polling
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Authentication middleware
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.userId} (socket: ${socket.id})`);

    // Join campaign room for specific campaign updates
    socket.on('join-campaign', (campaignId) => {
      if (!campaignId) {
        socket.emit('error', { message: 'Campaign ID is required' });
        return;
      }
      
      socket.join(`campaign:${campaignId}`);
      console.log(`📊 User ${socket.userId} joined campaign room: ${campaignId}`);
      
      // Confirm join
      socket.emit('campaign-joined', { campaignId });
    });

    // Leave campaign room
    socket.on('leave-campaign', (campaignId) => {
      if (campaignId) {
        socket.leave(`campaign:${campaignId}`);
        console.log(`📊 User ${socket.userId} left campaign room: ${campaignId}`);
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`❌ Client disconnected: ${socket.userId} (reason: ${reason})`);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`❌ Socket error for user ${socket.userId}:`, error);
    });
  });

  console.log('📡 Socket.io server initialized');
  return io;
}

/**
 * Get Socket.io instance
 * @returns {Server} Socket.io server instance
 */
function getIO() {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initializeSocket first.');
  }
  return io;
}

/**
 * Emit campaign progress update to all clients in campaign room
 * @param {string} campaignId - Campaign ID
 * @param {Object} data - Progress data
 */
function emitCampaignProgress(campaignId, data) {
  if (io) {
    io.to(`campaign:${campaignId}`).emit('campaign-progress', {
      ...data,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Emit campaign stats update to all clients in campaign room
 * @param {string} campaignId - Campaign ID
 * @param {Object} stats - Campaign statistics
 */
function emitCampaignStats(campaignId, stats) {
  if (io) {
    io.to(`campaign:${campaignId}`).emit('campaign-stats', {
      ...stats,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Emit recipient status update
 * @param {string} campaignId - Campaign ID
 * @param {string} recipientId - Recipient ID
 * @param {string} status - Recipient status
 * @param {Object} additionalData - Additional data to include
 */
function emitRecipientUpdate(campaignId, recipientId, status, additionalData = {}) {
  if (io) {
    io.to(`campaign:${campaignId}`).emit('recipient-update', {
      recipientId,
      status,
      ...additionalData,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Emit campaign status change
 * @param {string} campaignId - Campaign ID
 * @param {string} status - New campaign status
 */
function emitCampaignStatusChange(campaignId, status) {
  if (io) {
    io.to(`campaign:${campaignId}`).emit('campaign-status-change', {
      campaignId,
      status,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = {
  initializeSocket,
  getIO,
  emitCampaignProgress,
  emitCampaignStats,
  emitRecipientUpdate,
  emitCampaignStatusChange
};
















