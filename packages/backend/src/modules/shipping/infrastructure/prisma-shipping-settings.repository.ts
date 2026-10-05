import { randomUUID } from 'node:crypto';

import { createPrismaClient, Prisma, type PrismaClient } from '@honey/db';

import { ConflictAppError, ValidationAppError } from '../../../errors/index.js';
import type {
  ShippingSettingsActor,
  ShippingSettingsRepository,
  ShippingSettingsSnapshot,
  UpsertShippingMethodInput,
  UpsertShippingZoneInput,
  ValidatedShippingRate,
} from '../domain/shipping-settings.js';

function invalid(path: string): ValidationAppError {
  return new ValidationAppError([{ path, code: 'SHIPPING_CONFIGURATION_INVALID' }]);
}

function intersects(left: readonly string[], right: readonly string[]): boolean {
  if (left.length === 0 || right.length === 0) return true;
  const values = new Set(left.map((value) => value.normalize('NFC').toLocaleUpperCase('en-US')));
  return right.some((value) => values.has(value.normalize('NFC').toLocaleUpperCase('en-US')));
}

function ambiguousZones(
  left: Readonly<{ countries: readonly string[]; provinces: readonly string[]; priority: number }>,
  right: Readonly<{ countries: readonly string[]; provinces: readonly string[]; priority: number }>,
): boolean {
  return (
    left.priority === right.priority &&
    left.countries.length > 0 === right.countries.length > 0 &&
    left.provinces.length > 0 === right.provinces.length > 0 &&
    intersects(left.countries, right.countries) &&
    intersects(left.provinces, right.provinces)
  );
}

function audit(
  actor: ShippingSettingsActor,
  action: string,
  subjectType: string,
  subjectId: string,
  beforeJson: Readonly<Record<string, string>>,
  afterJson: Readonly<Record<string, string>>,
) {
  return {
    id: randomUUID(),
    actorUserId: actor.actorUserId,
    action,
    subjectType,
    subjectId,
    requestId: actor.requestId,
    ip: actor.clientIp,
    beforeJson,
    afterJson,
  };
}

export class PrismaShippingSettingsRepository implements ShippingSettingsRepository {
  readonly #client: PrismaClient;

  constructor(databaseUrl: string) {
    this.#client = createPrismaClient({ databaseUrl });
  }

  async list(): Promise<ShippingSettingsSnapshot> {
    const rows = await this.#client.shippingZone.findMany({
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
      include: {
        methods: {
          orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
          include: {
            translations: { orderBy: { locale: 'asc' } },
            rates: {
              orderBy: [{ currency: 'asc' }, { minWeightGrams: 'asc' }, { validFrom: 'asc' }],
            },
          },
        },
      },
    });
    return {
      zones: rows.map((zone) => ({
        id: zone.id,
        name: zone.name,
        countries: zone.countries,
        provinces: zone.provinces,
        priority: zone.priority,
        methods: zone.methods.map((method) => ({
          id: method.id,
          code: method.code,
          provider: method.provider,
          isActive: method.isActive,
          sortOrder: method.sortOrder,
          translations: method.translations.map((entry) => ({
            locale: entry.locale,
            name: entry.name,
            description: entry.description,
          })),
          rates: method.rates.map((rate) => ({
            id: rate.id,
            currency: rate.currency,
            baseMinor: rate.baseMinor.toString(),
            perKgMinor: rate.perKgMinor.toString(),
            freeOverSubtotalMinor: rate.freeOverSubtotalMinor?.toString() ?? null,
            minWeightGrams: rate.minWeightGrams,
            maxWeightGrams: rate.maxWeightGrams,
            validFrom: rate.validFrom.toISOString(),
            validTo: rate.validTo?.toISOString() ?? null,
          })),
        })),
      })),
    };
  }

  async upsertZone(
    input: UpsertShippingZoneInput,
    actor: ShippingSettingsActor,
  ): Promise<{ id: string }> {
    return this.#client.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(150015)`);
      const existing = await transaction.shippingZone.findMany({
        where: { id: { not: input.id } },
        select: { countries: true, provinces: true, priority: true },
      });
      if (existing.some((zone) => ambiguousZones(zone, input))) throw invalid('zone');
      const before = await transaction.shippingZone.findUnique({ where: { id: input.id } });
      await transaction.shippingZone.upsert({
        where: { id: input.id },
        create: {
          id: input.id,
          name: input.name,
          countries: [...input.countries],
          provinces: [...input.provinces],
          priority: input.priority,
          createdBy: actor.actorUserId,
          updatedBy: actor.actorUserId,
        },
        update: {
          name: input.name,
          countries: [...input.countries],
          provinces: [...input.provinces],
          priority: input.priority,
          updatedBy: actor.actorUserId,
        },
      });
      await transaction.auditLog.create({
        data: audit(
          actor,
          before === null ? 'shipping.zone.created' : 'shipping.zone.updated',
          'shipping_zone',
          input.id,
          before === null ? {} : { name: before.name, priority: String(before.priority) },
          { name: input.name, priority: String(input.priority) },
        ),
      });
      return { id: input.id };
    });
  }

  async upsertMethod(
    input: UpsertShippingMethodInput,
    actor: ShippingSettingsActor,
  ): Promise<{ id: string }> {
    return this.#client.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(150015)`);
      const zone = await transaction.shippingZone.findUnique({
        where: { id: input.zoneId },
        select: { id: true },
      });
      if (zone === null) throw invalid('zoneId');
      const before = await transaction.shippingMethod.findUnique({ where: { id: input.id } });
      const duplicate = await transaction.shippingMethod.findUnique({
        where: { code: input.code },
      });
      if (duplicate !== null && duplicate.id !== input.id) {
        throw new ConflictAppError({ code: 'SHIPPING_METHOD_CODE_EXISTS' });
      }
      await transaction.shippingMethod.upsert({
        where: { id: input.id },
        create: {
          id: input.id,
          code: input.code,
          zoneId: input.zoneId,
          provider: 'manual-flat',
          isActive: input.isActive,
          sortOrder: input.sortOrder,
          createdBy: actor.actorUserId,
          updatedBy: actor.actorUserId,
        },
        update: {
          code: input.code,
          zoneId: input.zoneId,
          provider: 'manual-flat',
          isActive: input.isActive,
          sortOrder: input.sortOrder,
          updatedBy: actor.actorUserId,
        },
      });
      await transaction.shippingMethodTranslation.deleteMany({
        where: { shippingMethodId: input.id },
      });
      await transaction.shippingMethodTranslation.createMany({
        data: input.translations.map((entry) => ({
          id: randomUUID(),
          shippingMethodId: input.id,
          locale: entry.locale,
          name: entry.name,
          description: entry.description,
          createdBy: actor.actorUserId,
          updatedBy: actor.actorUserId,
        })),
      });
      await transaction.auditLog.create({
        data: audit(
          actor,
          before === null ? 'shipping.method.created' : 'shipping.method.updated',
          'shipping_method',
          input.id,
          before === null ? {} : { code: before.code, isActive: String(before.isActive) },
          { code: input.code, isActive: String(input.isActive) },
        ),
      });
      return { id: input.id };
    });
  }

  async upsertRate(
    input: ValidatedShippingRate,
    actor: ShippingSettingsActor,
  ): Promise<{ id: string }> {
    return this.#client.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(150015)`);
      const method = await transaction.shippingMethod.findUnique({
        where: { id: input.methodId },
        select: { id: true },
      });
      if (method === null) throw invalid('methodId');
      const before = await transaction.shippingRate.findUnique({ where: { id: input.id } });
      const peers = await transaction.shippingRate.findMany({
        where: { methodId: input.methodId, currency: input.currency, id: { not: input.id } },
      });
      const upperWeight = input.maxWeightGrams ?? Number.POSITIVE_INFINITY;
      const upperTime = input.validTo?.getTime() ?? Number.POSITIVE_INFINITY;
      if (
        peers.some(
          (rate) =>
            input.minWeightGrams <= (rate.maxWeightGrams ?? Number.POSITIVE_INFINITY) &&
            rate.minWeightGrams <= upperWeight &&
            input.validFrom.getTime() < (rate.validTo?.getTime() ?? Number.POSITIVE_INFINITY) &&
            rate.validFrom.getTime() < upperTime,
        )
      )
        throw invalid('rate');
      await transaction.shippingRate.upsert({
        where: { id: input.id },
        create: {
          id: input.id,
          methodId: input.methodId,
          currency: input.currency,
          baseMinor: input.baseMinor,
          perKgMinor: input.perKgMinor,
          freeOverSubtotalMinor: input.freeOverSubtotalMinor,
          minWeightGrams: input.minWeightGrams,
          maxWeightGrams: input.maxWeightGrams,
          validFrom: input.validFrom,
          validTo: input.validTo,
          createdBy: actor.actorUserId,
          updatedBy: actor.actorUserId,
        },
        update: {
          methodId: input.methodId,
          currency: input.currency,
          baseMinor: input.baseMinor,
          perKgMinor: input.perKgMinor,
          freeOverSubtotalMinor: input.freeOverSubtotalMinor,
          minWeightGrams: input.minWeightGrams,
          maxWeightGrams: input.maxWeightGrams,
          validFrom: input.validFrom,
          validTo: input.validTo,
          updatedBy: actor.actorUserId,
        },
      });
      await transaction.auditLog.create({
        data: audit(
          actor,
          before === null ? 'shipping.rate.created' : 'shipping.rate.updated',
          'shipping_rate',
          input.id,
          before === null ? {} : { amountMinor: before.baseMinor.toString() },
          { amountMinor: input.baseMinor.toString() },
        ),
      });
      return { id: input.id };
    });
  }

  close(): Promise<void> {
    return this.#client.$disconnect();
  }
}
