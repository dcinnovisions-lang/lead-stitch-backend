// server.js (or index.js — wherever you start the app)
require('dotenv').config();
const http = require('http');
const helmet = require('helmet');
const morgan = require('morgan');
// const db = require('./config/database'); // old pg pool
const { PsqlSequelize } = require('./config/model'); // new
const redisClient = require('./config/redis');
const app = require('./app');
const { initializeSocket } = require('./socket/socketServer');

const PORT = process.env.PORT || 5000;
// Use APP_URL from env if provided (production), otherwise default to localhost
const APP_URL = `http://localhost:${PORT}` || process.env.APP_URL;

app.use(helmet());
app.use(morgan('dev'));

// Test route unchanged
app.get('/api/test', (req, res) => {
    res.json({
        message: 'Backend is running!',
        timestamp: new Date().toISOString(),
        database: 'Connected',
        redis: 'Connected'
    });
});

// Health-check: use sequelize.query or sequelize.authenticate
app.get('/api/health', async (req, res) => {
    const healthStatus = {
        status: 'healthy',
        database: 'unknown',
        redis: 'unknown',
        timestamp: new Date().toISOString()
    };
    let hasErrors = false;

    // Check database connection
    try {
        await PsqlSequelize.authenticate();
        healthStatus.database = 'connected';
    } catch (error) {
        healthStatus.database = 'disconnected';
        healthStatus.databaseError = error.message;
        hasErrors = true;
        console.error('❌ Database connection error:', error.message || error);
    }

    // Check Redis connection
    try {
        // Check if Redis client is open before pinging
        if (!redisClient.isOpen) {
            throw new Error('Redis client is not connected');
        }
        await redisClient.ping();
        healthStatus.redis = 'connected';
    } catch (error) {
        healthStatus.redis = 'disconnected';
        healthStatus.redisError = error.message;
        hasErrors = true;

        // Determine error type for better logging
        const isConnectionRefused = error.message && (
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('not connected') ||
            error.code === 'ECONNREFUSED'
        );

        if (isConnectionRefused) {
            console.error('❌ Redis connection error: Connection refused');
            console.error('   Make sure Redis is running on your system');
            console.error(`   Expected at: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);
        } else {
            console.error('❌ Redis connection error:', error.message || error);
        }
    }

    // Return appropriate status code
    if (hasErrors) {
        healthStatus.status = 'unhealthy';
        return res.status(500).json(healthStatus);
    }

    res.json(healthStatus);
});

// Create HTTP server (required for Socket.io)
const server = http.createServer(app);

// Initialize Socket.io
initializeSocket(server);

// ... error handlers, 404, and start server
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 API URL: ${APP_URL}/api`);
});
