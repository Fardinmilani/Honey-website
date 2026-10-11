import type { Template } from './templates.js';
import type { AuthenticatedPrincipal, RequestMetadata } from '../../identity/index.js';
import type { AdminPage, AdminPageInput } from '../../../platform/domain/admin-page.js';
export type TemplateRecord = Template & Readonly<{ id: string; updatedAt: string }>;
export type NotificationActor = Readonly<{
  principal: AuthenticatedPrincipal;
  metadata: RequestMetadata;
}>;
export type Message = Readonly<{ recipient: string; subject: string; text: string; html: string }>;
export interface MailSender {
  send(message: Message): Promise<void>;
  close(): Promise<void>;
}
export interface SmsSender {
  readonly enabled: boolean;
  send(): Promise<never>;
}
export type DeliveryInput = Readonly<{
  dedupeKey: string;
  templateCode: Template['code'];
  locale: string;
  recipient: string;
  subscriptionId?: string;
}>;
export type DeliveryClaim = Readonly<{ id: string; leaseToken: string }>;
export interface NotificationsRepository {
  listTemplates(page: AdminPageInput): Promise<AdminPage<TemplateRecord>>;
  template(
    code: Template['code'],
    locale: string,
    channel: Template['channel'],
  ): Promise<Template | null>;
  saveTemplate(template: Template, actor: NotificationActor): Promise<TemplateRecord>;
  claimDelivery(input: DeliveryInput): Promise<DeliveryClaim | null>;
  finishDelivery(claim: DeliveryClaim, sent: boolean): Promise<void>;
  requestSubscription(email: string, locale: string): Promise<void>;
  prepareNewsletter(
    deliveryId: string,
    tokenHash: string,
  ): Promise<Readonly<{
    recipient: string;
    locale: string;
    code: 'newsletter-confirm' | 'newsletter-welcome';
    claim: DeliveryClaim;
  }> | null>;
  confirm(hash: string): Promise<void>;
  unsubscribe(hash: string): Promise<void>;
  close(): Promise<void>;
}
