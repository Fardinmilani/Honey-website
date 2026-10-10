export { FulfilmentService, type CreateShipmentRequest } from './application/fulfilment.service.js';
export {
  type FulfilmentNotification,
  type FulfilmentNotificationKind,
  type FulfilmentNotificationPort,
  type FulfilmentRepository,
  type ShipmentRecord,
  type ShipmentStatus,
} from './domain/fulfilment.js';
export { FulfilmentModule, type FulfilmentModuleOptions } from './fulfilment.module.js';
export {
  SmtpFulfilmentNotificationAdapter,
  type FulfilmentSmtpConfig,
} from './infrastructure/smtp-fulfilment-notification.adapter.js';
