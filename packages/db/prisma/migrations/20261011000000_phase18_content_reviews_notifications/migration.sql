CREATE TYPE review_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE notification_channel AS ENUM ('EMAIL', 'SMS');
CREATE TYPE notification_status AS ENUM ('QUEUED', 'SENT', 'FAILED', 'BOUNCED');
CREATE TYPE newsletter_status AS ENUM ('PENDING', 'CONFIRMED', 'UNSUBSCRIBED');

CREATE TABLE product_review (
 id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES product(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 order_id uuid NOT NULL REFERENCES "order"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),
 title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 160),
 body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 5000), locale text NOT NULL,
 status review_status NOT NULL DEFAULT 'PENDING',
 moderated_by uuid REFERENCES "user"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 moderated_at timestamptz(3), created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT review_moderation_shape CHECK ((status = 'PENDING' AND moderated_by IS NULL AND moderated_at IS NULL) OR (status <> 'PENDING' AND moderated_by IS NOT NULL AND moderated_at IS NOT NULL))
);
CREATE UNIQUE INDEX product_review_user_id_product_id_key ON product_review(user_id,product_id);
CREATE INDEX product_review_order_id_idx ON product_review(order_id);
CREATE INDEX product_review_moderated_by_idx ON product_review(moderated_by);
CREATE INDEX product_review_product_id_status_created_at_idx ON product_review(product_id,status,created_at DESC);
CREATE INDEX product_review_status_created_at_idx ON product_review(status,created_at);
CREATE FUNCTION phase18_review_original_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.product_id,NEW.user_id,NEW.order_id,NEW.rating,NEW.title,NEW.body,NEW.locale,NEW.created_at) IS DISTINCT FROM ROW(OLD.product_id,OLD.user_id,OLD.order_id,OLD.rating,OLD.title,OLD.body,OLD.locale,OLD.created_at) THEN
  RAISE EXCEPTION 'review original is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER review_original_immutable BEFORE UPDATE ON product_review FOR EACH ROW EXECUTE FUNCTION phase18_review_original_immutable();

CREATE TABLE notification_template (
 id uuid PRIMARY KEY, code text NOT NULL, locale text NOT NULL, channel notification_channel NOT NULL,
 subject text, body text NOT NULL,
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_by uuid, updated_by uuid
);
CREATE UNIQUE INDEX notification_template_code_locale_channel_key ON notification_template(code,locale,channel);
CREATE TABLE newsletter_subscription (
 id uuid PRIMARY KEY, email citext NOT NULL, locale text NOT NULL,
 status newsletter_status NOT NULL DEFAULT 'PENDING', confirmed_at timestamptz(3), unsubscribed_at timestamptz(3),
 confirmation_hash text, confirmation_expires_at timestamptz(3), confirmation_consumed_at timestamptz(3), unsubscribe_hash text, unsubscribe_expires_at timestamptz(3), request_id uuid NOT NULL,
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT newsletter_confirmation_shape CHECK ((confirmation_hash IS NULL) = (confirmation_expires_at IS NULL)),
 CONSTRAINT newsletter_confirmation_hash_shape CHECK(confirmation_hash IS NULL OR confirmation_hash ~ '^[0-9a-f]{64}$'),
 CONSTRAINT newsletter_unsubscribe_hash_shape CHECK(unsubscribe_hash IS NULL OR unsubscribe_hash ~ '^[0-9a-f]{64}$'),
 CONSTRAINT newsletter_state_shape CHECK ((status = 'PENDING' AND confirmed_at IS NULL AND unsubscribed_at IS NULL) OR (status = 'CONFIRMED' AND confirmed_at IS NOT NULL AND unsubscribed_at IS NULL) OR (status = 'UNSUBSCRIBED' AND unsubscribed_at IS NOT NULL))
);
CREATE UNIQUE INDEX newsletter_subscription_email_key ON newsletter_subscription(email);
CREATE UNIQUE INDEX newsletter_subscription_confirmation_hash_key ON newsletter_subscription(confirmation_hash);
CREATE UNIQUE INDEX newsletter_subscription_unsubscribe_hash_key ON newsletter_subscription(unsubscribe_hash);
CREATE INDEX newsletter_subscription_status_idx ON newsletter_subscription(status);
CREATE TABLE notification_delivery (
 id uuid PRIMARY KEY, dedupe_key text NOT NULL, template_code text NOT NULL, channel notification_channel NOT NULL,
 recipient_hash text NOT NULL CHECK(recipient_hash ~ '^[0-9a-f]{64}$'), locale text NOT NULL,
 status notification_status NOT NULL DEFAULT 'QUEUED', provider_ref text, sent_at timestamptz(3),
 lease_token uuid, lease_until timestamptz(3), attempt_count integer NOT NULL DEFAULT 0,
 subscription_id uuid REFERENCES newsletter_subscription(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT notification_sent_shape CHECK ((status = 'SENT') = (sent_at IS NOT NULL)),
 CONSTRAINT notification_lease_shape CHECK ((lease_token IS NULL) = (lease_until IS NULL))
);
CREATE UNIQUE INDEX notification_delivery_dedupe_key_key ON notification_delivery(dedupe_key);
CREATE INDEX notification_delivery_subscription_id_idx ON notification_delivery(subscription_id);
CREATE INDEX notification_delivery_status_created_at_idx ON notification_delivery(status,created_at);

-- Starting operational copy is DB content. Template edits never overwrite it on seed replay.
INSERT INTO notification_template(id,code,locale,channel,subject,body) VALUES
 (gen_random_uuid(),'shipment-shipped','en','EMAIL','Your order {{orderNumber}} has shipped',E'Your order {{orderNumber}} has shipped.\nTracking number: {{trackingNumber}}\nTracking link: {{trackingUrl}}'),
 (gen_random_uuid(),'shipment-delivered','en','EMAIL','Your order {{orderNumber}} was delivered',E'Your order {{orderNumber}} was delivered.\nTracking number: {{trackingNumber}}\nTracking link: {{trackingUrl}}'),
 (gen_random_uuid(),'shipment-shipped','fa','EMAIL','سفارش {{orderNumber}} ارسال شد',E'سفارش {{orderNumber}} ارسال شده است.\nشماره رهگیری: {{trackingNumber}}\nپیوند رهگیری: {{trackingUrl}}'),
 (gen_random_uuid(),'shipment-delivered','fa','EMAIL','سفارش {{orderNumber}} تحویل داده شد',E'سفارش {{orderNumber}} تحویل داده شده است.\nشماره رهگیری: {{trackingNumber}}\nپیوند رهگیری: {{trackingUrl}}'),
 (gen_random_uuid(),'newsletter-confirm','en','EMAIL','Confirm your newsletter subscription',E'You requested our newsletter. Your subscription is pending.\nOpen this link and explicitly confirm within 24 hours:\n{{actionUrl}}\nIf you did not request this, ignore this message.'),
 (gen_random_uuid(),'newsletter-confirm','fa','EMAIL','تأیید عضویت در خبرنامه',E'عضویت شما در خبرنامه هنوز تأیید نشده است.\nتا ۲۴ ساعت آینده این پیوند را باز کنید و عضویت را تأیید کنید:\n{{actionUrl}}\nاگر این درخواست را نفرستاده‌اید، این پیام را نادیده بگیرید.'),
 (gen_random_uuid(),'newsletter-welcome','en','EMAIL','Your newsletter subscription is confirmed',E'Your newsletter subscription is confirmed.\nYou can unsubscribe by opening this link and confirming the action:\n{{actionUrl}}'),
 (gen_random_uuid(),'newsletter-welcome','fa','EMAIL','عضویت شما در خبرنامه تأیید شد',E'عضویت شما در خبرنامه تأیید شد.\nبرای لغو عضویت، این پیوند را باز کنید و لغو را تأیید کنید:\n{{actionUrl}}'),
 (gen_random_uuid(),'shipment-shipped','en','SMS',NULL,'Your order {{orderNumber}} has shipped. Tracking: {{trackingNumber}}'),
 (gen_random_uuid(),'shipment-delivered','en','SMS',NULL,'Your order {{orderNumber}} was delivered.'),
 (gen_random_uuid(),'shipment-shipped','fa','SMS',NULL,'سفارش {{orderNumber}} ارسال شد. رهگیری: {{trackingNumber}}'),
 (gen_random_uuid(),'shipment-delivered','fa','SMS',NULL,'سفارش {{orderNumber}} تحویل داده شد.');

-- Carry successful Phase 15/16 delivery identities forward without another send.
INSERT INTO notification_delivery(id,dedupe_key,template_code,channel,recipient_hash,locale,status,sent_at,attempt_count)
 SELECT gen_random_uuid(), 'fulfilment:' || d.shipment_id || ':' || d.event_type,
 CASE d.event_type WHEN 'SHIPPED' THEN 'shipment-shipped' ELSE 'shipment-delivered' END,
 'EMAIL'::notification_channel, encode(digest(lower(o.email::text),'sha256'),'hex'),o.locale_at_purchase,
 'SENT'::notification_status,d.sent_at,d.attempt_count
 FROM fulfilment_email_delivery d JOIN shipment s ON s.id=d.shipment_id JOIN "order" o ON o.id=s.order_id
 WHERE d.sent_at IS NOT NULL AND d.event_type IN ('SHIPPED','DELIVERED');
