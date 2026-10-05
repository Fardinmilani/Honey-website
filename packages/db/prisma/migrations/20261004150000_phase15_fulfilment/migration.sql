-- Phase 15: distinguish release of allocated units from reservation release.
ALTER TYPE "stock_ledger_reason" ADD VALUE 'ALLOCATION_RELEASE';

ALTER TABLE "shipment"
  ADD COLUMN "idempotency_key" TEXT,
  ADD COLUMN "request_hash" TEXT;
CREATE UNIQUE INDEX "shipment_order_id_idempotency_key_key"
  ON "shipment" ("order_id", "idempotency_key");

-- Keep the exact checkout allocation source for every shipment line. The
-- reservation identifies the variant and the physical stock location.
CREATE TABLE "shipment_line_allocation" (
  "id" UUID NOT NULL,
  "shipment_line_id" UUID NOT NULL,
  "stock_reservation_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "shipment_line_allocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shipment_line_allocation_quantity_positive" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "shipment_line_allocation_shipment_line_id_stock_reservation_id_key"
  ON "shipment_line_allocation" ("shipment_line_id", "stock_reservation_id");
CREATE INDEX "shipment_line_allocation_stock_reservation_id_idx"
  ON "shipment_line_allocation" ("stock_reservation_id");

ALTER TABLE "shipment_line_allocation"
  ADD CONSTRAINT "shipment_line_allocation_shipment_line_id_fkey"
    FOREIGN KEY ("shipment_line_id") REFERENCES "shipment_line"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "shipment_line_allocation_stock_reservation_id_fkey"
    FOREIGN KEY ("stock_reservation_id") REFERENCES "stock_reservation"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Delivery coordination is durable and contains no recipient PII.
CREATE TABLE "fulfilment_email_delivery" (
  "id" UUID NOT NULL,
  "shipment_id" UUID NOT NULL,
  "event_type" TEXT NOT NULL,
  "sent_at" TIMESTAMPTZ(3),
  "lease_until" TIMESTAMPTZ(3),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fulfilment_email_delivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fulfilment_email_delivery_attempt_count_non_negative" CHECK ("attempt_count" >= 0)
);

CREATE UNIQUE INDEX "fulfilment_email_delivery_shipment_id_event_type_key"
  ON "fulfilment_email_delivery" ("shipment_id", "event_type");
ALTER TABLE "fulfilment_email_delivery"
  ADD CONSTRAINT "fulfilment_email_delivery_shipment_id_fkey"
    FOREIGN KEY ("shipment_id") REFERENCES "shipment"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
