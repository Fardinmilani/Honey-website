-- Human-approved Phase 17 permission: notes do not confer shipment or money access.
BEGIN;

INSERT INTO "permission" ("id", "code")
VALUES ('018f0000-0000-7000-8000-000000001114', 'order:note')
ON CONFLICT ("code") DO NOTHING;

WITH grants (role_code, grant_id) AS (
  VALUES
    ('OWNER', '018f0000-0000-7000-8000-000000002200'::uuid),
    ('ADMIN', '018f0000-0000-7000-8000-000000002201'::uuid),
    ('ORDER_MANAGER', '018f0000-0000-7000-8000-000000002202'::uuid),
    ('SUPPORT', '018f0000-0000-7000-8000-000000002203'::uuid)
)
INSERT INTO "role_permission" ("id", "role_id", "permission_id")
SELECT grants.grant_id, "role"."id", "permission"."id"
FROM grants
JOIN "role" ON "role"."code" = grants.role_code
JOIN "permission" ON "permission"."code" = 'order:note'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- A privilege change requires a new login; live sessions never inherit a grant.
UPDATE "session"
SET "revoked_at" = CURRENT_TIMESTAMP, "updated_at" = CURRENT_TIMESTAMP
WHERE "kind" = 'STAFF' AND "revoked_at" IS NULL
  AND "user_id" IN (
    SELECT "user_role"."user_id"
    FROM "user_role"
    JOIN "role" ON "role"."id" = "user_role"."role_id"
    WHERE "role"."code" IN ('OWNER', 'ADMIN', 'ORDER_MANAGER', 'SUPPORT')
  );

COMMIT;
