# Lead Stitch Backend API

Backend API for Lead Stitch - B2B Lead Generation & Email Marketing Platform

## Setup Instructions

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment Variables:**
   - Copy `.env.example` to `.env`
   - Update all the values in `.env` with your actual credentials

3. **Start Development Server:**
   ```bash
   npm run dev
   ```

4. **Start Production Server:**
   ```bash
   npm start
   ```

## API Endpoints

### Health Check
- `GET /api/health` - Check server, database, and Redis status
- `GET /api/test` - Simple test endpoint

## Project Structure

```
backend/
├── config/          # Configuration files (database, redis)
├── controllers/     # Route controllers
├── middleware/      # Custom middleware
├── models/          # Database models
├── routes/          # API routes
├── services/        # Business logic services
├── utils/           # Utility functions
├── jobs/            # Background job processors
├── server.js        # Main server file
└── package.json     # Dependencies
```

