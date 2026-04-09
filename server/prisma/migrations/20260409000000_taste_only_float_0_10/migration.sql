-- Migration: taste-only rating on a 0–10 Float scale
-- Remove texture and value columns, widen taste and score to DOUBLE PRECISION

ALTER TABLE "Rating"
  DROP COLUMN IF EXISTS "texture",
  DROP COLUMN IF EXISTS "value";

ALTER TABLE "Rating"
  ALTER COLUMN "taste" SET NOT NULL,
  ALTER COLUMN "taste" TYPE DOUBLE PRECISION USING "taste"::DOUBLE PRECISION,
  ALTER COLUMN "score" TYPE DOUBLE PRECISION USING "score"::DOUBLE PRECISION;

-- Back-fill: sync score to taste for any existing rows
UPDATE "Rating" SET "score" = "taste" WHERE "score" IS NOT NULL;
