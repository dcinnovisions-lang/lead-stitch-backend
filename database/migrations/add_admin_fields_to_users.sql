-- Migration: Add admin fields to users table
-- Run this migration to add role, is_active, last_login_at, suspended_at fields

-- Add role column (ENUM: 'user', 'admin')
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('user', 'admin');
    END IF;
END $$;

-- Add columns if they don't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'user',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP;

-- Update existing users to have default role
UPDATE users SET role = 'user' WHERE role IS NULL;
UPDATE users SET is_active = true WHERE is_active IS NULL;

-- Create index on role for faster queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Optional: Set first user as admin (uncomment and modify email if needed)
-- UPDATE users SET role = 'admin' WHERE email = 'your-admin-email@example.com' LIMIT 1;

