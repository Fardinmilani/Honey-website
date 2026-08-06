import assert from 'node:assert/strict';

import type { Client } from 'pg';

import { seedIds } from '../seed/data.js';

const testIds = {
  cart: '018f0000-0001-7000-8000-000000000001',
  checkout: '018f0000-0001-7000-8000-000000000002',
  order: '018f0000-0001-7000-8000-000000000003',
  orderLine: '018f0000-0001-7000-8000-000000000004',
  payment: '018f0000-0001-7000-8000-000000000005',
  coupon: '018f0000-0001-7000-8000-000000000006',
  providerEvent: '018f0000-0001-7000-8000-000000000007',
  idempotency: '018f0000-0001-7000-8000-000000000008',
  reservation: '018f0000-0001-7000-8000-000000000009',
  audit: '018f0000-0001-7000-8000-00000000000a',
  statusHistory: '018f0000-0001-7000-8000-00000000000b',
  product: '018f0000-0001-7000-8000-00000000000c',
  passwordCredential: '018f0000-0001-7000-8000-00000000000d',
  mediaAsset: '018f0000-0001-7000-8000-00000000000e',
} as const;

function databaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = error.code;
  return typeof code === 'string' ? code : undefined;
}

async function expectDatabaseRejection(
  client: Client,
  name: string,
  expectedCodes: readonly string[],
  operation: () => Promise<unknown>,
): Promise<void> {
  await client.query('BEGIN');
  let caught: unknown;
  try {
    await operation();
  } catch (error) {
    caught = error;
  } finally {
    await client.query('ROLLBACK');
  }
  assert.notEqual(caught, undefined, `${name} was accepted by PostgreSQL`);
  const code = databaseErrorCode(caught);
  assert.ok(
    expectedCodes.includes(code ?? ''),
    `${name} returned unexpected SQLSTATE ${code ?? 'none'}`,
  );
}

async function createValidTestRecords(client: Client): Promise<void> {
  await client.query(
    `INSERT INTO "auth_credential" ("id", "user_id", "type", "secret_hash")
     VALUES ($1, $2, 'PASSWORD', '$argon2id$test-fixture-only')`,
    [testIds.passwordCredential, seedIds.ownerUser],
  );
  await client.query(
    `INSERT INTO "cart" ("id", "anonymous_id", "currency", "locale", "expires_at")
     VALUES ($1, 'phase4-browser', 'IRR', 'en', now() + interval '1 hour')`,
    [testIds.cart],
  );
  await client.query(
    `INSERT INTO "checkout_session" ("id", "cart_id", "email", "idempotency_key")
     VALUES ($1, $2, 'customer@example.invalid', 'checkout-phase4')`,
    [testIds.checkout, testIds.cart],
  );
  await client.query(
    `INSERT INTO "order" (
       "id", "number", "checkout_session_id", "email", "locale_at_purchase", "currency",
       "subtotal_minor", "discount_total_minor", "shipping_total_minor", "tax_total_minor",
       "grand_total_minor", "shipping_method_snapshot", "shipping_address_snapshot", "billing_address_snapshot"
     ) VALUES ($1, 'HNY-TEST-0001', $2, 'customer@example.invalid', 'en', 'IRR',
       1000, 0, 0, 0, 1000, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)`,
    [testIds.order, testIds.checkout],
  );
  await client.query(
    `INSERT INTO "order_line" (
       "id", "order_id", "product_id", "variant_id", "sku_snapshot",
       "product_name_snapshot", "variant_name_snapshot", "attributes_snapshot",
       "quantity", "unit_price_minor", "discount_allocated_minor", "tax_rate_bps",
       "tax_amount_minor", "line_total_minor"
     ) VALUES ($1, $2, $3, $4, 'HNY-WILD-450', '{"en":"Wildflower Honey"}'::jsonb,
       '{"en":"450 g jar"}'::jsonb, '{}'::jsonb, 1, 1000, 0, 0, 0, 1000)`,
    [testIds.orderLine, testIds.order, seedIds.ownProduct, seedIds.ownVariant],
  );
  await client.query(
    `INSERT INTO "payment" ("id", "order_id", "provider", "amount_minor", "currency", "provider_ref", "idempotency_key")
     VALUES ($1, $2, 'fixture', 1000, 'IRR', 'provider-ref-1', 'payment-phase4')`,
    [testIds.payment, testIds.order],
  );
  await client.query(
    `INSERT INTO "coupon" ("id", "code", "type", "value", "currency", "starts_at")
     VALUES ($1, 'PHASE4', 'FIXED', 100, 'IRR', now())`,
    [testIds.coupon],
  );
  await client.query(
    `INSERT INTO "provider_event" ("id", "provider", "event_id", "type", "signature_valid", "raw_body")
     VALUES ($1, 'fixture', 'event-1', 'payment.updated', true, '{}'::jsonb)`,
    [testIds.providerEvent],
  );
  await client.query(
    `INSERT INTO "idempotency_key" ("id", "key", "scope", "request_hash", "expires_at")
     VALUES ($1, 'shared-key', 'checkout.confirm', 'hash-1', now() + interval '1 day')`,
    [testIds.idempotency],
  );
  await client.query(
    `INSERT INTO "stock_reservation" (
       "id", "variant_id", "stock_location_id", "quantity", "cart_id", "checkout_session_id", "status", "expires_at"
     ) VALUES ($1, $2, $3, 1, $4, $5, 'ACTIVE', now() + interval '15 minutes')`,
    [testIds.reservation, seedIds.ownVariant, seedIds.location, testIds.cart, testIds.checkout],
  );
  await client.query(
    `INSERT INTO "audit_log" ("id", "action", "subject_type", "subject_id")
     VALUES ($1, 'phase4.proof', 'order', $2)`,
    [testIds.audit, testIds.order],
  );
  await client.query(
    `INSERT INTO "order_status_history" ("id", "order_id", "to_status", "reason")
     VALUES ($1, $2, 'PENDING_PAYMENT', 'created')`,
    [testIds.statusHistory, testIds.order],
  );
  await client.query(
    `INSERT INTO "product" ("id", "status", "sourcing_type") VALUES ($1, 'DRAFT', 'OWN_PRODUCTION')`,
    [testIds.product],
  );
}

export async function runConstraintTests(client: Client): Promise<number> {
  await createValidTestRecords(client);
  const cases: ReadonlyArray<readonly [string, readonly string[], () => Promise<unknown>]> = [
    [
      'invalid trusted media shape',
      ['23514'],
      () =>
        client.query(
          `INSERT INTO "media_asset" (
             "id", "kind", "visibility", "storage_key", "mime_type", "bytes", "width", "height", "checksum", "created_by"
           ) VALUES ($1, 'IMAGE', 'PUBLIC', 'media/invalid/original.jpg', 'image/jpeg', 0, 10, 10, $2, $3)`,
          [testIds.mediaAsset, 'a'.repeat(64), seedIds.ownerUser],
        ),
    ],
    [
      'unsafe media storage key',
      ['23514'],
      () =>
        client.query(
          `INSERT INTO "media_asset" (
             "id", "kind", "visibility", "storage_key", "mime_type", "bytes", "checksum", "created_by"
           ) VALUES ($1, 'VIDEO', 'PRIVATE', '../hero/honey-scroll.mp4', 'video/mp4', 10, $2, $3)`,
          [testIds.mediaAsset, 'b'.repeat(64), seedIds.ownerUser],
        ),
    ],
    [
      'password credential without a hash',
      ['23514'],
      () =>
        client.query(`UPDATE "auth_credential" SET "secret_hash" = NULL WHERE "id" = $1`, [
          testIds.passwordCredential,
        ]),
    ],
    [
      'incomplete encrypted TOTP credential',
      ['23514'],
      () =>
        client.query(
          `INSERT INTO "auth_credential" ("id", "user_id", "type", "encrypted_secret")
           VALUES ('018f0000-0002-7000-8000-00000000000f', $1, 'TOTP', decode('00', 'hex'))`,
          [seedIds.ownerUser],
        ),
    ],
    [
      'duplicate password credential for one user',
      ['23505'],
      () =>
        client.query(
          `INSERT INTO "auth_credential" ("id", "user_id", "type", "secret_hash")
           VALUES ('018f0000-0002-7000-8000-000000000010', $1, 'PASSWORD', '$argon2id$duplicate')`,
          [seedIds.ownerUser],
        ),
    ],
    [
      'session idle expiry beyond absolute expiry',
      ['23514'],
      () =>
        client.query(
          `INSERT INTO "session" (
             "id", "user_id", "kind", "token_hash", "expires_at", "absolute_expires_at"
           ) VALUES (
             '018f0000-0002-7000-8000-000000000011', $1, 'STAFF', 'phase6-invalid-session',
             now() + interval '13 hours', now() + interval '12 hours'
           )`,
          [seedIds.ownerUser],
        ),
    ],
    [
      'negative inventory',
      ['23514'],
      () =>
        client.query('UPDATE "inventory_item" SET "on_hand" = -1 WHERE "id" = $1', [
          seedIds.ownInventory,
        ]),
    ],
    [
      'invalid sourcing shape',
      ['23514'],
      () =>
        client.query(
          `INSERT INTO "harvest_batch" (
          "id", "batch_code", "sourcing_type", "apiary_id", "supplier_id", "harvest_season", "harvest_year", "quantity_grams"
        ) VALUES ('018f0000-0002-7000-8000-000000000001', 'BAD-SOURCE', 'OWN_PRODUCTION', $1, $2, 'spring', 2026, 1)`,
          [seedIds.apiary, seedIds.supplier],
        ),
    ],
    [
      'non-positive cart quantity',
      ['23514'],
      () =>
        client.query(
          `INSERT INTO "cart_line" ("id", "cart_id", "variant_id", "quantity")
         VALUES ('018f0000-0002-7000-8000-000000000002', $1, $2, 0)`,
          [testIds.cart, seedIds.ownVariant],
        ),
    ],
    [
      'negative price',
      ['23514'],
      () =>
        client.query(
          `INSERT INTO "variant_price" ("id", "variant_id", "currency", "amount_minor", "valid_from")
         VALUES ('018f0000-0002-7000-8000-000000000003', $1, 'IRR', -1, now() + interval '1 day')`,
          [seedIds.ownVariant],
        ),
    ],
    [
      'invalid price window',
      ['23514'],
      () =>
        client.query(
          `INSERT INTO "variant_price" ("id", "variant_id", "currency", "amount_minor", "valid_from", "valid_to")
         VALUES ('018f0000-0002-7000-8000-000000000004', $1, 'IRR', 1, now() + interval '2 days', now() + interval '1 day')`,
          [seedIds.ownVariant],
        ),
    ],
    [
      'invalid compare-at price',
      ['23514'],
      () =>
        client.query(
          `INSERT INTO "variant_price" ("id", "variant_id", "currency", "amount_minor", "compare_at_minor", "valid_from")
         VALUES ('018f0000-0002-7000-8000-000000000005', $1, 'IRR', 10, 9, now() + interval '3 days')`,
          [seedIds.ownVariant],
        ),
    ],
    [
      'basis points out of range',
      ['23514'],
      () =>
        client.query(
          `INSERT INTO "tax_rate" ("id", "code", "name", "rate_bps", "country")
         VALUES ('018f0000-0002-7000-8000-000000000006', 'BAD-BPS', 'Bad', 10001, 'IR')`,
        ),
    ],
    [
      'duplicate active reservation',
      ['23505'],
      () =>
        client.query(
          `INSERT INTO "stock_reservation" (
          "id", "variant_id", "stock_location_id", "quantity", "checkout_session_id", "status", "expires_at"
        ) VALUES ('018f0000-0002-7000-8000-000000000007', $1, $2, 1, $3, 'ACTIVE', now() + interval '15 minutes')`,
          [seedIds.ownVariant, seedIds.location, testIds.checkout],
        ),
    ],
    [
      'case-insensitive coupon duplicate',
      ['23505'],
      () =>
        client.query(
          `INSERT INTO "coupon" ("id", "code", "type", "value", "currency", "starts_at")
         VALUES ('018f0000-0002-7000-8000-000000000008', 'phase4', 'FIXED', 1, 'IRR', now())`,
        ),
    ],
    [
      'duplicate SKU',
      ['23505'],
      () =>
        client.query(
          `INSERT INTO "product_variant" (
          "id", "product_id", "sku", "net_weight_grams", "jar_size_label_key", "packaging_type_key", "weight_grams_shipping", "dimensions_mm"
        ) VALUES ('018f0000-0002-7000-8000-000000000009', $1, 'HNY-WILD-450', 1, 'jar.1g', 'packaging.glass', 1, ARRAY[1,1,1])`,
          [testIds.product],
        ),
    ],
    [
      'duplicate parent locale',
      ['23505'],
      () =>
        client.query(
          `INSERT INTO "product_translation" ("id", "product_id", "locale", "name", "slug")
         VALUES ('018f0000-0002-7000-8000-00000000000a', $1, 'en', 'Duplicate', 'duplicate-parent')`,
          [seedIds.ownProduct],
        ),
    ],
    [
      'duplicate locale slug',
      ['23505'],
      () =>
        client.query(
          `INSERT INTO "product_translation" ("id", "product_id", "locale", "name", "slug")
         VALUES ('018f0000-0002-7000-8000-00000000000b', $1, 'en', 'Duplicate slug', 'wildflower-honey')`,
          [testIds.product],
        ),
    ],
    [
      'duplicate order number',
      ['23505'],
      () =>
        client.query(
          `INSERT INTO "order" (
          "id", "number", "email", "locale_at_purchase", "currency", "subtotal_minor", "grand_total_minor",
          "shipping_method_snapshot", "shipping_address_snapshot", "billing_address_snapshot"
        ) VALUES ('018f0000-0002-7000-8000-00000000000c', 'HNY-TEST-0001', 'other@example.invalid',
          'en', 'IRR', 0, 0, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)`,
        ),
    ],
    [
      'provider event replay',
      ['23505'],
      () =>
        client.query(
          `INSERT INTO "provider_event" ("id", "provider", "event_id", "type", "signature_valid", "raw_body")
         VALUES ('018f0000-0002-7000-8000-00000000000d', 'fixture', 'event-1', 'payment.updated', true, '{}'::jsonb)`,
        ),
    ],
    [
      'idempotency scope duplicate',
      ['23505'],
      () =>
        client.query(
          `INSERT INTO "idempotency_key" ("id", "key", "scope", "request_hash", "expires_at")
         VALUES ('018f0000-0002-7000-8000-00000000000e', 'shared-key', 'checkout.confirm', 'hash-2', now() + interval '1 day')`,
        ),
    ],
    [
      'order total mismatch',
      ['23514'],
      () =>
        client.query(
          `INSERT INTO "order" (
          "id", "number", "email", "locale_at_purchase", "currency", "subtotal_minor", "grand_total_minor",
          "shipping_method_snapshot", "shipping_address_snapshot", "billing_address_snapshot"
        ) VALUES ('018f0000-0002-7000-8000-00000000000f', 'HNY-TEST-0002', 'other@example.invalid',
          'en', 'IRR', 100, 99, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)`,
        ),
    ],
    [
      'payment amount mismatch',
      ['23514'],
      () =>
        client.query(
          `INSERT INTO "payment" ("id", "order_id", "provider", "amount_minor", "currency", "provider_ref", "idempotency_key")
         VALUES ('018f0000-0002-7000-8000-000000000010', $1, 'other', 999, 'IRR', 'other-ref', 'other-key')`,
          [testIds.order],
        ),
    ],
    [
      'refund cap',
      ['23514'],
      () =>
        client.query(
          `INSERT INTO "refund" ("id", "order_id", "payment_id", "amount_minor", "reason")
         VALUES ('018f0000-0002-7000-8000-000000000011', $1, $2, 1001, 'fixture')`,
          [testIds.order, testIds.payment],
        ),
    ],
    [
      'order snapshot mutation',
      ['55000'],
      () =>
        client.query('UPDATE "order" SET "email" = $1 WHERE "id" = $2', [
          'changed@example.invalid',
          testIds.order,
        ]),
    ],
    [
      'order line mutation',
      ['55000'],
      () =>
        client.query('UPDATE "order_line" SET "quantity" = 2 WHERE "id" = $1', [testIds.orderLine]),
    ],
    [
      'stock ledger update',
      ['55000'],
      () =>
        client.query('UPDATE "stock_ledger_entry" SET "note" = $1 WHERE "id" = $2', [
          'changed',
          seedIds.ownLedger,
        ]),
    ],
    [
      'stock ledger delete',
      ['55000'],
      () => client.query('DELETE FROM "stock_ledger_entry" WHERE "id" = $1', [seedIds.ownLedger]),
    ],
    [
      'audit update',
      ['55000'],
      () =>
        client.query('UPDATE "audit_log" SET "action" = $1 WHERE "id" = $2', [
          'changed',
          testIds.audit,
        ]),
    ],
    [
      'status history delete',
      ['55000'],
      () =>
        client.query('DELETE FROM "order_status_history" WHERE "id" = $1', [testIds.statusHistory]),
    ],
  ];

  for (const [name, expectedCodes, operation] of cases) {
    await expectDatabaseRejection(client, name, expectedCodes, operation);
  }
  return cases.length;
}
