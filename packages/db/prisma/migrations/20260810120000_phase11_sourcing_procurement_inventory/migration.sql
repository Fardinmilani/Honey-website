-- Phase 11 expand-only: procurement destination and acquisition costs,
-- inventory low-stock alert persistence, and list indexes.

ALTER TABLE "purchase_order"
  ADD COLUMN "destination_stock_location_id" UUID,
  ADD COLUMN "freight_cost_minor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "duty_cost_minor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "other_cost_minor" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "purchase_order"
  ADD CONSTRAINT "purchase_order_destination_stock_location_id_fkey"
  FOREIGN KEY ("destination_stock_location_id") REFERENCES "stock_location"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "purchase_order_destination_stock_location_id_idx"
  ON "purchase_order"("destination_stock_location_id");

CREATE INDEX "purchase_order_status_idx"
  ON "purchase_order"("status");

ALTER TABLE "purchase_order"
  ADD CONSTRAINT "purchase_order_acquisition_costs_non_negative" CHECK (
    "freight_cost_minor" >= 0
    AND "duty_cost_minor" >= 0
    AND "other_cost_minor" >= 0
  );

ALTER TABLE "inventory_item"
  ADD COLUMN "low_stock_alert_active" BOOLEAN NOT NULL DEFAULT false;
