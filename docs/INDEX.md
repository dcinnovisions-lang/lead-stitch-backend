# 📚 Documentation Index

Complete documentation for Lead Stitch backend. All documentation has been consolidated and organized by topic.

---

## 🚀 Quick Links

### Apollo Integration (API & LinkedIn Scraping)
- **[APOLLO_INTEGRATION.md](./APOLLO_INTEGRATION.md)** - Complete Apollo API integration guide
  - Two-stage enrichment process
  - Location filtering
  - API reference & examples
  - Troubleshooting (consolidated from 2 docs)

### Backend & Infrastructure
- **[BACKEND_OPTIMIZATION.md](./BACKEND_OPTIMIZATION.md)** - Startup optimization & performance improvements
  - Removed duplicate logging
  - Lazy initialization of email services
  - Performance metrics

### Database & Migrations
- **[DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md)** - Database schema & migration guide
  - Table structure
  - Indexes
  - Running migrations

### Feature Documentation
- **[GEMINI_USAGE_TRACKING.md](./GEMINI_USAGE_TRACKING.md)** - Gemini API usage tracking
  - Token counting
  - Cost estimation
  - Billing configuration

- **[USAGE_TRACKING_TROUBLESHOOTING.md](./USAGE_TRACKING_TROUBLESHOOTING.md)** - Billing & usage issues
  - Enable billing
  - Quota limits
  - Monitoring

---

## 📂 File Organization

All markdown files are now in a single `docs/` folder for better organization:

```
docs/
├── INDEX.md                          ← You are here
├── APOLLO_INTEGRATION.md            ← Apollo API (consolidated)
├── BACKEND_OPTIMIZATION.md          ← Performance improvements
├── DATABASE_MIGRATIONS.md           ← Database guide
├── GEMINI_USAGE_TRACKING.md         ← Gemini API tracking
└── USAGE_TRACKING_TROUBLESHOOTING.md ← Billing issues
```

---

## 🔧 Configuration

### Environment Variables
See `.env.example` for all required environment variables:
- Apollo API Key (`APOLLO_API_KEY`)
- Database credentials (`DB_*`)
- Redis configuration (`REDIS_*`)
- Email settings (`OTP_SMTP_*`)
- Gemini API (`GEMINI_API_KEY`)

### Admin Settings
Configured via UI in Admin Panel:
- `records_per_role` - Profiles per role (default: 25, max: 100)
- `gemini_model` - Gemini model version
- `enable_billing` - Enable Gemini billing tracking

---

## 📖 Getting Started

### 1. Setup
```bash
# Install dependencies
npm install

# Configure environment
cp env.example .env
# Edit .env with your credentials

# Initialize database
node CREATE_DATABASE.js

# Start server
npm start
```

### 2. Running Apollo Scraping
1. Create a Business Requirement (UI)
2. Upload decision maker requirements
3. Gemini generates decision maker roles
4. Apollo searches for profiles
5. Results saved to database with emails

### 3. Monitoring
- Check health: `GET /api/health`
- Track usage: `GET /api/gemini-usage/summary`
- View profiles: `GET /api/profiles`

---

## 🐛 Troubleshooting

### Apollo Integration Issues
See [APOLLO_INTEGRATION.md](./APOLLO_INTEGRATION.md#troubleshooting)
- Same person returned for all roles
- No emails being returned
- Location filter removing all results
- JSON parsing errors

### Database Issues
See [DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md)
- Connection errors
- Migration failures
- Index creation

### Gemini/Billing Issues
See [USAGE_TRACKING_TROUBLESHOOTING.md](./USAGE_TRACKING_TROUBLESHOOTING.md)
- Enable billing for monitoring
- Quota exceeded
- Token counting issues

---

## 📊 Architecture

### Two-Stage Apollo Integration
```
User Input (Role + Location)
    ↓
Gemini: Generate decision maker roles
    ↓
Apollo Search: Find candidates by role (FREE)
    ↓
Apollo Enrich: Get emails by ID (1 credit/person)
    ↓
Location Filter: Validate results by location
    ↓
Save to Database: LinkedInProfiles + EmailAddresses
    ↓
Display in UI: Name, Email, Title, Company, Location
```

### Core Services
- **Apollo Integration** - Search & enrichment
- **LinkedIn Scraping Job** - Job processor
- **Gemini Service** - Decision maker generation
- **Email Service** - Campaign emails
- **Notification Service** - Ticket & scraping alerts

---

## 🚀 Latest Changes

**January 1, 2026:**
- ✅ Consolidated Apollo docs (removed duplicate APOLLO_TROUBLESHOOTING.md & APOLLO_API_FIX.md)
- ✅ Removed Sentry error tracking
- ✅ Fixed aggressive location filtering (was removing all results)
- ✅ Removed duplicate initialization logs
- ✅ Implemented lazy email service initialization
- ✅ Reorganized all markdown files into `docs/` folder

---

## 📞 Support

For issues or questions:
1. Check the relevant documentation file
2. Review troubleshooting sections
3. Check Apollo API response logs
4. Verify environment configuration

---

**Last Updated:** January 1, 2026  
**Status:** ✅ Production Ready
