-- Customer reviews have a dedicated capability. Staff order-reading authority
-- is never granted to customers. Ownership and delivery are checked separately.
INSERT INTO permission(id, code)
VALUES ('018f0000-0000-7000-8000-000000001115', 'review:submit')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permission(id, role_id, permission_id)
SELECT '018f0000-0000-7000-8000-000000002300', r.id, p.id
FROM role r CROSS JOIN permission p
WHERE r.code = 'CUSTOMER' AND p.code = 'review:submit'
ON CONFLICT (role_id, permission_id) DO NOTHING;
