const express = require('express');
const cors = require('cors');
const app = express();

const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        } else {
            return callback(new Error('Not allowed by CORS: ' + origin));
        }
    },
    credentials: true
}));

app.options('*', cors());

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/business-requirements', require('./routes/businessRequirements'));
app.use('/api/decision-makers', require('./routes/decisionMakers'));
app.use('/api/profiles', require('./routes/profiles'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/integrations', require('./routes/integrations'));
app.use('/api/email', require('./routes/email'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/webhooks', require('./routes/webhooks')); // AWS SES webhooks
app.use('/api/admin', require('./routes/admin')); // Admin routes
app.use('/api/user-approval', require('./routes/userApproval')); // User approval routes
app.use('/api/tickets', require('./routes/tickets')); // Ticket system routes
app.use('/api/gemini-usage', require('./routes/geminiUsage')); // Gemini API usage tracking routes

module.exports = app;