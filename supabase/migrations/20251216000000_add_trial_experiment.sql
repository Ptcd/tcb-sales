-- Add experiment fields to trial_pipeline
ALTER TABLE trial_pipeline 
ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS followup_variant TEXT CHECK (followup_variant IN ('A', 'B'));

-- Index for experiment queries
CREATE INDEX IF NOT EXISTS idx_tp_experiment 
ON trial_pipeline(followup_variant, activated_at, trial_started_at);

-- Backfill activated_at for existing records
UPDATE trial_pipeline
SET activated_at = LEAST(
  COALESCE(calculator_modified_at, embed_snippet_copied_at),
  COALESCE(embed_snippet_copied_at, calculator_modified_at)
)
WHERE first_login_at IS NOT NULL
  AND (calculator_modified_at IS NOT NULL OR embed_snippet_copied_at IS NOT NULL)
  AND activated_at IS NULL;

COMMENT ON COLUMN trial_pipeline.followup_variant IS 'A = product-only nudge, B = product + SDR follow-up task';
COMMENT ON COLUMN trial_pipeline.activated_at IS 'When activation condition met (login + action)';


