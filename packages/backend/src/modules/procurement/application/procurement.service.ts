import { createHash } from 'node:crypto';

import {
  ConflictAppError,
  ForbiddenAppError,
  NotFoundAppError,
  ValidationAppError,
} from '../../../errors/index.js';
import type {
  AuthenticatedPrincipal,
  PermissionCode,
  RequestMetadata,
} from '../../identity/index.js';
import type { InventoryService } from '../../inventory/index.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import {
  CLIENT_PO_TRANSITIONS,
  allocateLandedCost,
  deriveLineTotal,
  type ProcurementActorContext,
  type GoodsReceiptLineInput,
  type GoodsReceiptRecord,
  type LandedCostView,
  type PurchaseOrderRecord,
  type PurchaseOrderStatus,
  type SupplierRecord,
  type SupplierStatus,
  SUPPLIER_STATUSES,
} from '../domain/procurement.js';
import type {
  PrismaProcurementRepository,
  PurchaseOrderLineDraft,
  PurchaseOrderLineWrite,
  PurchaseOrderWrite,
  SupplierInput,
} from '../infrastructure/prisma-procurement.repository.js';

function validation(path: string, code: string): ValidationAppError {
  return new ValidationAppError([{ path, code }]);
}

function assertAdmin(principal: AuthenticatedPrincipal, permission: PermissionCode): void {
  if (principal.kind !== 'STAFF') throw new ForbiddenAppError({ code: 'STAFF_REQUIRED' });
  if (!principal.permissions.includes(permission)) throw new ForbiddenAppError();
}

function boundedString(value: string, maximum: number, path: string): string {
  const normalized = value.normalize('NFC').trim();
  if (
    normalized.length < 1 ||
    Array.from(normalized).length > maximum ||
    /[\u0000-\u001F\u007F-\u009F]/u.test(normalized)
  ) {
    throw validation(path, 'PROCUREMENT_TEXT_INVALID');
  }
  return normalized;
}

function optionalString(
  value: string | null | undefined,
  maximum: number,
  path: string,
): string | null {
  if (value === null || value === undefined) return null;
  return boundedString(value, maximum, path);
}

function uuid(value: string, path: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) {
    throw validation(path, 'PROCUREMENT_ID_INVALID');
  }
  return value;
}

function money(value: string | number | bigint, path: string): bigint {
  const parsed = typeof value === 'bigint' ? value : BigInt(value);
  if (parsed < 0n) throw validation(path, 'PROCUREMENT_MONEY_INVALID');
  return parsed;
}

function positiveInt(value: number, path: string): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw validation(path, 'PROCUREMENT_NUMBER_INVALID');
  return value;
}

function nonNegativeInt(value: number, path: string): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw validation(path, 'PROCUREMENT_NUMBER_INVALID');
  return value;
}

function decodeCursor(value: string | undefined): { createdAt: string; id: string } | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      !('t' in parsed) ||
      !('id' in parsed) ||
      typeof parsed.t !== 'string' ||
      typeof parsed.id !== 'string'
    ) {
      throw new Error('invalid');
    }
    return { createdAt: parsed.t, id: parsed.id };
  } catch {
    throw validation('cursor', 'CURSOR_INVALID');
  }
}

function encodeCursor(value: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify({ v: 1, t: value.createdAt, id: value.id }), 'utf8').toString(
    'base64url',
  );
}

function hashRequest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function isGoodsReceiptRecord(value: unknown): value is GoodsReceiptRecord {
  if (value === null || typeof value !== 'object') return false;
  if (!('id' in value) || !('purchaseOrderId' in value) || !('stockLocationId' in value)) {
    return false;
  }
  if (!('lines' in value) || !Array.isArray(value.lines)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.purchaseOrderId === 'string' &&
    typeof value.stockLocationId === 'string'
  );
}

export class ProcurementService {
  constructor(
    private readonly repository: PrismaProcurementRepository,
    private readonly inventory: InventoryService,
  ) {}

  incomingByKey(): Promise<
    readonly Readonly<{ variantId: string; stockLocationId: string; incoming: number }>[]
  > {
    return this.repository.projectIncoming();
  }

  async listSuppliers(
    principal: AuthenticatedPrincipal,
    input: { cursor?: string; limit?: number; status?: SupplierStatus },
  ) {
    assertAdmin(principal, 'procurement:read');
    const limit = this.#limit(input.limit);
    const cursor = decodeCursor(input.cursor);
    const result = await this.repository.listSuppliers({
      limit,
      ...(cursor === undefined ? {} : { cursor }),
      ...(input.status === undefined ? {} : { status: input.status }),
    });
    return {
      data: result.items,
      page: {
        limit,
        hasMore: result.next !== null,
        nextCursor: result.next === null ? null : encodeCursor(result.next),
      },
    };
  }

  async getSupplier(principal: AuthenticatedPrincipal, id: string): Promise<SupplierRecord> {
    assertAdmin(principal, 'procurement:read');
    const supplier = await this.repository.getSupplier(uuid(id, 'id'));
    if (supplier === null) throw new NotFoundAppError();
    return supplier;
  }

  async createSupplier(
    principal: AuthenticatedPrincipal,
    input: SupplierInput,
    metadata: RequestMetadata,
  ): Promise<SupplierRecord> {
    assertAdmin(principal, 'procurement:write');
    try {
      return await this.repository.createSupplier(
        this.#supplier(input),
        this.#actor(principal, metadata),
      );
    } catch (error) {
      this.#rethrow(error);
    }
  }

  async updateSupplier(
    principal: AuthenticatedPrincipal,
    id: string,
    input: Partial<SupplierInput>,
    metadata: RequestMetadata,
  ): Promise<SupplierRecord> {
    assertAdmin(principal, 'procurement:write');
    const updated = await this.repository.updateSupplier(
      uuid(id, 'id'),
      this.#supplierPatch(input),
      this.#actor(principal, metadata),
    );
    if (updated === null) throw new NotFoundAppError();
    return updated;
  }

  async listPurchaseOrders(
    principal: AuthenticatedPrincipal,
    input: { cursor?: string; limit?: number; status?: PurchaseOrderStatus; supplierId?: string },
  ) {
    assertAdmin(principal, 'procurement:read');
    const limit = this.#limit(input.limit);
    const cursor = decodeCursor(input.cursor);
    const result = await this.repository.listPurchaseOrders({
      limit,
      ...(cursor === undefined ? {} : { cursor }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.supplierId === undefined
        ? {}
        : { supplierId: uuid(input.supplierId, 'supplierId') }),
    });
    return {
      data: result.items,
      page: {
        limit,
        hasMore: result.next !== null,
        nextCursor: result.next === null ? null : encodeCursor(result.next),
      },
    };
  }

  async getPurchaseOrder(
    principal: AuthenticatedPrincipal,
    id: string,
  ): Promise<PurchaseOrderRecord> {
    assertAdmin(principal, 'procurement:read');
    const order = await this.repository.getPurchaseOrder(uuid(id, 'id'));
    if (order === null) throw new NotFoundAppError();
    return order;
  }

  async createPurchaseOrder(
    principal: AuthenticatedPrincipal,
    input: PurchaseOrderWrite & Readonly<{ lines: readonly PurchaseOrderLineDraft[] }>,
    metadata: RequestMetadata,
  ): Promise<PurchaseOrderRecord> {
    assertAdmin(principal, 'procurement:write');
    const header = this.#orderHeader(input);
    const lines = input.lines.map((line, index) => this.#orderLine(line, `lines.${index}`));
    try {
      return await this.repository.createPurchaseOrder(
        header,
        lines,
        this.#actor(principal, metadata),
      );
    } catch (error) {
      this.#rethrow(error);
    }
  }

  async replaceLines(
    principal: AuthenticatedPrincipal,
    purchaseOrderId: string,
    lines: readonly PurchaseOrderLineDraft[],
    metadata: RequestMetadata,
  ): Promise<PurchaseOrderRecord> {
    assertAdmin(principal, 'procurement:write');
    const actor = this.#actor(principal, metadata);
    return this.repository.runInTransaction(async (transaction) => {
      const order = await this.repository.lockPurchaseOrder(
        transaction,
        uuid(purchaseOrderId, 'id'),
      );
      if (order === null) throw new NotFoundAppError();
      if (order.status !== 'DRAFT') {
        throw new ConflictAppError({ code: 'INVALID_PURCHASE_ORDER_TRANSITION' });
      }
      await this.repository.replaceDraftLines(
        transaction,
        order.id,
        lines.map((line, index) => this.#orderLine(line, `lines.${index}`)),
        actor,
      );
      await this.repository.appendAudit(
        transaction,
        actor,
        'procurement.purchase_order.lines_replaced',
        'purchase_order',
        order.id,
        { lineCount: lines.length },
      );
      const updated = await this.repository.getPurchaseOrder(order.id, transaction);
      if (updated === null) throw new NotFoundAppError();
      return updated;
    });
  }

  async transitionPurchaseOrder(
    principal: AuthenticatedPrincipal,
    id: string,
    status: PurchaseOrderStatus,
    metadata: RequestMetadata,
  ): Promise<PurchaseOrderRecord> {
    assertAdmin(principal, 'procurement:write');
    if (status === 'PARTIALLY_RECEIVED' || status === 'RECEIVED') {
      throw new ConflictAppError({ code: 'INVALID_PURCHASE_ORDER_TRANSITION' });
    }
    const actor = this.#actor(principal, metadata);
    try {
      return await this.repository.runInTransaction(async (transaction) => {
        const order = await this.repository.lockPurchaseOrder(transaction, uuid(id, 'id'));
        if (order === null) throw new NotFoundAppError();
        const allowed = CLIENT_PO_TRANSITIONS[order.status];
        if (!allowed.includes(status)) {
          throw new ConflictAppError({ code: 'INVALID_PURCHASE_ORDER_TRANSITION' });
        }
        if (status === 'CONFIRMED') {
          return this.#confirm(transaction, order, actor);
        }
        if (status === 'CANCELLED' && order.status === 'CONFIRMED') {
          if (
            order.lines.some(
              (line) => line.quantityReceivedAccepted + line.quantityReceivedRejected > 0,
            )
          ) {
            throw new ConflictAppError({ code: 'INVALID_PURCHASE_ORDER_TRANSITION' });
          }
          await this.#adjustIncoming(transaction, order, -1, actor);
        }
        const updated = await this.repository.updatePurchaseOrderHeader(
          transaction,
          order.id,
          { status },
          actor,
        );
        await this.repository.appendAudit(
          transaction,
          actor,
          'procurement.purchase_order.transitioned',
          'purchase_order',
          order.id,
          { from: order.status, to: status },
        );
        return updated;
      });
    } catch (error) {
      this.#rethrow(error);
    }
  }

  landedCost(principal: AuthenticatedPrincipal, order: PurchaseOrderRecord): LandedCostView {
    assertAdmin(principal, 'procurement:read');
    const extras =
      BigInt(order.freightCostMinor) + BigInt(order.dutyCostMinor) + BigInt(order.otherCostMinor);
    const lines = allocateLandedCost(
      extras,
      order.lines.map((line) => ({
        id: line.id,
        lineTotalMinor: BigInt(line.lineTotalMinor),
        quantityOrdered: line.quantityOrdered,
      })),
    );
    const merchandise = order.lines.reduce((sum, line) => sum + BigInt(line.lineTotalMinor), 0n);
    return {
      purchaseOrderId: order.id,
      currency: order.currency,
      merchandiseTotalMinor: merchandise.toString(),
      extrasMinor: extras.toString(),
      landedTotalMinor: (merchandise + extras).toString(),
      lines,
    };
  }

  async receiveGoods(
    principal: AuthenticatedPrincipal,
    purchaseOrderId: string,
    input: Readonly<{
      stockLocationId: string;
      notes?: string | null;
      lines: readonly GoodsReceiptLineInput[];
      idempotencyKey: string;
    }>,
    metadata: RequestMetadata,
  ): Promise<Readonly<{ receipt: GoodsReceiptRecord; replayed: boolean }>> {
    assertAdmin(principal, 'procurement:write');
    if (input.idempotencyKey.trim().length < 16) {
      throw validation('idempotencyKey', 'IDEMPOTENCY_KEY_INVALID');
    }
    const actor = this.#actor(principal, metadata);
    const lookup = {
      scope: 'procurement.goods_receipt',
      key: input.idempotencyKey.trim(),
      requestHash: hashRequest({ purchaseOrderId, ...input }),
      userId: principal.userId,
    };
    try {
      return await this.repository.runInTransaction(async (transaction) => {
        const existing = await this.repository.claimIdempotency(transaction, lookup);
        if (existing !== null) {
          if (existing.requestHash !== lookup.requestHash) {
            throw new ConflictAppError({ code: 'IDEMPOTENCY_KEY_REUSE' });
          }
          if (isGoodsReceiptRecord(existing.responseBody)) {
            return { receipt: existing.responseBody, replayed: true };
          }
          throw new ConflictAppError({ code: 'IDEMPOTENCY_KEY_REUSE' });
        }
        const order = await this.repository.lockPurchaseOrder(
          transaction,
          uuid(purchaseOrderId, 'purchaseOrderId'),
        );
        if (order === null) throw new NotFoundAppError();
        if (
          order.status === 'DRAFT' ||
          order.status === 'SUBMITTED' ||
          order.status === 'CANCELLED'
        ) {
          throw new ConflictAppError({ code: 'PURCHASE_ORDER_NOT_RECEIVABLE' });
        }
        if (order.destinationStockLocationId === null) {
          throw new ConflictAppError({ code: 'PURCHASE_ORDER_NOT_RECEIVABLE' });
        }
        const stockLocationId = uuid(input.stockLocationId, 'stockLocationId');
        if (stockLocationId !== order.destinationStockLocationId) {
          throw new ConflictAppError({ code: 'GOODS_RECEIPT_LOCATION_MISMATCH' });
        }
        if (input.lines.length < 1) throw validation('lines', 'PROCUREMENT_ARRAY_INVALID');
        const pending: Array<{
          variantId: string;
          stockLocationId: string;
          deltaOnHand: number;
          deltaIncoming: number;
          note: string | null;
        }> = [];
        const receiptLines: Array<{
          purchaseOrderLineId: string;
          quantityAccepted: number;
          quantityRejected: number;
          rejectionReason: string | null;
          harvestBatchId: string;
        }> = [];
        for (const [index, line] of input.lines.entries()) {
          const accepted = nonNegativeInt(line.quantityAccepted, `lines.${index}.quantityAccepted`);
          const rejected = nonNegativeInt(line.quantityRejected, `lines.${index}.quantityRejected`);
          if (accepted + rejected < 1) {
            throw validation(`lines.${index}`, 'GOODS_RECEIPT_QUANTITY_INVALID');
          }
          if (
            rejected > 0 &&
            (line.rejectionReason === undefined ||
              line.rejectionReason === null ||
              line.rejectionReason.trim() === '')
          ) {
            throw validation(`lines.${index}.rejectionReason`, 'REJECTION_REASON_REQUIRED');
          }
          const orderLine = order.lines.find(
            (candidate) => candidate.id === line.purchaseOrderLineId,
          );
          if (orderLine === undefined) {
            throw new ConflictAppError({ code: 'PURCHASE_ORDER_LINE_MISMATCH' });
          }
          const remaining =
            orderLine.quantityOrdered -
            orderLine.quantityReceivedAccepted -
            orderLine.quantityReceivedRejected;
          if (accepted + rejected > remaining) {
            throw new ConflictAppError({ code: 'OVER_RECEIPT' });
          }
          const harvestBatchId = uuid(line.harvestBatchId, `lines.${index}.harvestBatchId`);
          const batch = await this.repository.getHarvestBatchSupplier(transaction, harvestBatchId);
          if (batch === null) throw new NotFoundAppError({ code: 'HARVEST_BATCH_NOT_FOUND' });
          if (batch.supplierId !== order.supplierId) {
            throw new ConflictAppError({ code: 'HARVEST_BATCH_SUPPLIER_MISMATCH' });
          }
          receiptLines.push({
            purchaseOrderLineId: orderLine.id,
            quantityAccepted: accepted,
            quantityRejected: rejected,
            rejectionReason:
              rejected > 0
                ? boundedString(line.rejectionReason ?? '', 500, `lines.${index}.rejectionReason`)
                : null,
            harvestBatchId,
          });
          if (orderLine.variantId !== null) {
            pending.push({
              variantId: orderLine.variantId,
              stockLocationId,
              deltaOnHand: accepted,
              deltaIncoming: -(accepted + rejected),
              note: accepted === 0 ? 'rejected' : null,
            });
          }
        }
        const receipt = await this.repository.createGoodsReceipt(
          transaction,
          {
            purchaseOrderId: order.id,
            stockLocationId,
            receivedAt: new Date(),
            receivedBy: principal.userId,
            notes: optionalString(input.notes, 2000, 'notes'),
            lines: receiptLines,
          },
          actor,
        );
        if (pending.length > 0) {
          await this.inventory.applyStockChanges(
            transaction,
            pending.map((movement) => ({
              variantId: movement.variantId,
              stockLocationId: movement.stockLocationId,
              deltaOnHand: movement.deltaOnHand,
              deltaIncoming: movement.deltaIncoming,
              reason: 'RECEIPT' as const,
              refType: 'goods_receipt',
              refId: receipt.id,
              note: movement.note,
            })),
            actor,
          );
        }
        const after = await this.repository.getPurchaseOrder(order.id, transaction);
        if (after === null) throw new NotFoundAppError();
        const nextStatus = this.#derivedReceiptStatus(after);
        await this.repository.updatePurchaseOrderHeader(
          transaction,
          order.id,
          { status: nextStatus },
          actor,
        );
        await this.repository.appendAudit(
          transaction,
          actor,
          'procurement.goods_receipt.created',
          'goods_receipt',
          receipt.id,
          { purchaseOrderId: order.id, status: nextStatus },
        );
        await this.repository.appendOutbox(
          transaction,
          'goods_receipt',
          receipt.id,
          'procurement.goods_received',
          { purchaseOrderId: order.id, status: nextStatus },
        );
        await this.repository.saveIdempotency(transaction, lookup, 201, receipt);
        return { receipt, replayed: false };
      });
    } catch (error) {
      this.#rethrow(error);
    }
  }

  #derivedReceiptStatus(order: PurchaseOrderRecord): PurchaseOrderStatus {
    const complete = order.lines.every(
      (line) =>
        line.quantityReceivedAccepted + line.quantityReceivedRejected >= line.quantityOrdered,
    );
    const any = order.lines.some(
      (line) => line.quantityReceivedAccepted + line.quantityReceivedRejected > 0,
    );
    if (complete) return 'RECEIVED';
    if (any) return 'PARTIALLY_RECEIVED';
    return 'CONFIRMED';
  }

  async #confirm(
    transaction: TransactionContext,
    order: PurchaseOrderRecord,
    actor: ProcurementActorContext,
  ): Promise<PurchaseOrderRecord> {
    if (order.lines.length < 1) throw validation('lines', 'PROCUREMENT_ARRAY_INVALID');
    const hasVariant = order.lines.some((line) => line.variantId !== null);
    if (hasVariant && order.destinationStockLocationId === null) {
      throw validation('destinationStockLocationId', 'DESTINATION_REQUIRED');
    }
    await this.#adjustIncoming(transaction, order, 1, actor);
    const updated = await this.repository.updatePurchaseOrderHeader(
      transaction,
      order.id,
      {
        status: 'CONFIRMED',
        placedBy: actor.actorUserId,
        placedAt: new Date(),
      },
      actor,
    );
    await this.repository.appendAudit(
      transaction,
      actor,
      'procurement.purchase_order.confirmed',
      'purchase_order',
      order.id,
      { status: 'CONFIRMED' },
    );
    await this.repository.appendOutbox(
      transaction,
      'purchase_order',
      order.id,
      'purchase_order.confirmed',
      { supplierOmitted: true },
    );
    return updated;
  }

  async #adjustIncoming(
    transaction: TransactionContext,
    order: PurchaseOrderRecord,
    sign: 1 | -1,
    actor: ProcurementActorContext,
  ): Promise<void> {
    if (order.destinationStockLocationId === null) return;
    const movements = order.lines.flatMap((line) => {
      if (line.variantId === null) return [];
      const remaining =
        line.quantityOrdered - line.quantityReceivedAccepted - line.quantityReceivedRejected;
      if (remaining < 1) return [];
      return [
        {
          variantId: line.variantId,
          stockLocationId: order.destinationStockLocationId as string,
          deltaOnHand: 0,
          deltaIncoming: sign * remaining,
          reason: 'RECEIPT' as const,
          refType: 'purchase_order',
          refId: order.id,
          note: sign === 1 ? 'incoming confirm' : 'incoming reverse',
        },
      ];
    });
    if (movements.length === 0) return;
    await this.inventory.applyStockChanges(transaction, movements, actor);
  }

  #supplier(input: SupplierInput): SupplierInput {
    if (!SUPPLIER_STATUSES.includes(input.status)) {
      throw validation('status', 'SUPPLIER_STATUS_INVALID');
    }
    if (
      input.qualityRating !== null &&
      (!Number.isSafeInteger(input.qualityRating) ||
        input.qualityRating < 1 ||
        input.qualityRating > 5)
    ) {
      throw validation('qualityRating', 'SUPPLIER_QUALITY_RATING_INVALID');
    }
    return {
      code: boundedString(input.code, 40, 'code').toUpperCase(),
      legalName: boundedString(input.legalName, 200, 'legalName'),
      contactName: optionalString(input.contactName, 160, 'contactName'),
      email: optionalString(input.email, 254, 'email'),
      phone: optionalString(input.phone, 40, 'phone'),
      address: optionalString(input.address, 500, 'address'),
      status: input.status,
      qualityRating: input.qualityRating,
      notes: optionalString(input.notes, 2000, 'notes'),
    };
  }

  #supplierPatch(input: Partial<SupplierInput>): Partial<SupplierInput> {
    return {
      ...(input.legalName === undefined
        ? {}
        : { legalName: boundedString(input.legalName, 200, 'legalName') }),
      ...(input.contactName === undefined
        ? {}
        : { contactName: optionalString(input.contactName, 160, 'contactName') }),
      ...(input.email === undefined ? {} : { email: optionalString(input.email, 254, 'email') }),
      ...(input.phone === undefined ? {} : { phone: optionalString(input.phone, 40, 'phone') }),
      ...(input.address === undefined
        ? {}
        : { address: optionalString(input.address, 500, 'address') }),
      ...(input.status === undefined
        ? {}
        : { status: this.#supplier({ ...this.#emptySupplier(), ...input }).status }),
      ...(input.qualityRating === undefined
        ? {}
        : { qualityRating: this.#supplier({ ...this.#emptySupplier(), ...input }).qualityRating }),
      ...(input.notes === undefined ? {} : { notes: optionalString(input.notes, 2000, 'notes') }),
    };
  }

  #emptySupplier(): SupplierInput {
    return {
      code: 'X',
      legalName: 'X',
      contactName: null,
      email: null,
      phone: null,
      address: null,
      status: 'ACTIVE',
      qualityRating: null,
      notes: null,
    };
  }

  #orderHeader(input: PurchaseOrderWrite): PurchaseOrderWrite {
    if (!/^[A-Z]{3}$/u.test(input.currency)) throw validation('currency', 'CURRENCY_INVALID');
    return {
      number: boundedString(input.number, 40, 'number'),
      supplierId: uuid(input.supplierId, 'supplierId'),
      currency: input.currency,
      expectedAt: input.expectedAt,
      notes: optionalString(input.notes, 2000, 'notes'),
      destinationStockLocationId:
        input.destinationStockLocationId === null || input.destinationStockLocationId === undefined
          ? null
          : uuid(input.destinationStockLocationId, 'destinationStockLocationId'),
      freightCostMinor: money(input.freightCostMinor, 'freightCostMinor'),
      dutyCostMinor: money(input.dutyCostMinor, 'dutyCostMinor'),
      otherCostMinor: money(input.otherCostMinor, 'otherCostMinor'),
    };
  }

  #orderLine(line: PurchaseOrderLineDraft, path: string): PurchaseOrderLineWrite {
    const quantityOrdered = positiveInt(line.quantityOrdered, `${path}.quantityOrdered`);
    const unitCostMinor = money(line.unitCostMinor, `${path}.unitCostMinor`);
    const taxMinor = money(line.taxMinor, `${path}.taxMinor`);
    const lineTotalMinor = deriveLineTotal(unitCostMinor, quantityOrdered, taxMinor);
    if (line.lineTotalMinor !== undefined && line.lineTotalMinor !== lineTotalMinor) {
      throw validation(`${path}.lineTotalMinor`, 'LINE_TOTAL_MISMATCH');
    }
    return {
      description: boundedString(line.description, 240, `${path}.description`),
      variantId:
        line.variantId === null || line.variantId === undefined
          ? null
          : uuid(line.variantId, `${path}.variantId`),
      harvestBatchId:
        line.harvestBatchId === null || line.harvestBatchId === undefined
          ? null
          : uuid(line.harvestBatchId, `${path}.harvestBatchId`),
      quantityOrdered,
      unitCostMinor,
      taxMinor,
      lineTotalMinor,
    };
  }

  #limit(value: number | undefined): number {
    const limit = value ?? 24;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw validation('limit', 'PAGE_LIMIT_INVALID');
    }
    return limit;
  }

  #actor(principal: AuthenticatedPrincipal, metadata: RequestMetadata): ProcurementActorContext {
    return { actorUserId: principal.userId, metadata };
  }

  #rethrow(error: unknown): never {
    if (
      error instanceof ValidationAppError ||
      error instanceof ConflictAppError ||
      error instanceof NotFoundAppError ||
      error instanceof ForbiddenAppError
    ) {
      throw error;
    }
    if (typeof error === 'object' && error !== null && 'code' in error) {
      if (error.code === 'P2002') throw new ConflictAppError({ code: 'PROCUREMENT_CONFLICT' });
      if (error.code === 'P2003') throw new NotFoundAppError();
    }
    throw error;
  }
}
