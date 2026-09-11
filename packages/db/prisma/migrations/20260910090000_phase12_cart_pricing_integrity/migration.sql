-- Phase 12: enforce a single active owner cart and support authoritative lookup paths.
-- Existing Phase 4 money, coupon, and positive cart-line constraints remain unchanged.

ALTER TABLE "cart"
  ADD CONSTRAINT "cart_owner_exclusive"
  CHECK (num_nonnulls("user_id", "anonymous_id") = 1);

CREATE UNIQUE INDEX "cart_active_user_unique"
  ON "cart"("user_id")
  WHERE "status" = 'ACTIVE' AND "user_id" IS NOT NULL;

CREATE UNIQUE INDEX "cart_active_anonymous_unique"
  ON "cart"("anonymous_id")
  WHERE "status" = 'ACTIVE' AND "anonymous_id" IS NOT NULL;

CREATE INDEX "cart_active_expiry_idx"
  ON "cart"("expires_at")
  WHERE "status" = 'ACTIVE';

CREATE INDEX "variant_price_current_lookup_idx"
  ON "variant_price"("variant_id", "currency", "valid_from" DESC);
