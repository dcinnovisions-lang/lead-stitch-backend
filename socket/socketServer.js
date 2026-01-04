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
        pingInterval: 25000,
        allowEIO3: true // Support older Socket.io clients
    });

    // Authentication middleware
    io.use(authenticateSocket);

    // Track connected clients
    let connectedClients = 0;

    io.on('connection', (socket) => {
        connectedClients++;
        console.log(`✅ Client connected: ${socket.userId} (socket: ${socket.id})`);
        console.log(`📊 Total connected clients: ${connectedClients}`);

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
            connectedClients--;
            console.log(`❌ Client disconnected: ${socket.userId} (reason: ${reason})`);
            console.log(`📊 Total connected clients: ${connectedClients}`);
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
        const payload = {
            ...data,
            timestamp: new Date().toISOString()
        };
        console.log(`📊 [REALTIME] Emitting campaign-progress for campaign ${campaignId}:`, {
            status: data.status,
            total: data.total,
            sent: data.sent,
            failed: data.failed,
            progress: data.progress
        });
        io.to(`campaign:${campaignId}`).emit('campaign-progress', payload);
    } else {
        console.warn(`⚠️ [REALTIME] Socket.io not initialized, cannot emit campaign-progress for ${campaignId}`);
    }
}

/**
 * Emit campaign stats update to all clients in campaign room
 * @param {string} campaignId - Campaign ID
 * @param {Object} stats - Campaign statistics
 */
function emitCampaignStats(campaignId, stats) {
    if (io) {
        const payload = {
            ...stats,
            timestamp: new Date().toISOString()
        };
        console.log(`📊 [REALTIME] Emitting campaign-stats for campaign ${campaignId}:`, {
            total: stats.total,
            sent: stats.sent,
            delivered: stats.delivered,
            opened: stats.opened,
            clicked: stats.clicked,
            replied: stats.replied,
            bounced: stats.bounced,
            failed: stats.failed
        });
        io.to(`campaign:${campaignId}`).emit('campaign-stats', payload);
    } else {
        console.warn(`⚠️ [REALTIME] Socket.io not initialized, cannot emit campaign-stats for ${campaignId}`);
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
        const payload = {
            recipientId,
            status,
            ...additionalData,
            timestamp: new Date().toISOString()
        };
        console.log(`📧 [REALTIME] Emitting recipient-update for campaign ${campaignId}:`, {
            recipientId,
            status,
            email: additionalData.email || 'N/A',
            ...(additionalData.error ? { error: additionalData.error.substring(0, 50) } : {}),
            ...(additionalData.link ? { link: additionalData.link.substring(0, 50) } : {})
        });
        io.to(`campaign:${campaignId}`).emit('recipient-update', payload);
    } else {
        console.warn(`⚠️ [REALTIME] Socket.io not initialized, cannot emit recipient-update for campaign ${campaignId}, recipient ${recipientId}`);
    }
}

/**
 * Emit campaign status change
 * @param {string} campaignId - Campaign ID
 * @param {string} status - New campaign status
 */
function emitCampaignStatusChange(campaignId, status) {
    if (io) {
        const payload = {
            campaignId,
            status,
            timestamp: new Date().toISOString()
        };
        console.log(`🔄 [REALTIME] Emitting campaign-status-change for campaign ${campaignId}:`, { status });
        io.to(`campaign:${campaignId}`).emit('campaign-status-change', payload);
    } else {
        console.warn(`⚠️ [REALTIME] Socket.io not initialized, cannot emit campaign-status-change for ${campaignId}`);
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
















