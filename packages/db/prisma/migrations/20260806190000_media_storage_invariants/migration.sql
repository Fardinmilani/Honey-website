-- Phase 7 media and storage invariants. Earlier accepted migrations remain immutable.

CREATE TYPE "media_kind" AS ENUM ('IMAGE', 'VIDEO');
CREATE TYPE "media_visibility" AS ENUM ('PUBLIC', 'PRIVATE');

ALTER TABLE "media_asset"
  ADD COLUMN "kind" "media_kind" NOT NULL,
  ADD COLUMN "visibility" "media_visibility" NOT NULL;

ALTER TABLE "media_derivative"
  ADD COLUMN "mime_type" TEXT NOT NULL,
  ADD COLUMN "height" INTEGER NOT NULL,
  ADD COLUMN "bytes" BIGINT NOT NULL,
  ADD COLUMN "checksum" TEXT NOT NULL;

ALTER TABLE "media_asset"
  ADD CONSTRAINT "media_asset_bytes_positive" CHECK ("bytes" > 0),
  ADD CONSTRAINT "media_asset_dimensions" CHECK (
    ("kind" = 'IMAGE' AND "width" IS NOT NULL AND "height" IS NOT NULL AND "width" > 0 AND "height" > 0 AND "duration_seconds" IS NULL)
    OR
    ("kind" = 'VIDEO' AND "width" IS NULL AND "height" IS NULL AND "duration_seconds" IS NULL)
  ),
  ADD CONSTRAINT "media_asset_mime_type" CHECK (
    ("kind" = 'IMAGE' AND "mime_type" IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif'))
    OR
    ("kind" = 'VIDEO' AND "mime_type" IN ('video/mp4', 'video/webm'))
  ),
  ADD CONSTRAINT "media_asset_checksum" CHECK ("checksum" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "media_asset_storage_key" CHECK (
    length("storage_key") BETWEEN 1 AND 512
    AND "storage_key" !~ '(^/|\\|\.\.|//)'
    AND lower("storage_key") !~ '(^|/)hero(/|$)|honey-scroll|honey-poster|hero-start|hero-end'
    AND (
      ("visibility" = 'PUBLIC' AND "storage_key" LIKE 'media/%')
      OR ("visibility" = 'PRIVATE' AND "storage_key" LIKE 'private/%')
    )
  );

ALTER TABLE "media_derivative"
  ADD CONSTRAINT "media_derivative_dimensions" CHECK ("width" > 0 AND "height" > 0),
  ADD CONSTRAINT "media_derivative_bytes_positive" CHECK ("bytes" > 0),
  ADD CONSTRAINT "media_derivative_mime_format" CHECK (
    ("format" = 'webp' AND "mime_type" = 'image/webp')
    OR ("format" = 'jpg' AND "mime_type" = 'image/jpeg')
  ),
  ADD CONSTRAINT "media_derivative_variant" CHECK ("variant" IN ('thumb', 'card', 'hero', 'og')),
  ADD CONSTRAINT "media_derivative_checksum" CHECK ("checksum" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "media_derivative_storage_key" CHECK (
    length("storage_key") BETWEEN 1 AND 512
    AND "storage_key" !~ '(^/|\\|\.\.|//)'
    AND lower("storage_key") !~ '(^|/)hero(/|$)|honey-scroll|honey-poster|hero-start|hero-end'
    AND ("storage_key" LIKE 'media/%' OR "storage_key" LIKE 'private/%')
  );

CREATE INDEX "media_asset_visibility_created_idx"
  ON "media_asset" ("visibility", "created_at" DESC);
