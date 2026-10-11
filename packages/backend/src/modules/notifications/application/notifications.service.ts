import { createHash, randomBytes } from 'node:crypto';
import {
  DependencyUnavailableAppError,
  ForbiddenAppError,
  ValidationAppError,
} from '../../../errors/index.js';
import {
  adminIdentifier,
  adminPageInput,
  type AdminPageInput,
} from '../../../platform/domain/admin-page.js';
import type { AuthenticatedPrincipal, RequestMetadata } from '../../identity/index.js';
import type {
  FulfilmentNotification,
  FulfilmentNotificationKind,
  FulfilmentService,
} from '../../fulfilment/index.js';
import {
  renderTemplate,
  validateTemplate,
  TEMPLATE_VARIABLES,
  type Template,
} from '../domain/templates.js';
import type {
  MailSender,
  NotificationsRepository,
  DeliveryInput,
} from '../domain/notifications.js';
function hash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
function admin(principal: AuthenticatedPrincipal, permission: 'content:read' | 'content:write') {
  if (principal.kind !== 'STAFF' || !principal.permissions.includes(permission))
    throw new ForbiddenAppError();
}
export class NotificationsService {
  constructor(
    private readonly repository: NotificationsRepository,
    private readonly sender: MailSender,
    private readonly siteOrigin: string,
    private readonly locales: readonly string[],
  ) {}
  async listTemplates(principal: AuthenticatedPrincipal, page: AdminPageInput) {
    admin(principal, 'content:read');
    const result = await this.repository.listTemplates(adminPageInput(page));
    return {
      ...result,
      items: result.items.map((template) => ({
        ...template,
        allowedVariables: TEMPLATE_VARIABLES[template.code],
        complete:
          template.body.trim().length > 0 &&
          (template.channel === 'SMS' || (template.subject ?? '').trim().length > 0),
      })),
    };
  }
  saveTemplate(principal: AuthenticatedPrincipal, input: Template, metadata: RequestMetadata) {
    admin(principal, 'content:write');
    const template = validateTemplate(input, this.locales);
    return this.repository.saveTemplate(template, { principal, metadata });
  }
  preview(principal: AuthenticatedPrincipal, input: Template) {
    admin(principal, 'content:read');
    const template = validateTemplate(input, this.locales);
    const variables = Object.fromEntries(
      TEMPLATE_VARIABLES[template.code].map((key) => [
        key,
        key === 'actionUrl'
          ? `${this.siteOrigin}/${template.locale}/newsletter/confirm`
          : key === 'trackingUrl'
            ? 'https://example.com/tracking'
            : key === 'orderNumber'
              ? 'HNY-2026-000001'
              : 'SYNTHETIC-TRACKING',
      ]),
    );
    const rendered = renderTemplate(template, variables, this.siteOrigin);
    // Admin UI presents preview as text; never accepts arbitrary send recipients.
    return {
      subject: rendered.subject,
      text: rendered.text,
      locale: template.locale,
      direction: template.locale === 'fa' ? 'rtl' : 'ltr',
      allowedVariables: TEMPLATE_VARIABLES[template.code],
      smsEnabled: false,
    };
  }
  async sendFulfilment(kind: FulfilmentNotificationKind, notification: FulfilmentNotification) {
    await this.deliver(
      {
        dedupeKey: `fulfilment:${notification.shipmentId}:${kind}`,
        templateCode: kind === 'SHIPPED' ? 'shipment-shipped' : 'shipment-delivered',
        locale: notification.locale,
        recipient: notification.email,
      },
      {
        orderNumber: notification.orderNumber,
        trackingNumber: notification.trackingNumber ?? '',
        trackingUrl: notification.trackingUrl ?? '',
      },
    );
  }
  async sendShipmentForSystem(
    context: Readonly<{ kind: 'SYSTEM'; source: 'WORKER'; correlationId: string }>,
    input: Readonly<{ shipmentId: string; kind: FulfilmentNotificationKind }>,
    source: Pick<FulfilmentService, 'notificationForSystem'>,
  ) {
    this.system(context);
    const notification = await source.notificationForSystem(context, input);
    await this.sendFulfilment(input.kind, notification);
  }
  async subscribe(input: Readonly<{ email: string; locale: string; consent: boolean }>) {
    if (
      input.consent !== true ||
      !this.locales.includes(input.locale) ||
      input.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(input.email)
    )
      throw new ValidationAppError([{ path: 'email', code: 'NEWSLETTER_INVALID' }]);
    await this.repository.requestSubscription(
      input.email.trim().normalize('NFC').toLowerCase(),
      input.locale,
    );
    return { accepted: true };
  }
  async confirm(token: string) {
    await this.repository.confirm(this.tokenHash(token));
    return { accepted: true };
  }
  async unsubscribe(token: string) {
    await this.repository.unsubscribe(this.tokenHash(token));
    return { accepted: true };
  }
  async sendNewsletterForSystem(
    context: Readonly<{ kind: 'SYSTEM'; source: 'WORKER'; correlationId: string }>,
    deliveryId: string,
  ) {
    this.system(context);
    adminIdentifier(deliveryId);
    // A durable ID-only confirmation intent precedes token minting. Raw tokens
    // exist only in this process and the message; storage keeps SHA-256 hashes.
    const token = randomBytes(32).toString('base64url');
    const prepared = await this.repository.prepareNewsletter(deliveryId, hash(token));
    if (prepared === null) return;
    const action = prepared.code === 'newsletter-confirm' ? 'confirm' : 'unsubscribe';
    try {
      const template = await this.repository.template(prepared.code, prepared.locale, 'EMAIL');
      if (template === null)
        throw new DependencyUnavailableAppError({ code: 'NOTIFICATION_TEMPLATE_UNAVAILABLE' });
      const message = renderTemplate(
        template,
        { actionUrl: `${this.siteOrigin}/${prepared.locale}/newsletter/${action}?token=${token}` },
        this.siteOrigin,
      );
      await this.sender.send({ recipient: prepared.recipient, ...message });
      await this.repository.finishDelivery(prepared.claim, true);
    } catch {
      await this.repository.finishDelivery(prepared.claim, false);
      throw new DependencyUnavailableAppError({ code: 'NOTIFICATION_DELIVERY_UNAVAILABLE' });
    }
  }
  private tokenHash(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(token))
      throw new ValidationAppError([{ path: 'token', code: 'NEWSLETTER_TOKEN_INVALID' }]);
    return hash(token);
  }
  private system(context: Readonly<{ kind: string; source: string; correlationId: string }>) {
    if (
      context.kind !== 'SYSTEM' ||
      context.source !== 'WORKER' ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(context.correlationId)
    )
      throw new ForbiddenAppError();
  }
  private async deliver(input: DeliveryInput, variables: Readonly<Record<string, string>>) {
    if (!this.locales.includes(input.locale))
      throw new DependencyUnavailableAppError({ code: 'NOTIFICATION_LOCALE_UNAVAILABLE' });
    const template = await this.repository.template(input.templateCode, input.locale, 'EMAIL');
    if (template === null)
      throw new DependencyUnavailableAppError({ code: 'NOTIFICATION_TEMPLATE_UNAVAILABLE' });
    const rendered = renderTemplate(template, variables, this.siteOrigin);
    const claim = await this.repository.claimDelivery(input);
    if (claim === null) return;
    try {
      await this.sender.send({ recipient: input.recipient, ...rendered });
      await this.repository.finishDelivery(claim, true);
    } catch {
      await this.repository.finishDelivery(claim, false);
      throw new DependencyUnavailableAppError({ code: 'NOTIFICATION_DELIVERY_UNAVAILABLE' });
    }
  }
}
