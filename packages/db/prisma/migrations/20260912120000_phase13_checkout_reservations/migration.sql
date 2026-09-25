-- Phase 13 keeps the first authoritative checkout quote for price-change
-- reconfirmation. This is intentionally nullable for existing and incomplete
-- checkout sessions.
ALTER TABLE "checkout_session"
  ADD COLUMN "pricing_snapshot" JSONB;

-- A checkout can reserve one variant from more than one sellable stock
-- location. The active uniqueness boundary is therefore per location, while
-- inactive reservation history remains unrestricted.
DROP INDEX "reservation_active_unique";
CREATE UNIQUE INDEX "reservation_active_unique"
  ON "stock_reservation" ("variant_id", "stock_location_id", "checkout_session_id")
  WHERE "status" = 'ACTIVE';
