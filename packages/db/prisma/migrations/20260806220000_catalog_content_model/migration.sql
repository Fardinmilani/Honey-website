-- Phase 8 catalog invariants, normalized PostgreSQL search, and stable pagination indexes.

ALTER TABLE "product_translation"
  ADD CONSTRAINT "product_translation_lengths" CHECK (
    char_length("name") BETWEEN 1 AND 200 AND
    char_length("slug") BETWEEN 1 AND 160 AND
    ("short_description" IS NULL OR char_length("short_description") <= 500) AND
    ("description" IS NULL OR char_length("description") <= 5000) AND
    ("tasting_notes" IS NULL OR char_length("tasting_notes") <= 1000) AND
    ("pairing_suggestions" IS NULL OR char_length("pairing_suggestions") <= 1000) AND
    ("story_html" IS NULL OR char_length("story_html") <= 20000) AND
    ("meta_title" IS NULL OR char_length("meta_title") <= 70) AND
    ("meta_description" IS NULL OR char_length("meta_description") <= 170)
  );

ALTER TABLE "variant_translation"
  ADD CONSTRAINT "variant_translation_name_length" CHECK (char_length("name") BETWEEN 1 AND 160);

ALTER TABLE "category_translation"
  ADD CONSTRAINT "category_translation_lengths" CHECK (
    char_length("name") BETWEEN 1 AND 160 AND char_length("slug") BETWEEN 1 AND 160 AND
    ("description" IS NULL OR char_length("description") <= 2000) AND
    ("meta_title" IS NULL OR char_length("meta_title") <= 70) AND
    ("meta_description" IS NULL OR char_length("meta_description") <= 170)
  );

ALTER TABLE "collection_translation"
  ADD CONSTRAINT "collection_translation_lengths" CHECK (
    char_length("name") BETWEEN 1 AND 160 AND char_length("slug") BETWEEN 1 AND 160 AND
    ("description" IS NULL OR char_length("description") <= 2000) AND
    ("meta_title" IS NULL OR char_length("meta_title") <= 70) AND
    ("meta_description" IS NULL OR char_length("meta_description") <= 170)
  );

ALTER TABLE "product_variant"
  ADD CONSTRAINT "product_variant_catalog_bounds" CHECK (
    "net_weight_grams" BETWEEN 1 AND 100000 AND
    "weight_grams_shipping" BETWEEN 1 AND 200000 AND
    cardinality("dimensions_mm") = 3 AND
    "dimensions_mm"[1] BETWEEN 1 AND 10000 AND
    "dimensions_mm"[2] BETWEEN 1 AND 10000 AND
    "dimensions_mm"[3] BETWEEN 1 AND 10000 AND
    "position" BETWEEN 0 AND 10000 AND
    ("barcode" IS NULL OR "barcode" ~ '^[0-9]{8,14}$')
  );

ALTER TABLE "product_collection"
  ADD CONSTRAINT "product_collection_position_bounds" CHECK ("position" BETWEEN 0 AND 10000);

WITH RECURSIVE category_paths AS (
  SELECT c.id, c.parent_id, ('/' || c.id::text)::text AS path
  FROM category c
  WHERE c.parent_id IS NULL
  UNION ALL
  SELECT child.id, child.parent_id, (parent.path || '/' || child.id::text)::text
  FROM category child
  JOIN category_paths parent ON parent.id = child.parent_id
)
UPDATE category c SET path = category_paths.path
FROM category_paths WHERE category_paths.id = c.id;

ALTER TABLE "category"
  ADD CONSTRAINT "category_not_self_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id"),
  ADD CONSTRAINT "category_path_shape" CHECK ("path" ~ '^/[0-9a-f-]{36}(/[0-9a-f-]{36})*$');

CREATE UNIQUE INDEX "product_variant_one_default_per_product_idx"
  ON "product_variant" ("product_id")
  WHERE "is_default" = true AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX "product_collection_collection_id_position_key"
  ON "product_collection" ("collection_id", "position");

CREATE UNIQUE INDEX "product_media_product_asset_role_without_variant_idx"
  ON "product_media" ("product_id", "media_asset_id", "role")
  WHERE "variant_id" IS NULL;

CREATE UNIQUE INDEX "product_media_product_variant_asset_role_idx"
  ON "product_media" ("product_id", "variant_id", "media_asset_id", "role")
  WHERE "variant_id" IS NOT NULL;

CREATE INDEX "product_public_cursor_idx"
  ON "product" ("published_at" DESC, "id" DESC)
  WHERE "status" = 'PUBLISHED' AND "deleted_at" IS NULL;

CREATE INDEX "product_sort_weight_cursor_idx"
  ON "product" ("sort_weight", "id")
  WHERE "status" = 'PUBLISHED' AND "deleted_at" IS NULL;

CREATE OR REPLACE FUNCTION honey_catalog_normalize(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(unaccent(translate(normalize(input, NFC), 'يىكـ', 'ییک'))),
          '[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]', '', 'g'
        ),
        E'[\u200C\u200D]', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  )
$$;

DROP INDEX IF EXISTS "product_translation_name_trgm_idx";
CREATE OR REPLACE FUNCTION honey_catalog_search_document(
  name text,
  short_description text,
  description text,
  tasting_notes text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT honey_catalog_normalize(
    coalesce(name, '') || ' ' || coalesce(short_description, '') || ' ' ||
    coalesce(description, '') || ' ' || coalesce(tasting_notes, '')
  )
$$;

CREATE INDEX "product_translation_catalog_search_idx"
  ON "product_translation" USING GIN (
    honey_catalog_search_document("name", "short_description", "description", "tasting_notes") gin_trgm_ops
  );

CREATE OR REPLACE FUNCTION honey_catalog_validate_default_variant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.default_variant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM product_variant v
    WHERE v.id = NEW.default_variant_id
      AND v.product_id = NEW.id
      AND v.deleted_at IS NULL
      AND v.status <> 'ARCHIVED'
  ) THEN
    RAISE EXCEPTION 'default variant must be an active variant owned by the product'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER product_default_variant_owner_trigger
BEFORE INSERT OR UPDATE OF "default_variant_id" ON "product"
FOR EACH ROW EXECUTE FUNCTION honey_catalog_validate_default_variant();

CREATE OR REPLACE FUNCTION honey_catalog_validate_product_media_variant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.variant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM product_variant v
    WHERE v.id = NEW.variant_id AND v.product_id = NEW.product_id AND v.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'product media variant must belong to the same product'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER product_media_variant_owner_trigger
BEFORE INSERT OR UPDATE OF "product_id", "variant_id" ON "product_media"
FOR EACH ROW EXECUTE FUNCTION honey_catalog_validate_product_media_variant();

CREATE OR REPLACE FUNCTION honey_catalog_validate_category_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM category parent
    WHERE parent.id = NEW.parent_id
      AND (parent.id = NEW.id OR parent.path = OLD.path OR parent.path LIKE OLD.path || '/%')
  ) THEN
    RAISE EXCEPTION 'category hierarchy cycle'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER category_parent_cycle_trigger
BEFORE UPDATE OF "parent_id" ON "category"
FOR EACH ROW EXECUTE FUNCTION honey_catalog_validate_category_parent();

CREATE OR REPLACE FUNCTION honey_catalog_validate_primary_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE product_id_to_check uuid;
DECLARE primary_id_to_check uuid;
BEGIN
  product_id_to_check := COALESCE(NEW.id, OLD.id);
  SELECT primary_category_id INTO primary_id_to_check FROM product WHERE id = product_id_to_check;
  IF primary_id_to_check IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM product_category pc
    JOIN category c ON c.id = pc.category_id
    WHERE pc.product_id = product_id_to_check
      AND pc.category_id = primary_id_to_check
      AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'primary category must be an active product category'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER product_primary_membership_trigger
AFTER INSERT OR UPDATE OF "primary_category_id" ON "product"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION honey_catalog_validate_primary_membership();

CREATE OR REPLACE FUNCTION honey_catalog_validate_membership_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM product p
    WHERE p.id = OLD.product_id AND p.primary_category_id = OLD.category_id
  ) THEN
    RAISE EXCEPTION 'primary category membership cannot be removed'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END
$$;

CREATE TRIGGER product_category_primary_delete_trigger
BEFORE DELETE ON "product_category"
FOR EACH ROW EXECUTE FUNCTION honey_catalog_validate_membership_delete();
