-- Migration: Add industry column to decision_maker_roles table
-- This allows each decision maker to have an associated industry for more targeted LinkedIn searches

-- Add industry column to decision_maker_roles table
ALTER TABLE decision_maker_roles
ADD COLUMN IF NOT EXISTS industry VARCHAR(255);

-- Add comment to explain the column
COMMENT ON COLUMN decision_maker_roles.industry IS 'Industry associated with this decision maker role (e.g., Software, Healthcare, Finance). Used for targeted LinkedIn searches combining role + industry + location.';

-- Create index on industry for faster filtering
CREATE INDEX IF NOT EXISTS idx_decision_maker_roles_industry ON decision_maker_roles(industry);

-- Update existing records to use the business requirement's industry if available
-- This ensures backward compatibility with existing data
UPDATE decision_maker_roles dm
SET industry = br.industry
FROM business_requirements br
WHERE dm.business_requirement_id = br.id
  AND dm.industry IS NULL
  AND br.industry IS NOT NULL;
