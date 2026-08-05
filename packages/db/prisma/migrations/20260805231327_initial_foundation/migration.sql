-- Required PostgreSQL capabilities.
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "credential_type" AS ENUM ('PASSWORD', 'TOTP', 'RECOVERY_CODE');

-- CreateEnum
CREATE TYPE "session_kind" AS ENUM ('CUSTOMER', 'STAFF');

-- CreateEnum
CREATE TYPE "verification_purpose" AS ENUM ('EMAIL', 'PHONE', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "product_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "variant_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "sourcing_type" AS ENUM ('OWN_PRODUCTION', 'SELECTED_SUPPLIER');

-- CreateEnum
CREATE TYPE "media_role" AS ENUM ('GALLERY', 'THUMBNAIL', 'LIFESTYLE', 'VIDEO');

-- CreateEnum
CREATE TYPE "supplier_status" AS ENUM ('ACTIVE', 'PAUSED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "purchase_order_status" AS ENUM ('DRAFT', 'SUBMITTED', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "stock_location_type" AS ENUM ('WAREHOUSE', 'STUDIO', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "stock_ledger_reason" AS ENUM ('RECEIPT', 'RESERVATION', 'RESERVATION_RELEASE', 'ALLOCATION', 'FULFILMENT', 'RETURN', 'ADJUSTMENT', 'WRITE_OFF', 'TRANSFER_IN', 'TRANSFER_OUT', 'CORRECTION');

-- CreateEnum
CREATE TYPE "reservation_status" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "coupon_type" AS ENUM ('PERCENT', 'FIXED', 'FREE_SHIPPING');

-- CreateEnum
CREATE TYPE "coupon_applies_to" AS ENUM ('ALL', 'CATEGORY', 'COLLECTION', 'VARIANT');

-- CreateEnum
CREATE TYPE "coupon_status" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "cart_status" AS ENUM ('ACTIVE', 'MERGED', 'CONVERTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "checkout_status" AS ENUM ('OPEN', 'AWAITING_PAYMENT', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('PENDING_PAYMENT', 'PAID', 'PROCESSING', 'PARTIALLY_FULFILLED', 'FULFILLED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "order_payment_status" AS ENUM ('UNPAID', 'AUTHORIZED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "fulfilment_status" AS ENUM ('UNFULFILLED', 'PARTIAL', 'FULFILLED');

-- CreateEnum
CREATE TYPE "return_request_status" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('CREATED', 'PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "payment_attempt_status" AS ENUM ('CREATED', 'SENT', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "payment_transaction_type" AS ENUM ('AUTHORIZE', 'CAPTURE', 'REFUND', 'VOID', 'CHARGEBACK');

-- CreateEnum
CREATE TYPE "payment_outcome_source" AS ENUM ('VERIFIED_WEBHOOK', 'VERIFIED_RETURN', 'RECONCILIATION');

-- CreateEnum
CREATE TYPE "refund_status" AS ENUM ('REQUESTED', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "shipment_status" AS ENUM ('PENDING', 'LABEL_CREATED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'RETURNED');

-- CreateEnum
CREATE TYPE "publish_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(3),
    "phone" TEXT,
    "phone_verified_at" TIMESTAMPTZ(3),
    "display_name" TEXT,
    "preferred_locale" TEXT NOT NULL DEFAULT 'fa',
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "is_staff" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_credential" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "credential_type" NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3),

    CONSTRAINT "auth_credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "session_kind" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ip" INET,
    "user_agent_hash" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "verification_purpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by" UUID,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "ip" INET,
    "request_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" UUID NOT NULL,
    "sku" TEXT,
    "brand_line" TEXT,
    "status" "product_status" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(3),
    "primary_category_id" UUID,
    "default_variant_id" UUID,
    "honey_varietal" TEXT,
    "floral_sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "origin_region" TEXT,
    "origin_altitude_band" TEXT,
    "harvest_season" TEXT,
    "apiary_id" UUID,
    "sourcing_type" "sourcing_type" NOT NULL,
    "sort_weight" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_translation" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "short_description" TEXT,
    "description" TEXT,
    "tasting_notes" TEXT,
    "pairing_suggestions" TEXT,
    "story_html" TEXT,
    "meta_title" TEXT,
    "meta_description" TEXT,

    CONSTRAINT "product_translation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variant" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "status" "variant_status" NOT NULL DEFAULT 'DRAFT',
    "net_weight_grams" INTEGER NOT NULL,
    "jar_size_label_key" TEXT NOT NULL,
    "packaging_type_key" TEXT NOT NULL,
    "barcode" TEXT,
    "weight_grams_shipping" INTEGER NOT NULL,
    "dimensions_mm" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "product_variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_translation" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "variant_translation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "path" TEXT NOT NULL,
    "sort_weight" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_translation" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "meta_title" TEXT,
    "meta_description" TEXT,

    CONSTRAINT "category_translation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection" (
    "id" UUID NOT NULL,
    "status" "publish_status" NOT NULL DEFAULT 'DRAFT',
    "sort_weight" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_translation" (
    "id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "meta_title" TEXT,
    "meta_description" TEXT,

    CONSTRAINT "collection_translation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_category" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "product_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_collection" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slug_history" (
    "id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "old_slug" TEXT NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slug_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_asset" (
    "id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_seconds" INTEGER,
    "checksum" TEXT NOT NULL,
    "alt_text_by_locale" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_derivative" (
    "id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "variant" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_derivative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_media" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "media_asset_id" UUID NOT NULL,
    "role" "media_role" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "alt_text_by_locale" JSONB,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apiary" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "altitude_band" TEXT,
    "notes" TEXT,
    "is_own_operation" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "apiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apiary_translation" (
    "id" UUID NOT NULL,
    "apiary_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "apiary_translation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "contact_name" TEXT,
    "email" CITEXT,
    "phone" TEXT,
    "address" TEXT,
    "status" "supplier_status" NOT NULL DEFAULT 'ACTIVE',
    "quality_rating" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_batch" (
    "id" UUID NOT NULL,
    "batch_code" TEXT NOT NULL,
    "sourcing_type" "sourcing_type" NOT NULL,
    "apiary_id" UUID,
    "supplier_id" UUID,
    "harvest_season" TEXT NOT NULL,
    "harvest_year" INTEGER NOT NULL,
    "floral_sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "received_at" TIMESTAMPTZ(3),
    "quantity_grams" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "harvest_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_allocation" (
    "id" UUID NOT NULL,
    "harvest_batch_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity_units" INTEGER NOT NULL,
    "packed_at" TIMESTAMPTZ(3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "status" "purchase_order_status" NOT NULL DEFAULT 'DRAFT',
    "currency" CHAR(3) NOT NULL,
    "expected_at" TIMESTAMPTZ(3),
    "placed_by" UUID,
    "placed_at" TIMESTAMPTZ(3),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_line" (
    "id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "variant_id" UUID,
    "harvest_batch_id" UUID,
    "quantity_ordered" INTEGER NOT NULL,
    "unit_cost_minor" BIGINT NOT NULL,
    "tax_minor" BIGINT NOT NULL DEFAULT 0,
    "line_total_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt" (
    "id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "received_by" UUID,
    "stock_location_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_line" (
    "id" UUID NOT NULL,
    "goods_receipt_id" UUID NOT NULL,
    "purchase_order_line_id" UUID NOT NULL,
    "quantity_accepted" INTEGER NOT NULL,
    "quantity_rejected" INTEGER NOT NULL DEFAULT 0,
    "rejection_reason" TEXT,
    "harvest_batch_id" UUID NOT NULL,

    CONSTRAINT "goods_receipt_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_location" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "stock_location_type" NOT NULL,
    "is_sellable" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "stock_location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_item" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "stock_location_id" UUID NOT NULL,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "allocated" INTEGER NOT NULL DEFAULT 0,
    "incoming" INTEGER NOT NULL DEFAULT 0,
    "reorder_point" INTEGER NOT NULL DEFAULT 0,
    "safety_stock" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "inventory_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_ledger_entry" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "stock_location_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "stock_ledger_reason" NOT NULL,
    "ref_type" TEXT NOT NULL,
    "ref_id" UUID NOT NULL,
    "note" TEXT,
    "actor_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_reservation" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "stock_location_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "cart_id" UUID,
    "checkout_session_id" UUID,
    "order_id" UUID,
    "status" "reservation_status" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_at" TIMESTAMPTZ(3),
    "released_at" TIMESTAMPTZ(3),
    "release_reason" TEXT,

    CONSTRAINT "stock_reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_price" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "compare_at_minor" BIGINT,
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "valid_to" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "variant_price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rate" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate_bps" INTEGER NOT NULL,
    "country" CHAR(2) NOT NULL,
    "region" TEXT,
    "is_inclusive" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "tax_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "type" "coupon_type" NOT NULL,
    "value" BIGINT NOT NULL,
    "currency" CHAR(3),
    "min_subtotal_minor" BIGINT,
    "max_discount_minor" BIGINT,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3),
    "usage_limit_total" INTEGER,
    "usage_limit_per_user" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "applies_to" "coupon_applies_to" NOT NULL DEFAULT 'ALL',
    "target_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "status" "coupon_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_redemption" (
    "id" UUID NOT NULL,
    "coupon_id" UUID NOT NULL,
    "user_id" UUID,
    "order_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "redeemed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_id" TEXT,
    "currency" CHAR(3) NOT NULL,
    "locale" TEXT NOT NULL,
    "status" "cart_status" NOT NULL DEFAULT 'ACTIVE',
    "coupon_code" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_line" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "address" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL,
    "province" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "is_default_shipping" BOOLEAN NOT NULL DEFAULT false,
    "is_default_billing" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_session" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "user_id" UUID,
    "email" CITEXT NOT NULL,
    "phone" TEXT,
    "shipping_address_id" UUID,
    "billing_address_id" UUID,
    "same_as_shipping" BOOLEAN NOT NULL DEFAULT true,
    "shipping_method_code" TEXT,
    "shipping_quote_id" UUID,
    "status" "checkout_status" NOT NULL DEFAULT 'OPEN',
    "reservation_expires_at" TIMESTAMPTZ(3),
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "checkout_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "checkout_session_id" UUID,
    "user_id" UUID,
    "email" CITEXT NOT NULL,
    "phone" TEXT,
    "locale_at_purchase" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "payment_status" "order_payment_status" NOT NULL DEFAULT 'UNPAID',
    "fulfilment_status" "fulfilment_status" NOT NULL DEFAULT 'UNFULFILLED',
    "subtotal_minor" BIGINT NOT NULL,
    "discount_total_minor" BIGINT NOT NULL DEFAULT 0,
    "shipping_total_minor" BIGINT NOT NULL DEFAULT 0,
    "tax_total_minor" BIGINT NOT NULL DEFAULT 0,
    "grand_total_minor" BIGINT NOT NULL,
    "refunded_total_minor" BIGINT NOT NULL DEFAULT 0,
    "coupon_code_snapshot" TEXT,
    "shipping_method_snapshot" JSONB NOT NULL,
    "shipping_address_snapshot" JSONB NOT NULL,
    "billing_address_snapshot" JSONB NOT NULL,
    "placed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_line" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID,
    "variant_id" UUID,
    "sku_snapshot" TEXT NOT NULL,
    "product_name_snapshot" JSONB NOT NULL,
    "variant_name_snapshot" JSONB NOT NULL,
    "attributes_snapshot" JSONB NOT NULL,
    "image_url_snapshot" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price_minor" BIGINT NOT NULL,
    "discount_allocated_minor" BIGINT NOT NULL DEFAULT 0,
    "tax_rate_bps" INTEGER NOT NULL,
    "tax_amount_minor" BIGINT NOT NULL DEFAULT 0,
    "line_total_minor" BIGINT NOT NULL,
    "harvest_batch_code_snapshot" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "order_status",
    "to_status" "order_status" NOT NULL,
    "reason" TEXT,
    "actor_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_note" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "is_customer_visible" BOOLEAN NOT NULL DEFAULT false,
    "author_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_request" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "lines" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "return_request_status" NOT NULL DEFAULT 'REQUESTED',
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'CREATED',
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "provider_ref" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorized_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "failure_code" TEXT,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempt" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "payment_attempt_status" NOT NULL,
    "provider_ref" TEXT,
    "request_summary" JSONB,
    "response_summary" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transaction" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "type" "payment_transaction_type" NOT NULL,
    "source" "payment_outcome_source" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "provider_txn_ref" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "raw_payload" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "refund_status" NOT NULL DEFAULT 'REQUESTED',
    "requested_by" UUID,
    "provider_ref" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_event" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "signature_valid" BOOLEAN NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),
    "raw_body" JSONB NOT NULL,
    "processing_error" TEXT,

    CONSTRAINT "provider_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_zone" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provinces" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "shipping_zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_method" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "zone_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "shipping_method_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_method_translation" (
    "id" UUID NOT NULL,
    "shipping_method_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "shipping_method_translation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_rate" (
    "id" UUID NOT NULL,
    "method_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "base_minor" BIGINT NOT NULL,
    "per_kg_minor" BIGINT NOT NULL DEFAULT 0,
    "free_over_subtotal_minor" BIGINT,
    "min_weight_grams" INTEGER NOT NULL DEFAULT 0,
    "max_weight_grams" INTEGER,
    "valid_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipping_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_quote" (
    "id" UUID NOT NULL,
    "checkout_session_id" UUID NOT NULL,
    "method_code" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "estimated_days_min" INTEGER NOT NULL,
    "estimated_days_max" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "provider_payload" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipping_quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "shipment_status" NOT NULL DEFAULT 'PENDING',
    "tracking_number" TEXT,
    "tracking_url" TEXT,
    "shipped_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_line" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "order_line_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "shipment_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_event" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "raw_payload" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "status" "publish_status" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_translation" (
    "id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "blocks" JSONB NOT NULL,
    "meta_title" TEXT,
    "meta_description" TEXT,

    CONSTRAINT "page_translation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article" (
    "id" UUID NOT NULL,
    "status" "publish_status" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_translation" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "blocks" JSONB NOT NULL,
    "meta_title" TEXT,
    "meta_description" TEXT,

    CONSTRAINT "article_translation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_item" (
    "id" UUID NOT NULL,
    "group_key" TEXT NOT NULL,
    "status" "publish_status" NOT NULL DEFAULT 'DRAFT',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "faq_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_item_translation" (
    "id" UUID NOT NULL,
    "faq_item_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,

    CONSTRAINT "faq_item_translation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_event" (
    "id" UUID NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_key" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "user_id" UUID,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setting" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value_json" JSONB NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,

    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_failure" (
    "id" UUID NOT NULL,
    "queue" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "error" TEXT NOT NULL,
    "failed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_failure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "auth_credential_user_id_idx" ON "auth_credential"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_hash_key" ON "session"("token_hash");

-- CreateIndex
CREATE INDEX "session_user_id_expires_at_idx" ON "session"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "verification_token_token_hash_key" ON "verification_token"("token_hash");

-- CreateIndex
CREATE INDEX "verification_token_user_id_idx" ON "verification_token"("user_id");

-- CreateIndex
CREATE INDEX "verification_token_expires_at_idx" ON "verification_token"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "role_code_key" ON "role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permission_code_key" ON "permission"("code");

-- CreateIndex
CREATE INDEX "role_permission_permission_id_idx" ON "role_permission"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permission_role_id_permission_id_key" ON "role_permission"("role_id", "permission_id");

-- CreateIndex
CREATE INDEX "user_role_role_id_idx" ON "user_role"("role_id");

-- CreateIndex
CREATE INDEX "user_role_granted_by_idx" ON "user_role"("granted_by");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_user_id_role_id_key" ON "user_role"("user_id", "role_id");

-- CreateIndex
CREATE INDEX "audit_log_actor_user_id_idx" ON "audit_log"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_log_subject_type_subject_id_created_at_idx" ON "audit_log"("subject_type", "subject_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "product_sku_key" ON "product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_default_variant_id_key" ON "product"("default_variant_id");

-- CreateIndex
CREATE INDEX "product_status_published_at_idx" ON "product"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "product_primary_category_id_status_idx" ON "product"("primary_category_id", "status");

-- CreateIndex
CREATE INDEX "product_apiary_id_idx" ON "product"("apiary_id");

-- CreateIndex
CREATE INDEX "product_translation_product_id_idx" ON "product_translation"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_translation_product_id_locale_key" ON "product_translation"("product_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "product_translation_locale_slug_key" ON "product_translation"("locale", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "product_variant_sku_key" ON "product_variant"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_variant_barcode_key" ON "product_variant"("barcode");

-- CreateIndex
CREATE INDEX "product_variant_product_id_position_idx" ON "product_variant"("product_id", "position");

-- CreateIndex
CREATE INDEX "variant_translation_variant_id_idx" ON "variant_translation"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "variant_translation_variant_id_locale_key" ON "variant_translation"("variant_id", "locale");

-- CreateIndex
CREATE INDEX "category_parent_id_idx" ON "category"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "category_path_key" ON "category"("path");

-- CreateIndex
CREATE INDEX "category_translation_category_id_idx" ON "category_translation"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "category_translation_category_id_locale_key" ON "category_translation"("category_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "category_translation_locale_slug_key" ON "category_translation"("locale", "slug");

-- CreateIndex
CREATE INDEX "collection_status_published_at_idx" ON "collection"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "collection_translation_collection_id_idx" ON "collection_translation"("collection_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_translation_collection_id_locale_key" ON "collection_translation"("collection_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "collection_translation_locale_slug_key" ON "collection_translation"("locale", "slug");

-- CreateIndex
CREATE INDEX "product_category_category_id_product_id_idx" ON "product_category"("category_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_category_product_id_category_id_key" ON "product_category"("product_id", "category_id");

-- CreateIndex
CREATE INDEX "product_collection_collection_id_position_idx" ON "product_collection"("collection_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "product_collection_product_id_collection_id_key" ON "product_collection"("product_id", "collection_id");

-- CreateIndex
CREATE INDEX "slug_history_entity_id_idx" ON "slug_history"("entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "slug_history_entity_type_locale_old_slug_key" ON "slug_history"("entity_type", "locale", "old_slug");

-- CreateIndex
CREATE UNIQUE INDEX "media_asset_storage_key_key" ON "media_asset"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "media_asset_checksum_key" ON "media_asset"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "media_derivative_storage_key_key" ON "media_derivative"("storage_key");

-- CreateIndex
CREATE INDEX "media_derivative_media_asset_id_idx" ON "media_derivative"("media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_derivative_media_asset_id_variant_format_width_key" ON "media_derivative"("media_asset_id", "variant", "format", "width");

-- CreateIndex
CREATE INDEX "product_media_product_id_position_idx" ON "product_media"("product_id", "position");

-- CreateIndex
CREATE INDEX "product_media_variant_id_idx" ON "product_media"("variant_id");

-- CreateIndex
CREATE INDEX "product_media_media_asset_id_idx" ON "product_media"("media_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "apiary_code_key" ON "apiary"("code");

-- CreateIndex
CREATE INDEX "apiary_translation_apiary_id_idx" ON "apiary_translation"("apiary_id");

-- CreateIndex
CREATE UNIQUE INDEX "apiary_translation_apiary_id_locale_key" ON "apiary_translation"("apiary_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_code_key" ON "supplier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "harvest_batch_batch_code_key" ON "harvest_batch"("batch_code");

-- CreateIndex
CREATE INDEX "harvest_batch_apiary_id_idx" ON "harvest_batch"("apiary_id");

-- CreateIndex
CREATE INDEX "harvest_batch_supplier_id_idx" ON "harvest_batch"("supplier_id");

-- CreateIndex
CREATE INDEX "batch_allocation_harvest_batch_id_idx" ON "batch_allocation"("harvest_batch_id");

-- CreateIndex
CREATE INDEX "batch_allocation_variant_id_idx" ON "batch_allocation"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_number_key" ON "purchase_order"("number");

-- CreateIndex
CREATE INDEX "purchase_order_supplier_id_idx" ON "purchase_order"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_order_line_purchase_order_id_idx" ON "purchase_order_line"("purchase_order_id");

-- CreateIndex
CREATE INDEX "purchase_order_line_variant_id_idx" ON "purchase_order_line"("variant_id");

-- CreateIndex
CREATE INDEX "purchase_order_line_harvest_batch_id_idx" ON "purchase_order_line"("harvest_batch_id");

-- CreateIndex
CREATE INDEX "goods_receipt_purchase_order_id_idx" ON "goods_receipt"("purchase_order_id");

-- CreateIndex
CREATE INDEX "goods_receipt_stock_location_id_idx" ON "goods_receipt"("stock_location_id");

-- CreateIndex
CREATE INDEX "goods_receipt_line_goods_receipt_id_idx" ON "goods_receipt_line"("goods_receipt_id");

-- CreateIndex
CREATE INDEX "goods_receipt_line_purchase_order_line_id_idx" ON "goods_receipt_line"("purchase_order_line_id");

-- CreateIndex
CREATE INDEX "goods_receipt_line_harvest_batch_id_idx" ON "goods_receipt_line"("harvest_batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_location_code_key" ON "stock_location"("code");

-- CreateIndex
CREATE INDEX "inventory_item_stock_location_id_idx" ON "inventory_item"("stock_location_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_item_variant_id_stock_location_id_key" ON "inventory_item"("variant_id", "stock_location_id");

-- CreateIndex
CREATE INDEX "stock_ledger_entry_variant_id_created_at_idx" ON "stock_ledger_entry"("variant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_ledger_entry_stock_location_id_idx" ON "stock_ledger_entry"("stock_location_id");

-- CreateIndex
CREATE INDEX "stock_ledger_entry_ref_type_ref_id_idx" ON "stock_ledger_entry"("ref_type", "ref_id");

-- CreateIndex
CREATE INDEX "stock_reservation_variant_id_idx" ON "stock_reservation"("variant_id");

-- CreateIndex
CREATE INDEX "stock_reservation_stock_location_id_idx" ON "stock_reservation"("stock_location_id");

-- CreateIndex
CREATE INDEX "stock_reservation_cart_id_idx" ON "stock_reservation"("cart_id");

-- CreateIndex
CREATE INDEX "stock_reservation_checkout_session_id_idx" ON "stock_reservation"("checkout_session_id");

-- CreateIndex
CREATE INDEX "stock_reservation_order_id_idx" ON "stock_reservation"("order_id");

-- CreateIndex
CREATE INDEX "variant_price_variant_id_idx" ON "variant_price"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "variant_price_variant_id_currency_valid_from_key" ON "variant_price"("variant_id", "currency", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rate_code_key" ON "tax_rate"("code");

-- CreateIndex
CREATE INDEX "coupon_redemption_user_id_idx" ON "coupon_redemption"("user_id");

-- CreateIndex
CREATE INDEX "coupon_redemption_order_id_idx" ON "coupon_redemption"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemption_coupon_id_order_id_key" ON "coupon_redemption"("coupon_id", "order_id");

-- CreateIndex
CREATE INDEX "cart_user_id_idx" ON "cart"("user_id");

-- CreateIndex
CREATE INDEX "cart_anonymous_id_idx" ON "cart"("anonymous_id");

-- CreateIndex
CREATE INDEX "cart_expires_at_idx" ON "cart"("expires_at");

-- CreateIndex
CREATE INDEX "cart_line_variant_id_idx" ON "cart_line"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_line_cart_id_variant_id_key" ON "cart_line"("cart_id", "variant_id");

-- CreateIndex
CREATE INDEX "address_user_id_idx" ON "address"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_session_shipping_quote_id_key" ON "checkout_session"("shipping_quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_session_idempotency_key_key" ON "checkout_session"("idempotency_key");

-- CreateIndex
CREATE INDEX "checkout_session_cart_id_idx" ON "checkout_session"("cart_id");

-- CreateIndex
CREATE INDEX "checkout_session_user_id_idx" ON "checkout_session"("user_id");

-- CreateIndex
CREATE INDEX "checkout_session_shipping_address_id_idx" ON "checkout_session"("shipping_address_id");

-- CreateIndex
CREATE INDEX "checkout_session_billing_address_id_idx" ON "checkout_session"("billing_address_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_number_key" ON "order"("number");

-- CreateIndex
CREATE INDEX "order_checkout_session_id_idx" ON "order"("checkout_session_id");

-- CreateIndex
CREATE INDEX "order_user_id_placed_at_idx" ON "order"("user_id", "placed_at" DESC);

-- CreateIndex
CREATE INDEX "order_status_placed_at_idx" ON "order"("status", "placed_at" DESC);

-- CreateIndex
CREATE INDEX "order_line_order_id_idx" ON "order_line"("order_id");

-- CreateIndex
CREATE INDEX "order_line_product_id_idx" ON "order_line"("product_id");

-- CreateIndex
CREATE INDEX "order_line_variant_id_idx" ON "order_line"("variant_id");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_created_at_idx" ON "order_status_history"("order_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "order_status_history_actor_user_id_idx" ON "order_status_history"("actor_user_id");

-- CreateIndex
CREATE INDEX "order_note_order_id_idx" ON "order_note"("order_id");

-- CreateIndex
CREATE INDEX "order_note_author_user_id_idx" ON "order_note"("author_user_id");

-- CreateIndex
CREATE INDEX "return_request_order_id_idx" ON "return_request"("order_id");

-- CreateIndex
CREATE INDEX "payment_order_id_status_idx" ON "payment"("order_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_provider_ref_key" ON "payment"("provider", "provider_ref");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_idempotency_key_key" ON "payment"("provider", "idempotency_key");

-- CreateIndex
CREATE INDEX "payment_attempt_payment_id_idx" ON "payment_attempt"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempt_payment_id_attempt_number_key" ON "payment_attempt"("payment_id", "attempt_number");

-- CreateIndex
CREATE INDEX "payment_transaction_payment_id_idx" ON "payment_transaction"("payment_id");

-- CreateIndex
CREATE INDEX "payment_transaction_provider_txn_ref_idx" ON "payment_transaction"("provider_txn_ref");

-- CreateIndex
CREATE INDEX "refund_order_id_idx" ON "refund"("order_id");

-- CreateIndex
CREATE INDEX "refund_payment_id_idx" ON "refund"("payment_id");

-- CreateIndex
CREATE INDEX "refund_requested_by_idx" ON "refund"("requested_by");

-- CreateIndex
CREATE UNIQUE INDEX "provider_event_provider_event_id_key" ON "provider_event"("provider", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipping_method_code_key" ON "shipping_method"("code");

-- CreateIndex
CREATE INDEX "shipping_method_zone_id_idx" ON "shipping_method"("zone_id");

-- CreateIndex
CREATE INDEX "shipping_method_translation_shipping_method_id_idx" ON "shipping_method_translation"("shipping_method_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipping_method_translation_shipping_method_id_locale_key" ON "shipping_method_translation"("shipping_method_id", "locale");

-- CreateIndex
CREATE INDEX "shipping_rate_method_id_idx" ON "shipping_rate"("method_id");

-- CreateIndex
CREATE INDEX "shipping_quote_checkout_session_id_idx" ON "shipping_quote"("checkout_session_id");

-- CreateIndex
CREATE INDEX "shipping_quote_expires_at_idx" ON "shipping_quote"("expires_at");

-- CreateIndex
CREATE INDEX "shipment_order_id_idx" ON "shipment"("order_id");

-- CreateIndex
CREATE INDEX "shipment_tracking_number_idx" ON "shipment"("tracking_number");

-- CreateIndex
CREATE INDEX "shipment_line_order_line_id_idx" ON "shipment_line"("order_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_line_shipment_id_order_line_id_key" ON "shipment_line"("shipment_id", "order_line_id");

-- CreateIndex
CREATE INDEX "tracking_event_shipment_id_idx" ON "tracking_event"("shipment_id");

-- CreateIndex
CREATE UNIQUE INDEX "page_key_key" ON "page"("key");

-- CreateIndex
CREATE INDEX "page_status_published_at_idx" ON "page"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "page_translation_page_id_idx" ON "page_translation"("page_id");

-- CreateIndex
CREATE UNIQUE INDEX "page_translation_page_id_locale_key" ON "page_translation"("page_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "page_translation_locale_slug_key" ON "page_translation"("locale", "slug");

-- CreateIndex
CREATE INDEX "article_status_published_at_idx" ON "article"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "article_translation_article_id_idx" ON "article_translation"("article_id");

-- CreateIndex
CREATE UNIQUE INDEX "article_translation_article_id_locale_key" ON "article_translation"("article_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "article_translation_locale_slug_key" ON "article_translation"("locale", "slug");

-- CreateIndex
CREATE INDEX "faq_item_group_key_sort_order_idx" ON "faq_item"("group_key", "sort_order");

-- CreateIndex
CREATE INDEX "faq_item_translation_faq_item_id_idx" ON "faq_item_translation"("faq_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "faq_item_translation_faq_item_id_locale_key" ON "faq_item_translation"("faq_item_id", "locale");

-- CreateIndex
CREATE INDEX "outbox_event_aggregate_type_aggregate_id_idx" ON "outbox_event"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE INDEX "idempotency_key_user_id_idx" ON "idempotency_key"("user_id");

-- CreateIndex
CREATE INDEX "idempotency_key_expires_at_idx" ON "idempotency_key"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_key_key_scope_key" ON "idempotency_key"("key", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "setting_key_key" ON "setting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_key_key" ON "feature_flag"("key");

-- CreateIndex
CREATE INDEX "job_failure_queue_failed_at_idx" ON "job_failure"("queue", "failed_at" DESC);

-- AddForeignKey
ALTER TABLE "auth_credential" ADD CONSTRAINT "auth_credential_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_token" ADD CONSTRAINT "verification_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_primary_category_id_fkey" FOREIGN KEY ("primary_category_id") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_default_variant_id_fkey" FOREIGN KEY ("default_variant_id") REFERENCES "product_variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_apiary_id_fkey" FOREIGN KEY ("apiary_id") REFERENCES "apiary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_translation" ADD CONSTRAINT "product_translation_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_translation" ADD CONSTRAINT "variant_translation_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_translation" ADD CONSTRAINT "category_translation_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_translation" ADD CONSTRAINT "collection_translation_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_category" ADD CONSTRAINT "product_category_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_category" ADD CONSTRAINT "product_category_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_collection" ADD CONSTRAINT "product_collection_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_collection" ADD CONSTRAINT "product_collection_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_derivative" ADD CONSTRAINT "media_derivative_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiary_translation" ADD CONSTRAINT "apiary_translation_apiary_id_fkey" FOREIGN KEY ("apiary_id") REFERENCES "apiary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_batch" ADD CONSTRAINT "harvest_batch_apiary_id_fkey" FOREIGN KEY ("apiary_id") REFERENCES "apiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_batch" ADD CONSTRAINT "harvest_batch_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_allocation" ADD CONSTRAINT "batch_allocation_harvest_batch_id_fkey" FOREIGN KEY ("harvest_batch_id") REFERENCES "harvest_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_allocation" ADD CONSTRAINT "batch_allocation_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_harvest_batch_id_fkey" FOREIGN KEY ("harvest_batch_id") REFERENCES "harvest_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_stock_location_id_fkey" FOREIGN KEY ("stock_location_id") REFERENCES "stock_location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_purchase_order_line_id_fkey" FOREIGN KEY ("purchase_order_line_id") REFERENCES "purchase_order_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_harvest_batch_id_fkey" FOREIGN KEY ("harvest_batch_id") REFERENCES "harvest_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_stock_location_id_fkey" FOREIGN KEY ("stock_location_id") REFERENCES "stock_location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger_entry" ADD CONSTRAINT "stock_ledger_entry_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger_entry" ADD CONSTRAINT "stock_ledger_entry_stock_location_id_fkey" FOREIGN KEY ("stock_location_id") REFERENCES "stock_location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservation" ADD CONSTRAINT "stock_reservation_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservation" ADD CONSTRAINT "stock_reservation_stock_location_id_fkey" FOREIGN KEY ("stock_location_id") REFERENCES "stock_location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservation" ADD CONSTRAINT "stock_reservation_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "cart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservation" ADD CONSTRAINT "stock_reservation_checkout_session_id_fkey" FOREIGN KEY ("checkout_session_id") REFERENCES "checkout_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservation" ADD CONSTRAINT "stock_reservation_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_price" ADD CONSTRAINT "variant_price_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemption" ADD CONSTRAINT "coupon_redemption_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemption" ADD CONSTRAINT "coupon_redemption_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemption" ADD CONSTRAINT "coupon_redemption_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart" ADD CONSTRAINT "cart_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_line" ADD CONSTRAINT "cart_line_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_line" ADD CONSTRAINT "cart_line_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "address" ADD CONSTRAINT "address_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_session" ADD CONSTRAINT "checkout_session_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "cart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_session" ADD CONSTRAINT "checkout_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_session" ADD CONSTRAINT "checkout_session_shipping_address_id_fkey" FOREIGN KEY ("shipping_address_id") REFERENCES "address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_session" ADD CONSTRAINT "checkout_session_billing_address_id_fkey" FOREIGN KEY ("billing_address_id") REFERENCES "address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_session" ADD CONSTRAINT "checkout_session_shipping_quote_id_fkey" FOREIGN KEY ("shipping_quote_id") REFERENCES "shipping_quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_checkout_session_id_fkey" FOREIGN KEY ("checkout_session_id") REFERENCES "checkout_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_note" ADD CONSTRAINT "order_note_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_note" ADD CONSTRAINT "order_note_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_request" ADD CONSTRAINT "return_request_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempt" ADD CONSTRAINT "payment_attempt_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transaction" ADD CONSTRAINT "payment_transaction_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_method" ADD CONSTRAINT "shipping_method_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "shipping_zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_method_translation" ADD CONSTRAINT "shipping_method_translation_shipping_method_id_fkey" FOREIGN KEY ("shipping_method_id") REFERENCES "shipping_method"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_rate" ADD CONSTRAINT "shipping_rate_method_id_fkey" FOREIGN KEY ("method_id") REFERENCES "shipping_method"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_quote" ADD CONSTRAINT "shipping_quote_checkout_session_id_fkey" FOREIGN KEY ("checkout_session_id") REFERENCES "checkout_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_line" ADD CONSTRAINT "shipment_line_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_line" ADD CONSTRAINT "shipment_line_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "order_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_event" ADD CONSTRAINT "tracking_event_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_translation" ADD CONSTRAINT "page_translation_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_translation" ADD CONSTRAINT "article_translation_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_item_translation" ADD CONSTRAINT "faq_item_translation_faq_item_id_fkey" FOREIGN KEY ("faq_item_id") REFERENCES "faq_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_key" ADD CONSTRAINT "idempotency_key_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Shared textual conventions.
ALTER TABLE "user"
  ADD CONSTRAINT "user_preferred_locale_bcp47" CHECK ("preferred_locale" ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$');
ALTER TABLE "product_translation"
  ADD CONSTRAINT "product_translation_locale_bcp47" CHECK ("locale" ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$');
ALTER TABLE "variant_translation"
  ADD CONSTRAINT "variant_translation_locale_bcp47" CHECK ("locale" ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$');
ALTER TABLE "category_translation"
  ADD CONSTRAINT "category_translation_locale_bcp47" CHECK ("locale" ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$');
ALTER TABLE "collection_translation"
  ADD CONSTRAINT "collection_translation_locale_bcp47" CHECK ("locale" ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$');
ALTER TABLE "apiary_translation"
  ADD CONSTRAINT "apiary_translation_locale_bcp47" CHECK ("locale" ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$');
ALTER TABLE "cart"
  ADD CONSTRAINT "cart_locale_bcp47" CHECK ("locale" ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$');
ALTER TABLE "order"
  ADD CONSTRAINT "order_locale_bcp47" CHECK ("locale_at_purchase" ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$');
ALTER TABLE "shipping_method_translation"
  ADD CONSTRAINT "shipping_method_translation_locale_bcp47" CHECK ("locale" ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$');
ALTER TABLE "page_translation"
  ADD CONSTRAINT "page_translation_locale_bcp47" CHECK ("locale" ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$');
ALTER TABLE "article_translation"
  ADD CONSTRAINT "article_translation_locale_bcp47" CHECK ("locale" ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$');
ALTER TABLE "faq_item_translation"
  ADD CONSTRAINT "faq_item_translation_locale_bcp47" CHECK ("locale" ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$');

ALTER TABLE "purchase_order"
  ADD CONSTRAINT "purchase_order_currency_iso4217" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "variant_price"
  ADD CONSTRAINT "variant_price_currency_iso4217" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "coupon"
  ADD CONSTRAINT "coupon_currency_iso4217" CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$');
ALTER TABLE "cart"
  ADD CONSTRAINT "cart_currency_iso4217" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "order"
  ADD CONSTRAINT "order_currency_iso4217" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "payment"
  ADD CONSTRAINT "payment_currency_iso4217" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "shipping_rate"
  ADD CONSTRAINT "shipping_rate_currency_iso4217" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "shipping_quote"
  ADD CONSTRAINT "shipping_quote_currency_iso4217" CHECK ("currency" ~ '^[A-Z]{3}$');

-- Catalog, sourcing, and procurement invariants.
ALTER TABLE "product_variant"
  ADD CONSTRAINT "product_variant_positive_dimensions" CHECK (
    "net_weight_grams" > 0 AND "weight_grams_shipping" > 0 AND "position" >= 0
  );
ALTER TABLE "product_media"
  ADD CONSTRAINT "product_media_position_non_negative" CHECK ("position" >= 0);
ALTER TABLE "media_asset"
  ADD CONSTRAINT "media_asset_dimensions_non_negative" CHECK (
    "bytes" >= 0 AND ("width" IS NULL OR "width" > 0) AND
    ("height" IS NULL OR "height" > 0) AND
    ("duration_seconds" IS NULL OR "duration_seconds" >= 0)
  );
ALTER TABLE "media_derivative"
  ADD CONSTRAINT "media_derivative_width_positive" CHECK ("width" > 0);
ALTER TABLE "supplier"
  ADD CONSTRAINT "supplier_quality_rating_range" CHECK (
    "quality_rating" IS NULL OR "quality_rating" BETWEEN 1 AND 5
  );
ALTER TABLE "harvest_batch"
  ADD CONSTRAINT "harvest_batch_sourcing_shape" CHECK (
    ("sourcing_type" = 'OWN_PRODUCTION' AND "apiary_id" IS NOT NULL AND "supplier_id" IS NULL)
    OR
    ("sourcing_type" = 'SELECTED_SUPPLIER' AND "supplier_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "harvest_batch_quantity_positive" CHECK ("quantity_grams" > 0),
  ADD CONSTRAINT "harvest_batch_year_range" CHECK ("harvest_year" BETWEEN 1900 AND 9999);
ALTER TABLE "batch_allocation"
  ADD CONSTRAINT "batch_allocation_quantity_positive" CHECK ("quantity_units" > 0);
ALTER TABLE "purchase_order"
  ADD CONSTRAINT "purchase_order_date_order" CHECK (
    "placed_at" IS NULL OR "expected_at" IS NULL OR "expected_at" >= "placed_at"
  );
ALTER TABLE "purchase_order_line"
  ADD CONSTRAINT "purchase_order_line_values" CHECK (
    "quantity_ordered" > 0 AND "unit_cost_minor" >= 0 AND "tax_minor" >= 0 AND
    "line_total_minor" = ("unit_cost_minor" * "quantity_ordered") + "tax_minor"
  );
ALTER TABLE "goods_receipt_line"
  ADD CONSTRAINT "goods_receipt_line_quantities" CHECK (
    "quantity_accepted" >= 0 AND "quantity_rejected" >= 0 AND
    ("quantity_accepted" + "quantity_rejected") > 0
  );

-- Inventory and reservation invariants.
ALTER TABLE "inventory_item"
  ADD CONSTRAINT "inventory_non_negative" CHECK (
    "on_hand" >= 0 AND "reserved" >= 0 AND "allocated" >= 0 AND "incoming" >= 0 AND
    "reorder_point" >= 0 AND "safety_stock" >= 0 AND "version" >= 0
  ),
  ADD CONSTRAINT "inventory_available_non_negative" CHECK (
    "on_hand" - "reserved" - "allocated" >= 0
  );
ALTER TABLE "stock_ledger_entry"
  ADD CONSTRAINT "stock_ledger_delta_non_zero" CHECK ("delta" <> 0);
ALTER TABLE "stock_reservation"
  ADD CONSTRAINT "stock_reservation_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "stock_reservation_owner_present" CHECK (
    "cart_id" IS NOT NULL OR "checkout_session_id" IS NOT NULL OR "order_id" IS NOT NULL
  ),
  ADD CONSTRAINT "stock_reservation_lifecycle_shape" CHECK (
    ("status" = 'ACTIVE' AND "checkout_session_id" IS NOT NULL AND "consumed_at" IS NULL AND "released_at" IS NULL)
    OR ("status" = 'CONSUMED' AND "order_id" IS NOT NULL AND "consumed_at" IS NOT NULL)
    OR ("status" IN ('RELEASED', 'EXPIRED') AND "released_at" IS NOT NULL)
  );

-- Pricing, cart, and checkout invariants.
ALTER TABLE "variant_price"
  ADD CONSTRAINT "variant_price_values" CHECK (
    "amount_minor" >= 0 AND
    ("compare_at_minor" IS NULL OR "compare_at_minor" >= "amount_minor") AND
    ("valid_to" IS NULL OR "valid_to" > "valid_from")
  );
ALTER TABLE "tax_rate"
  ADD CONSTRAINT "tax_rate_basis_points" CHECK ("rate_bps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "tax_rate_country_code" CHECK ("country" ~ '^[A-Z]{2}$');
ALTER TABLE "coupon"
  ADD CONSTRAINT "coupon_window" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at"),
  ADD CONSTRAINT "coupon_limits" CHECK (
    ("usage_limit_total" IS NULL OR "usage_limit_total" > 0) AND
    ("usage_limit_per_user" IS NULL OR "usage_limit_per_user" > 0) AND
    "used_count" >= 0 AND
    ("usage_limit_total" IS NULL OR "used_count" <= "usage_limit_total")
  ),
  ADD CONSTRAINT "coupon_money_non_negative" CHECK (
    ("min_subtotal_minor" IS NULL OR "min_subtotal_minor" >= 0) AND
    ("max_discount_minor" IS NULL OR "max_discount_minor" >= 0)
  ),
  ADD CONSTRAINT "coupon_value_shape" CHECK (
    ("type" = 'PERCENT' AND "value" BETWEEN 1 AND 10000 AND "currency" IS NULL)
    OR ("type" = 'FIXED' AND "value" > 0 AND "currency" IS NOT NULL)
    OR ("type" = 'FREE_SHIPPING' AND "value" = 0 AND "currency" IS NULL)
  ),
  ADD CONSTRAINT "coupon_target_shape" CHECK (
    ("applies_to" = 'ALL' AND cardinality("target_ids") = 0)
    OR ("applies_to" <> 'ALL' AND cardinality("target_ids") > 0)
  );
ALTER TABLE "coupon_redemption"
  ADD CONSTRAINT "coupon_redemption_amount_non_negative" CHECK ("amount_minor" >= 0);
ALTER TABLE "cart"
  ADD CONSTRAINT "cart_owner_present" CHECK ("user_id" IS NOT NULL OR "anonymous_id" IS NOT NULL),
  ADD CONSTRAINT "cart_expiry_after_creation" CHECK ("expires_at" > "created_at");
ALTER TABLE "cart_line"
  ADD CONSTRAINT "cart_line_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "address"
  ADD CONSTRAINT "address_country_code" CHECK ("country" ~ '^[A-Z]{2}$');
ALTER TABLE "checkout_session"
  ADD CONSTRAINT "checkout_session_completion_shape" CHECK (
    ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL)
    OR ("status" <> 'COMPLETED')
  );

-- Orders and payment invariants.
ALTER TABLE "order"
  ADD CONSTRAINT "order_money_non_negative" CHECK (
    "subtotal_minor" >= 0 AND "discount_total_minor" >= 0 AND
    "shipping_total_minor" >= 0 AND "tax_total_minor" >= 0 AND
    "grand_total_minor" >= 0 AND "refunded_total_minor" >= 0
  ),
  ADD CONSTRAINT "order_refund_cap" CHECK ("refunded_total_minor" <= "grand_total_minor"),
  ADD CONSTRAINT "order_total_reconciles" CHECK (
    "discount_total_minor" <= "subtotal_minor" AND
    "grand_total_minor" = "subtotal_minor" - "discount_total_minor" + "shipping_total_minor" + "tax_total_minor"
  );
ALTER TABLE "order_line"
  ADD CONSTRAINT "order_line_values" CHECK (
    "quantity" > 0 AND "unit_price_minor" >= 0 AND
    "discount_allocated_minor" >= 0 AND "tax_amount_minor" >= 0 AND
    "line_total_minor" >= 0 AND "tax_rate_bps" BETWEEN 0 AND 10000 AND
    "discount_allocated_minor" <= ("unit_price_minor" * "quantity") AND
    "line_total_minor" = ("unit_price_minor" * "quantity") - "discount_allocated_minor" + "tax_amount_minor"
  );
ALTER TABLE "order_status_history"
  ADD CONSTRAINT "order_status_history_transition" CHECK (
    "from_status" IS NULL OR "from_status" <> "to_status"
  );
ALTER TABLE "payment"
  ADD CONSTRAINT "payment_amount_non_negative" CHECK ("amount_minor" >= 0);
ALTER TABLE "payment_attempt"
  ADD CONSTRAINT "payment_attempt_number_positive" CHECK ("attempt_number" > 0);
ALTER TABLE "payment_transaction"
  ADD CONSTRAINT "payment_transaction_amount_positive" CHECK ("amount_minor" > 0);
ALTER TABLE "refund"
  ADD CONSTRAINT "refund_amount_positive" CHECK ("amount_minor" > 0);

-- Shipping and platform invariants.
ALTER TABLE "shipping_zone"
  ADD CONSTRAINT "shipping_zone_priority_non_negative" CHECK ("priority" >= 0);
ALTER TABLE "shipping_method"
  ADD CONSTRAINT "shipping_method_sort_non_negative" CHECK ("sort_order" >= 0);
ALTER TABLE "shipping_rate"
  ADD CONSTRAINT "shipping_rate_values" CHECK (
    "base_minor" >= 0 AND "per_kg_minor" >= 0 AND
    ("free_over_subtotal_minor" IS NULL OR "free_over_subtotal_minor" >= 0) AND
    "min_weight_grams" >= 0 AND
    ("max_weight_grams" IS NULL OR "max_weight_grams" >= "min_weight_grams") AND
    ("valid_to" IS NULL OR "valid_to" > "valid_from")
  );
ALTER TABLE "shipping_quote"
  ADD CONSTRAINT "shipping_quote_values" CHECK (
    "amount_minor" >= 0 AND "estimated_days_min" >= 0 AND
    "estimated_days_max" >= "estimated_days_min" AND "expires_at" > "created_at"
  );
ALTER TABLE "shipment"
  ADD CONSTRAINT "shipment_date_order" CHECK (
    "shipped_at" IS NULL OR "delivered_at" IS NULL OR "delivered_at" >= "shipped_at"
  );
ALTER TABLE "shipment_line"
  ADD CONSTRAINT "shipment_line_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "outbox_event"
  ADD CONSTRAINT "outbox_attempts_non_negative" CHECK ("attempts" >= 0);
ALTER TABLE "idempotency_key"
  ADD CONSTRAINT "idempotency_expiry_after_creation" CHECK ("expires_at" > "created_at"),
  ADD CONSTRAINT "idempotency_response_status" CHECK (
    "response_status" IS NULL OR "response_status" BETWEEN 100 AND 599
  );

-- Query-specific and partial indexes that Prisma cannot express.
CREATE INDEX "product_translation_name_trgm_idx"
  ON "product_translation" USING GIN ("name" gin_trgm_ops);
CREATE UNIQUE INDEX "stock_location_one_default_idx"
  ON "stock_location" ("is_default") WHERE "is_default" = true;
CREATE UNIQUE INDEX "reservation_active_unique"
  ON "stock_reservation" ("variant_id", "checkout_session_id") WHERE "status" = 'ACTIVE';
CREATE INDEX "stock_reservation_active_expiry_idx"
  ON "stock_reservation" ("expires_at") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "coupon_code_ci_idx" ON "coupon" (lower("code"));
CREATE INDEX "order_unpaid_idx" ON "order" ("payment_status") WHERE "payment_status" = 'UNPAID';
CREATE INDEX "payment_reconciliation_idx"
  ON "payment" ("status", "created_at") WHERE "status" IN ('CREATED', 'PENDING');
CREATE INDEX "outbox_unpublished_idx"
  ON "outbox_event" ("published_at", "occurred_at") WHERE "published_at" IS NULL;

-- Immutable and append-only records.
CREATE OR REPLACE FUNCTION reject_append_only_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "stock_ledger_entry_append_only"
  BEFORE UPDATE OR DELETE ON "stock_ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_change();
CREATE TRIGGER "audit_log_append_only"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_change();
CREATE TRIGGER "order_status_history_append_only"
  BEFORE UPDATE OR DELETE ON "order_status_history"
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_change();

CREATE OR REPLACE FUNCTION protect_order_record()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'order records cannot be deleted' USING ERRCODE = '55000';
  END IF;

  IF OLD."number" IS DISTINCT FROM NEW."number"
    OR OLD."checkout_session_id" IS DISTINCT FROM NEW."checkout_session_id"
    OR OLD."user_id" IS DISTINCT FROM NEW."user_id"
    OR OLD."email" IS DISTINCT FROM NEW."email"
    OR OLD."phone" IS DISTINCT FROM NEW."phone"
    OR OLD."locale_at_purchase" IS DISTINCT FROM NEW."locale_at_purchase"
    OR OLD."currency" IS DISTINCT FROM NEW."currency"
    OR OLD."subtotal_minor" IS DISTINCT FROM NEW."subtotal_minor"
    OR OLD."discount_total_minor" IS DISTINCT FROM NEW."discount_total_minor"
    OR OLD."shipping_total_minor" IS DISTINCT FROM NEW."shipping_total_minor"
    OR OLD."tax_total_minor" IS DISTINCT FROM NEW."tax_total_minor"
    OR OLD."grand_total_minor" IS DISTINCT FROM NEW."grand_total_minor"
    OR OLD."coupon_code_snapshot" IS DISTINCT FROM NEW."coupon_code_snapshot"
    OR OLD."shipping_method_snapshot" IS DISTINCT FROM NEW."shipping_method_snapshot"
    OR OLD."shipping_address_snapshot" IS DISTINCT FROM NEW."shipping_address_snapshot"
    OR OLD."billing_address_snapshot" IS DISTINCT FROM NEW."billing_address_snapshot"
    OR OLD."placed_at" IS DISTINCT FROM NEW."placed_at"
    OR OLD."created_at" IS DISTINCT FROM NEW."created_at"
    OR OLD."created_by" IS DISTINCT FROM NEW."created_by"
  THEN
    RAISE EXCEPTION 'immutable order fields cannot be changed' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "order_record_immutable"
  BEFORE UPDATE OR DELETE ON "order"
  FOR EACH ROW EXECUTE FUNCTION protect_order_record();

CREATE OR REPLACE FUNCTION protect_order_line_record()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'order lines are immutable' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "order_line_immutable"
  BEFORE UPDATE OR DELETE ON "order_line"
  FOR EACH ROW EXECUTE FUNCTION protect_order_line_record();

-- Cross-row payment and refund caps.
CREATE OR REPLACE FUNCTION enforce_payment_order_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_amount bigint;
  expected_currency character(3);
BEGIN
  SELECT "grand_total_minor", "currency"
    INTO expected_amount, expected_currency
    FROM "order"
    WHERE "id" = NEW."order_id";

  IF NEW."amount_minor" <> expected_amount OR NEW."currency" <> expected_currency THEN
    RAISE EXCEPTION 'payment amount and currency must match the order' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "payment_matches_order"
  BEFORE INSERT OR UPDATE OF "order_id", "amount_minor", "currency" ON "payment"
  FOR EACH ROW EXECUTE FUNCTION enforce_payment_order_match();

CREATE OR REPLACE FUNCTION enforce_refund_remaining_cap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  payment_amount bigint;
  completed_total bigint;
BEGIN
  SELECT "amount_minor" INTO payment_amount
    FROM "payment" WHERE "id" = NEW."payment_id" FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund payment does not exist' USING ERRCODE = '23503';
  END IF;

  IF NEW."order_id" <> (SELECT "order_id" FROM "payment" WHERE "id" = NEW."payment_id") THEN
    RAISE EXCEPTION 'refund order must match its payment' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM("amount_minor"), 0)
    INTO completed_total
    FROM "refund"
    WHERE "payment_id" = NEW."payment_id"
      AND "status" IN ('REQUESTED', 'PENDING', 'COMPLETED')
      AND "id" <> NEW."id";

  IF NEW."status" IN ('REQUESTED', 'PENDING', 'COMPLETED')
    AND completed_total + NEW."amount_minor" > payment_amount
  THEN
    RAISE EXCEPTION 'refund exceeds remaining refundable amount' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "refund_remaining_cap"
  BEFORE INSERT OR UPDATE OF "payment_id", "order_id", "amount_minor", "status" ON "refund"
  FOR EACH ROW EXECUTE FUNCTION enforce_refund_remaining_cap();


-- Uniform audit columns for mutable and historical records.
ALTER TABLE "auth_credential"
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "session"
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "verification_token"
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "permission"
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "role_permission"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "user_role"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "audit_log"
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "product_translation"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "variant_translation"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "category_translation"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "collection_translation"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "product_category"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "product_collection"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "slug_history"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "media_derivative"
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "product_media"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "apiary_translation"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "batch_allocation"
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "purchase_order_line"
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "goods_receipt"
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "goods_receipt_line"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "stock_ledger_entry"
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "stock_reservation"
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "coupon_redemption"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "cart_line"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "order_line"
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "order_status_history"
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "order_note"
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "payment_attempt"
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "payment_transaction"
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "provider_event"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "shipping_method_translation"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "shipping_quote"
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "shipment_line"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "tracking_event"
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "page_translation"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "article_translation"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "faq_item_translation"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "outbox_event"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "idempotency_key"
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "job_failure"
  ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;


-- Complete actor audit metadata.
ALTER TABLE "role"
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "media_asset"
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "cart"
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "address"
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "checkout_session"
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "return_request"
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "payment"
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "refund"
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "shipping_rate"
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "shipment"
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "updated_by" UUID;
ALTER TABLE "setting"
  ADD COLUMN "created_by" UUID;
ALTER TABLE "feature_flag"
  ADD COLUMN "created_by" UUID;
