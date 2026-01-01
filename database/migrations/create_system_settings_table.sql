-- Migration: Create system_settings table
-- Description: Stores system-wide configuration settings (e.g., records_per_role for LinkedIn scraping)
-- Date: 2025-12-13

-- Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_by UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Create index on key for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);

-- Insert default records_per_role setting if it doesn't exist
INSERT INTO system_settings (key, value, description)
VALUES ('records_per_role', '2', 'Number of LinkedIn profiles to scrape per decision maker role')
ON CONFLICT (key) DO NOTHING;

-- Add comment to table
COMMENT ON TABLE system_settings IS 'Stores system-wide configuration settings';
COMMENT ON COLUMN system_settings.key IS 'Unique setting key (e.g., records_per_role)';
COMMENT ON COLUMN system_settings.value IS 'Setting value (stored as text, can be parsed as needed)';
COMMENT ON COLUMN system_settings.description IS 'Human-readable description of the setting';
COMMENT ON COLUMN system_settings.updated_by IS 'User ID who last updated this setting';

