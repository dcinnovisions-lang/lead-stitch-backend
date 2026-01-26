-- Migration: add_suggestion_id_to_decision_maker_roles.sql
-- Adds suggestion_id column to decision_maker_roles table

ALTER TABLE decision_maker_roles
ADD COLUMN suggestion_id UUID REFERENCES suggestions(id) ON DELETE CASCADE;
