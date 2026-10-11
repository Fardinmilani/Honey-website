import { randomBytes, randomUUID } from 'node:crypto';
import { createPrismaClient } from '../src/client.js';
import { seedDatabase, seedIds } from '../seed/data.js';
import {
  Aes256GcmSecretCipher,
  Argon2PasswordHasher,
  Rfc6238Totp,
} from '../../backend/dist/modules/identity/infrastructure/identity-crypto.js';
import { createAdminTestDatabase, dropAdminTestDatabase } from './admin-test-database.js';

// Test-only IPC fixture. Credentials never reach files, stdout, traces or product code.
if (process.send === undefined) throw new Error('The fixture requires a private IPC channel.');
const database = await createAdminTestDatabase();
const prisma = createPrismaClient({ databaseUrl: database.databaseUrl });
try {
  await seedDatabase(prisma, { staffEmail: 'owner-browser@example.invalid' });
  const encryptionKey = randomBytes(32).toString('base64');
  const cipher = new Aes256GcmSecretCipher(encryptionKey);
  const hasher = new Argon2PasswordHasher({
    memoryCostKiB: 65_536,
    timeCost: 3,
    parallelism: 1,
    minLength: 10,
    maxLength: 128,
  });
  const totp = new Rfc6238Totp();
  const users = [];
  let customerId = '';
  for (let index = 0; index < 10; index += 1) {
    const password = randomBytes(24).toString('base64url');
    const secret = totp.generateSecret();
    const encrypted = cipher.encrypt(secret);
    const isStaff = index !== 4;
    const roleCode = index === 3 ? 'SUPPORT' : index === 4 ? 'CUSTOMER' : 'OWNER';
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    const id = randomUUID();
    if (!isStaff) customerId = id;
    const email = `phase17-browser-${index}@example.invalid`;
    await prisma.user.create({
      data: {
        id,
        email,
        isStaff,
        preferredLocale: 'en',
        emailVerifiedAt: new Date(),
        displayName: `Phase 17 ${roleCode}`,
        credentials: {
          create: [
            { id: randomUUID(), type: 'PASSWORD', secretHash: await hasher.hash(password) },
            ...(isStaff && index !== 9
              ? [
                  {
                    id: randomUUID(),
                    type: 'TOTP' as const,
                    encryptedSecret: new Uint8Array(encrypted.ciphertext),
                    secretNonce: new Uint8Array(encrypted.nonce),
                    secretTag: new Uint8Array(encrypted.tag),
                  },
                ]
              : []),
          ],
        },
        userRoles: { create: { id: randomUUID(), roleId: role.id } },
      },
    });
    users.push({ email, password, secret });
  }
  const orderId = randomUUID();
  const orderLineId = randomUUID();
  const paymentId = randomUUID();
  const cancelOrderId = randomUUID();
  for (const fixture of [
    { orderId, orderLineId, paymentId, number: 'HNY-PHASE17-BROWSER' },
    {
      orderId: cancelOrderId,
      orderLineId: randomUUID(),
      paymentId: randomUUID(),
      number: 'HNY-PHASE17-CANCEL',
    },
  ]) {
    await prisma.order.create({
      data: {
        id: fixture.orderId,
        userId: customerId,
        number: fixture.number,
        email: 'phase17-browser-4@example.invalid',
        localeAtPurchase: 'en',
        currency: 'IRR',
        status: 'PAID',
        paymentStatus: 'PAID',
        fulfilmentStatus: 'UNFULFILLED',
        subtotalMinor: 200000n,
        grandTotalMinor: 200000n,
        shippingMethodSnapshot: { code: 'STANDARD', providerCode: 'manual-flat', amountMinor: '0' },
        shippingAddressSnapshot: {
          fullName: 'Browser customer',
          phone: '09000000000',
          country: 'IR',
          province: 'Tehran',
          city: 'Tehran',
          postalCode: '1111111111',
          line1: 'Test address',
        },
        billingAddressSnapshot: {},
        lines: {
          create: {
            id: fixture.orderLineId,
            productId: seedIds.ownProduct,
            variantId: seedIds.ownVariant,
            skuSnapshot: 'BROWSER-450',
            productNameSnapshot: { fa: 'عسل آزمون', en: 'Browser honey' },
            variantNameSnapshot: { fa: '450 g jar', en: '450 g jar' },
            attributesSnapshot: {},
            quantity: 2,
            unitPriceMinor: 100000n,
            taxRateBps: 0,
            lineTotalMinor: 200000n,
          },
        },
      },
    });
    await prisma.payment.create({
      data: {
        id: fixture.paymentId,
        orderId: fixture.orderId,
        provider: 'mock',
        providerRef: `mock-${fixture.paymentId}`,
        idempotencyKey: `phase17-browser-payment-${fixture.number}`,
        currency: 'IRR',
        amountMinor: 200000n,
        status: 'PAID',
        paidAt: new Date(),
      },
    });
    const reservationId = randomUUID();
    await prisma.stockReservation.create({
      data: {
        id: reservationId,
        variantId: seedIds.ownVariant,
        stockLocationId: seedIds.location,
        orderId: fixture.orderId,
        quantity: 2,
        status: 'CONSUMED',
        consumedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await prisma.inventoryItem.update({
      where: { id: seedIds.ownInventory },
      data: { allocated: { increment: 2 } },
    });
    await prisma.stockLedgerEntry.create({
      data: {
        id: randomUUID(),
        variantId: seedIds.ownVariant,
        stockLocationId: seedIds.location,
        delta: 2,
        reason: 'ALLOCATION',
        refType: 'stock_reservation',
        refId: reservationId,
      },
    });
  }
  process.send({
    databaseUrl: database.databaseUrl,
    encryptionKey,
    users,
    ids: { ...seedIds, orderId, orderLineId, paymentId, cancelOrderId },
  });
  await new Promise<void>((resolve) => {
    process.once('message', () => resolve());
    process.once('disconnect', () => resolve());
  });
} catch {
  process.send?.({ error: 'Admin browser fixture preparation failed.' });
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  await dropAdminTestDatabase(database);
  process.disconnect?.();
}
