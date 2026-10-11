import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import {
  IdentityModule,
  ContentModule,
  ReviewsModule,
  NotificationsModule,
  CatalogModule,
  CartModule,
  MediaModule,
  PlatformModule,
  InventoryModule,
  SourcingModule,
  ProcurementModule,
  PricingModule,
  CheckoutModule,
  OrdersModule,
  PaymentsModule,
  FulfilmentModule,
  ShippingModule,
  SmtpFulfilmentNotificationAdapter,
  type DatabaseHealthPort,
} from '@honey/backend';
import type { GracefulShutdown } from './bootstrap/graceful-shutdown.js';
import type { ApiConfig } from './config/api-config.js';
import { PlatformController } from './modules/platform/platform.controller.js';
import { IdentityController } from './modules/identity/identity.controller.js';
import { MediaController } from './modules/media/media.controller.js';
import {
  AdminCatalogController,
  PublicCatalogController,
} from './modules/catalog/catalog.controller.js';
import { AdminSourcingController } from './modules/sourcing/sourcing.controller.js';
import { AdminProcurementController } from './modules/procurement/procurement.controller.js';
import { AdminInventoryController } from './modules/inventory/inventory.controller.js';
import { CartController } from './modules/cart/cart.controller.js';
import { AdminPricingController } from './modules/pricing/pricing.controller.js';
import { CheckoutController, OrdersController } from './modules/checkout/checkout.controller.js';
import {
  AdminPaymentsController,
  PaymentsController,
  PaymentWebhooksController,
} from './modules/payments/payments.controller.js';
import { AdminFulfilmentController } from './modules/fulfilment/fulfilment.controller.js';
import { AdminShippingController } from './modules/shipping/shipping.controller.js';
import { AdminOrdersController } from './modules/orders/admin-orders.controller.js';
import {
  AdminCustomersController,
  AdminAuditController,
} from './modules/identity/admin-identity.controller.js';
import { AdminCatalogQueryController } from './modules/catalog/admin-catalog-query.controller.js';
import { ValidationProbeController } from './testing/validation-probe.controller.js';
import { AuthorizationGuard } from './http/auth/authorization.guard.js';
import type { ControllerClass } from './http/auth/route-policy-verifier.js';
import {
  AdminContentController,
  PublicContentController,
} from './modules/content/content.controller.js';
import {
  AdminReviewsController,
  CustomerReviewsController,
  PublicReviewsController,
} from './modules/reviews/reviews.controller.js';
import {
  AdminNotificationsController,
  NewsletterController,
} from './modules/notifications/notifications.controller.js';

export type AppModuleOptions = Readonly<{
  config: ApiConfig;
  databaseHealthOverride?: DatabaseHealthPort;
  enableTestRoutes?: boolean;
  gracefulShutdown: GracefulShutdown;
}>;

@Module({})
export class AppModule {
  static controllers(enableTestRoutes: boolean): readonly ControllerClass[] {
    return enableTestRoutes
      ? [
          PlatformController,
          AdminContentController,
          AdminReviewsController,
          CustomerReviewsController,
          PublicReviewsController,
          AdminNotificationsController,
          NewsletterController,
          PublicContentController,
          IdentityController,
          MediaController,
          PublicCatalogController,
          AdminCatalogController,
          AdminSourcingController,
          AdminProcurementController,
          AdminInventoryController,
          CartController,
          AdminPricingController,
          CheckoutController,
          OrdersController,
          PaymentsController,
          AdminPaymentsController,
          AdminPaymentQueryController,
          PaymentWebhooksController,
          AdminFulfilmentController,
          AdminShippingController,
          AdminOrdersController,
          AdminCustomersController,
          AdminAuditController,
          AdminCatalogQueryController,
          ValidationProbeController,
        ]
      : [
          PlatformController,
          AdminContentController,
          AdminReviewsController,
          CustomerReviewsController,
          PublicReviewsController,
          AdminNotificationsController,
          NewsletterController,
          PublicContentController,
          IdentityController,
          MediaController,
          PublicCatalogController,
          AdminCatalogController,
          AdminSourcingController,
          AdminProcurementController,
          AdminInventoryController,
          CartController,
          AdminPricingController,
          CheckoutController,
          OrdersController,
          PaymentsController,
          AdminPaymentsController,
          AdminPaymentQueryController,
          PaymentWebhooksController,
          AdminFulfilmentController,
          AdminShippingController,
          AdminOrdersController,
          AdminCustomersController,
          AdminAuditController,
          AdminCatalogQueryController,
        ];
  }

  static register(options: AppModuleOptions): DynamicModule {
    const platformModule = PlatformModule.register({
      databaseUrl: options.config.databaseUrl,
      readinessTimeoutMs: options.config.readinessTimeoutMs,
      ...(options.databaseHealthOverride === undefined
        ? {}
        : { databaseHealthOverride: options.databaseHealthOverride }),
    });
    const inventoryModule = InventoryModule.register({
      databaseUrl: options.config.databaseUrl,
    });
    const identityModule = IdentityModule.register({
      config: options.config.identity.config,
      databaseUrl: options.config.databaseUrl,
      redisUrl: options.config.redisUrl,
      totpEncryptionKey: options.config.identity.totpEncryptionKey,
      breachedPasswordEndpoint: options.config.identity.breachedPasswordEndpoint,
      breachedPasswordTimeoutMs: options.config.identity.breachedPasswordTimeoutMs,
      smtp: options.config.identity.smtp,
    });
    const pricingModule = PricingModule.register({
      databaseUrl: options.config.databaseUrl,
      config: { enabledCurrencies: options.config.cart.enabledCurrencies },
      identityModule,
    });
    const mediaModule = MediaModule.register({
      config: options.config.media.config,
      storage: options.config.media.storage,
      databaseUrl: options.config.databaseUrl,
      redisUrl: options.config.redisUrl,
    });
    const contentModule = ContentModule.register({
      databaseUrl: options.config.databaseUrl,
      redisUrl: options.config.redisUrl,
      cacheNamespace: options.config.catalog.cacheNamespace,
      enabledLocales: options.config.catalog.enabledLocales,
      mediaModule,
    });
    const notificationsModule = NotificationsModule.register({
      databaseUrl: options.config.databaseUrl,
      smtp: options.config.identity.smtp,
      siteOrigin: options.config.notificationSiteOrigin,
      enabledLocales: options.config.catalog.enabledLocales,
    });
    const cartModule = CartModule.register({
      databaseUrl: options.config.databaseUrl,
      config: {
        activeTtlMs: options.config.cart.activeTtlMs,
        maximumLineQuantity: options.config.cart.maximumLineQuantity,
        defaultCurrency: options.config.cart.defaultCurrency,
        enabledCurrencies: options.config.cart.enabledCurrencies,
      },
      inventoryModule,
      pricingModule,
      mediaModule,
    });
    const ordersModule = OrdersModule.register({ databaseUrl: options.config.databaseUrl });
    const checkoutModule = CheckoutModule.register({
      databaseUrl: options.config.databaseUrl,
      standardShipping: options.config.checkout.standardShipping,
      cartModule,
      pricingModule,
      inventoryModule,
      ordersModule,
      platformModule,
    });
    const paymentsModule = PaymentsModule.register({
      databaseUrl: options.config.databaseUrl,
      defaultProvider: options.config.payment.provider,
      callbackUrl: options.config.payment.callbackUrl,
      requestTimeoutMs: options.config.payment.requestTimeoutMs,
      reconciliationMinAgeMs: options.config.payment.reconciliationMinAgeMs,
      zarinpal: options.config.payment.zarinpal,
      identityModule,
      platformModule,
    });
    const fulfilmentModule = FulfilmentModule.register({
      databaseUrl: options.config.databaseUrl,
      ordersModule,
      inventoryModule,
      platformModule,
      notification: new SmtpFulfilmentNotificationAdapter(
        options.config.databaseUrl,
        options.config.identity.smtp,
      ),
    });
    const shippingModule = ShippingModule.register({ databaseUrl: options.config.databaseUrl });
    const catalogModule = CatalogModule.register({
      config: options.config.catalog,
      databaseUrl: options.config.databaseUrl,
      redisUrl: options.config.redisUrl,
      inventoryModule,
      pricingModule,
      mediaModule,
    });
    return {
      module: AppModule,
      imports: [
        platformModule,
        contentModule,
        notificationsModule,
        catalogModule,
        identityModule,
        inventoryModule,
        pricingModule,
        SourcingModule.register({
          databaseUrl: options.config.databaseUrl,
          inventoryModule,
        }),
        ProcurementModule.register({
          databaseUrl: options.config.databaseUrl,
          inventoryModule,
        }),
        ReviewsModule.register({
          databaseUrl: options.config.databaseUrl,
          enabledLocales: options.config.catalog.enabledLocales,
          ordersModule,
          fulfilmentModule,
          catalogModule,
        }),
        cartModule,
        ordersModule,
        checkoutModule,
        paymentsModule,
        fulfilmentModule,
        shippingModule,
      ],
      controllers: [...AppModule.controllers(options.enableTestRoutes === true)],
      providers: [
        { provide: 'API_GRACEFUL_SHUTDOWN', useValue: options.gracefulShutdown },
        { provide: 'API_CONFIG', useValue: options.config },
        { provide: APP_GUARD, useClass: AuthorizationGuard },
      ],
    };
  }
}
import { AdminPaymentQueryController } from './modules/payments/admin-payments.controller.js';
