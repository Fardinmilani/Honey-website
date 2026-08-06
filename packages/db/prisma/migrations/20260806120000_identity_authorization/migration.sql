-- Phase 6 identity and authorization expansion. The accepted foundation migration is immutable.

ALTER TABLE "auth_credential"
  ALTER COLUMN "secret_hash" DROP NOT NULL,
  ADD COLUMN "encrypted_secret" BYTEA,
  ADD COLUMN "secret_nonce" BYTEA,
  ADD COLUMN "secret_tag" BYTEA,
  ADD COLUMN "last_accepted_step" BIGINT;

ALTER TABLE "auth_credential"
  ADD CONSTRAINT "auth_credential_secret_shape" CHECK (
    (
      "type" IN ('PASSWORD', 'RECOVERY_CODE')
      AND "secret_hash" IS NOT NULL
      AND length("secret_hash") > 0
      AND "encrypted_secret" IS NULL
      AND "secret_nonce" IS NULL
      AND "secret_tag" IS NULL
      AND "last_accepted_step" IS NULL
    )
    OR
    (
      "type" = 'TOTP'
      AND "secret_hash" IS NULL
      AND "encrypted_secret" IS NOT NULL
      AND "secret_nonce" IS NOT NULL
      AND "secret_tag" IS NOT NULL
      AND octet_length("encrypted_secret") > 0
      AND octet_length("secret_nonce") = 12
      AND octet_length("secret_tag") = 16
    )
  );

CREATE UNIQUE INDEX "auth_credential_single_primary_type_idx"
  ON "auth_credential" ("user_id", "type")
  WHERE "type" IN ('PASSWORD', 'TOTP');

ALTER TABLE "session"
  ADD COLUMN "absolute_expires_at" TIMESTAMPTZ(3);

UPDATE "session"
SET "absolute_expires_at" = "expires_at"
WHERE "absolute_expires_at" IS NULL;

ALTER TABLE "session"
  ALTER COLUMN "absolute_expires_at" SET NOT NULL,
  ADD CONSTRAINT "session_expiry_order" CHECK (
    "expires_at" > "created_at"
    AND "absolute_expires_at" >= "expires_at"
  );

CREATE INDEX "session_active_lookup_idx"
  ON "session" ("user_id", "revoked_at", "expires_at", "absolute_expires_at");

ALTER TABLE "audit_log"
  ALTER COLUMN "request_id" TYPE TEXT USING "request_id"::text;
