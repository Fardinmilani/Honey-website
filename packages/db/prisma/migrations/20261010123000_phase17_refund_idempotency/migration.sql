-- Historical refunds remain unchanged; new keyed requests have one durable effect.
ALTER TABLE "refund" ADD COLUMN "idempotency_key" TEXT;
ALTER TABLE "refund" ADD COLUMN "request_hash" TEXT;
CREATE UNIQUE INDEX "refund_payment_id_idempotency_key_key" ON "refund" ("payment_id", "idempotency_key");
ALTER TABLE "refund" ADD CONSTRAINT "refund_idempotency_shape" CHECK (
  ("idempotency_key" IS NULL AND "request_hash" IS NULL)
  OR ("idempotency_key" IS NOT NULL AND "request_hash" IS NOT NULL
      AND length("idempotency_key") BETWEEN 16 AND 128 AND "request_hash" ~ '^[0-9a-f]{64}$')
);
