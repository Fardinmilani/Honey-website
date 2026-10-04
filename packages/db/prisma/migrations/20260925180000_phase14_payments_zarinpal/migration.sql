-- Phase 14 (Payments): a payment can now sit in AUTHORIZED while awaiting a
-- capture-capable provider's confirmation; reconciliation must sweep it the
-- same way it already sweeps CREATED / PENDING.
DROP INDEX "payment_reconciliation_idx";
CREATE INDEX "payment_reconciliation_idx"
  ON "payment" ("status", "created_at") WHERE "status" IN ('CREATED', 'PENDING', 'AUTHORIZED');

-- A staff-initiated refund is a payment-outcome event with no matching
-- provider callback; it needs its own source tag distinct from the three
-- verification paths (webhook / return / reconciliation).
ALTER TYPE "payment_outcome_source" ADD VALUE 'STAFF_REFUND';

CREATE INDEX IF NOT EXISTS "refund_status_idx" ON "refund" ("status");
CREATE INDEX IF NOT EXISTS "provider_event_unprocessed_idx"
  ON "provider_event" ("provider", "received_at")
  WHERE "processed_at" IS NULL;
