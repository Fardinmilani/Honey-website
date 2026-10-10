-- Phase 16 dispatch leases preserve committed outbox rows across Redis outages and
-- fence confirmations made by a dispatcher whose lease has expired.
ALTER TABLE "outbox_event"
  ADD COLUMN "event_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "correlation_id" TEXT,
  ADD COLUMN "claim_token" UUID,
  ADD COLUMN "claim_expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "quarantined_at" TIMESTAMPTZ(3);

ALTER TABLE "outbox_event"
  ADD CONSTRAINT "outbox_event_version_positive" CHECK ("event_version" > 0),
  ADD CONSTRAINT "outbox_claim_pair" CHECK (
    ("claim_token" IS NULL) = ("claim_expires_at" IS NULL)
  );

CREATE INDEX "outbox_dispatch_eligible_idx"
  ON "outbox_event" ("next_attempt_at", "occurred_at", "id")
  WHERE "published_at" IS NULL AND "quarantined_at" IS NULL;

-- Keep the existing payload/error columns for rolling compatibility. The Phase 16
-- writer stores only an empty JSON object and a fixed safe error description.
-- A NULL terminal_cycle preserves any legacy duplicate rows; new writes always
-- provide a stable cycle key and are idempotent.
ALTER TABLE "job_failure"
  ADD COLUMN "payload_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "correlation_id" TEXT,
  ADD COLUMN "attempts_made" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "error_code" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
  ADD COLUMN "error_class" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
  ADD COLUMN "terminal_cycle" TEXT,
  ADD COLUMN "last_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "resolved_at" TIMESTAMPTZ(3);

ALTER TABLE "job_failure"
  ALTER COLUMN "payload" SET DEFAULT '{}'::jsonb,
  ALTER COLUMN "error" SET DEFAULT 'Job failure.';

-- Legacy row identity and timestamps remain for rolling compatibility. Every
-- new or updated record is reduced to fixed non-sensitive metadata even if a
-- caller bypasses the Phase 16 repository writer.
CREATE FUNCTION sanitize_job_failure_metadata()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.payload := '{}'::jsonb;
  NEW.error := CASE NEW.error_class
    WHEN 'TRANSIENT' THEN 'Transient job failure became terminal.'
    WHEN 'PERMANENT' THEN 'Permanent job failure.'
    WHEN 'EXHAUSTED' THEN 'Job exhausted its bounded retry attempts.'
    ELSE 'Job failure.'
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "job_failure_safe_metadata"
  BEFORE INSERT OR UPDATE ON "job_failure"
  FOR EACH ROW EXECUTE FUNCTION sanitize_job_failure_metadata();

-- Existing failure rows might predate the worker. Keep their identifiers and
-- timestamps while removing any historical free-form payload or error text.
UPDATE "job_failure"
SET "payload" = '{}'::jsonb,
    "error" = 'Job failure.'
WHERE "payload" <> '{}'::jsonb OR "error" <> 'Job failure.';

ALTER TABLE "job_failure"
  ADD CONSTRAINT "job_failure_attempts_non_negative" CHECK ("attempts_made" >= 0),
  ADD CONSTRAINT "job_failure_payload_version_positive" CHECK ("payload_version" > 0),
  ADD CONSTRAINT "job_failure_error_class_known" CHECK (
    "error_class" IN ('UNCLASSIFIED', 'TRANSIENT', 'PERMANENT', 'EXHAUSTED')
  ),
  ADD CONSTRAINT "job_failure_queue_non_empty" CHECK (length(btrim("queue")) > 0),
  ADD CONSTRAINT "job_failure_name_non_empty" CHECK (length(btrim("name")) > 0),
  ADD CONSTRAINT "job_failure_resolution_order" CHECK (
    "resolved_at" IS NULL OR "resolved_at" >= "failed_at"
  );

CREATE UNIQUE INDEX "job_failure_queue_job_id_terminal_cycle_key"
  ON "job_failure" ("queue", "job_id", "terminal_cycle");

CREATE INDEX "job_failure_unresolved_failed_at_idx"
  ON "job_failure" ("failed_at" DESC)
  WHERE "resolved_at" IS NULL;
