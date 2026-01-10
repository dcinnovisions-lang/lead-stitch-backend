-- Migration: Add campaign_id column to email_tracking_pixels table
-- Date: 2026-01-04
-- Description: Adds campaign_id column to track which campaign a tracking pixel belongs to

-- Add campaign_id column (nullable to allow existing records)
ALTER TABLE email_tracking_pixels 
ADD COLUMN IF NOT EXISTS campaign_id UUID;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_email_tracking_pixels_campaign_id 
ON email_tracking_pixels(campaign_id);

-- Update existing records to populate campaign_id from campaign_recipients
UPDATE email_tracking_pixels etp
SET campaign_id = cr.campaign_id
FROM campaign_recipients cr
WHERE etp.recipient_id = cr.id
  AND etp.campaign_id IS NULL;

-- Add foreign key constraint (optional, can be commented out if there are issues)
-- ALTER TABLE email_tracking_pixels
-- ADD CONSTRAINT fk_email_tracking_pixels_campaign_id
-- FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE SET NULL;

