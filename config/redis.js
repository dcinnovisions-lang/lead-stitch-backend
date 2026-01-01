const redis = require('redis');

const redisClient = redis.createClient({
    socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        reconnectStrategy: (retries) => {
            if (retries > 10) {
                console.error('❌ Redis: Max reconnection attempts reached. Giving up.');
                return new Error('Max reconnection attempts reached');
            }
            const delay = Math.min(retries * 50, 2000);
            return delay;
        },
        connectTimeout: 10000, // 10 seconds
    },
});

// Handle Redis connection errors
redisClient.on('error', (err) => {
    console.error('❌ Redis Client Error:', err.message || err);
    if (err.code === 'ECONNREFUSED') {
        console.error('   Redis connection refused. Make sure Redis is running on your system.');
        console.error(`   Expected at: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);
    } else if (err.code === 'ETIMEDOUT') {
        console.error('   Redis connection timeout. Check network connectivity.');
    }
});

// Handle Redis reconnection events
redisClient.on('reconnecting', () => {
    console.log('🔄 Redis: Attempting to reconnect...');
});

redisClient.on('ready', () => {
    console.log('✅ Redis connected successfully');
    console.log(`   Host: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);
});

// Connect to Redis
redisClient.connect()
    .then(() => {
        // Connection successful - handled by 'ready' event
    })
    .catch((err) => {
        console.error('❌ Redis connection error:', err.message || err);
        console.error('   Make sure Redis is running on your system');
        console.error(`   Expected at: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);
    });

// Graceful shutdown
process.on('SIGINT', async () => {
    try {
        if (redisClient.isOpen) {
            await redisClient.quit();
        }
    } catch (err) {
        console.error('Error closing Redis connection:', err);
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    try {
        if (redisClient.isOpen) {
            await redisClient.quit();
        }
    } catch (err) {
        console.error('Error closing Redis connection:', err);
    }
    process.exit(0);
});

module.exports = redisClient;

