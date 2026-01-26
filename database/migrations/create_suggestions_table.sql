-- Migration: create_suggestions_table.sql
-- Creates the suggestions table for associating suggestions with business requirements

CREATE TABLE IF NOT EXISTS suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_requirement_id UUID NOT NULL REFERENCES business_requirements(id) ON DELETE CASCADE,
    suggestion_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
