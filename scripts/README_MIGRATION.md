# System Settings Migration Script

## ✅ How to Run

### From Project Root:
```bash
node backend/scripts/runSystemSettingsMigration.js
```

### From Backend Directory:
```bash
cd backend
node scripts/runSystemSettingsMigration.js
```

### From Backend Directory (PowerShell):
```powershell
cd D:\Lead_Stitch\backend
node scripts/runSystemSettingsMigration.js
```

---

## ✅ What It Does

1. ✅ Creates `system_settings` table
2. ✅ Creates index on `key` column
3. ✅ Inserts default `records_per_role = 2` setting

---

## ✅ Success Output

```
================================================================================
🔄 Starting System Settings Migration
================================================================================

📡 Step 1: Testing database connection...
✅ Database connection successful

📋 Step 2: Creating system_settings table...
✅ Table created successfully

📊 Step 3: Creating index on key column...
✅ Index created successfully

💾 Step 4: Inserting default records_per_role setting...
✅ Default setting inserted (or already exists)

✅ Step 5: Verifying migration...
✅ Migration completed successfully!
================================================================================
```

---

## ✅ Verification

After running, verify the table was created:

```sql
SELECT * FROM system_settings WHERE key = 'records_per_role';
```

Expected result:
- Key: `records_per_role`
- Value: `2`
- Description: `Number of LinkedIn profiles to scrape per decision maker role`

---

## 🔧 Troubleshooting

**Error: "Cannot find module"**
- Make sure you're in the correct directory
- Use `node scripts/runSystemSettingsMigration.js` from `backend/` directory
- Or `node backend/scripts/runSystemSettingsMigration.js` from project root

**Error: "Database connection failed"**
- Check your `.env` file has correct database credentials
- Ensure PostgreSQL is running

**Error: "Setting already exists"**
- This is normal if you've run the migration before
- The script handles this gracefully

