-- ============================================
-- Database Indexes
-- ============================================
-- This file contains all indexes for the Lead Stitch database
-- Run this file manually after creating tables to improve query performance
-- 
-- Usage: psql -U postgres -d lead_stitch -f indexes.sql
-- OR run in your database client (pgAdmin, DBeaver, etc.)
-- ============================================

-- ============================================
-- Users Table Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================
-- Business Requirements Table Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_business_requirements_user_id ON business_requirements(user_id);
CREATE INDEX IF NOT EXISTS idx_business_requirements_status ON business_requirements(status);

-- ============================================
-- Decision Maker Roles Table Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_decision_maker_roles_industry_relevance 
ON decision_maker_roles(industry_relevance);

CREATE INDEX IF NOT EXISTS idx_decision_maker_roles_confidence 
ON decision_maker_roles(confidence DESC);

CREATE INDEX IF NOT EXISTS idx_decision_maker_roles_api_source 
ON decision_maker_roles(api_source);

CREATE INDEX IF NOT EXISTS idx_decision_maker_roles_raw_response 
ON decision_maker_roles USING GIN (raw_api_response);

-- ============================================
-- LinkedIn Profiles Table Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_linkedin_profiles_business_requirement_id 
ON linkedin_profiles(business_requirement_id);

CREATE INDEX IF NOT EXISTS idx_linkedin_profiles_profile_url 
ON linkedin_profiles(profile_url);

-- ============================================
-- LinkedIn Credentials Table Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_linkedin_credentials_user_id 
ON linkedin_credentials(user_id);

CREATE INDEX IF NOT EXISTS idx_linkedin_credentials_is_active 
ON linkedin_credentials(is_active);

-- ============================================
-- Email Addresses Table Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_email_addresses_linkedin_profile_id 
ON email_addresses(linkedin_profile_id);

-- ============================================
-- Campaigns Table Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);

-- ============================================
-- Email SMTP Credentials Table Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_email_smtp_user_id 
ON email_smtp_credentials(user_id);

CREATE INDEX IF NOT EXISTS idx_email_smtp_active 
ON email_smtp_credentials(user_id, is_active);

-- ============================================
-- Email Templates Table Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_email_templates_user_id 
ON email_templates(user_id);

-- ============================================
-- Email Campaigns Table Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_email_campaigns_user_id 
ON email_campaigns(user_id);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_status 
ON email_campaigns(status);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled 
ON email_campaigns(scheduled_at) WHERE status = 'scheduled';

-- ============================================
-- Campaign Recipients Table Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_id 
ON campaign_recipients(campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_lead_id 
ON campaign_recipients(lead_id);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status 
ON campaign_recipients(status);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_email 
ON campaign_recipients(email);

-- ============================================
-- Email Tracking Events Table Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_email_tracking_events_campaign_recipient_id 
ON email_tracking_events(campaign_recipient_id);

CREATE INDEX IF NOT EXISTS idx_email_tracking_events_campaign_id 
ON email_tracking_events(campaign_id);

CREATE INDEX IF NOT EXISTS idx_email_tracking_events_recipient_id 
ON email_tracking_events(recipient_id);

CREATE INDEX IF NOT EXISTS idx_email_tracking_events_event_type 
ON email_tracking_events(event_type);

CREATE INDEX IF NOT EXISTS idx_email_tracking_events_created 
ON email_tracking_events(created_at);

-- ============================================
-- Email Tracking Pixels Table Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_email_tracking_pixels_recipient_id 
ON email_tracking_pixels(recipient_id);

CREATE INDEX IF NOT EXISTS idx_email_tracking_pixels_campaign_id 
ON email_tracking_pixels(campaign_id);

CREATE INDEX IF NOT EXISTS idx_email_tracking_pixels_url 
ON email_tracking_pixels(pixel_url);

-- ============================================
-- Email Link Tracking Table Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_email_link_tracking_recipient_id 
ON email_link_tracking(recipient_id);

CREATE INDEX IF NOT EXISTS idx_email_link_tracking_url 
ON email_link_tracking(tracked_url);

-- ============================================
-- Email Bounces Table Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_email_bounces_email 
ON email_bounces(email);

CREATE INDEX IF NOT EXISTS idx_email_bounces_recipient_id 
ON email_bounces(recipient_id);

-- ============================================
-- Email Replies Table Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_email_replies_campaign_id 
ON email_replies(campaign_id);

CREATE INDEX IF NOT EXISTS idx_email_replies_recipient_id 
ON email_replies(recipient_id);

-- ============================================
-- Email Unsubscribes Table Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_email 
ON email_unsubscribes(email);

CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_user_id 
ON email_unsubscribes(user_id);

-- ============================================
-- End of Indexes
-- ============================================
-- Total: 35 indexes created
-- ============================================

