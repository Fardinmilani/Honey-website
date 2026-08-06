import type { PrismaClient } from '../src/generated/prisma/client.js';

const seedTime = new Date('2026-01-01T00:00:00.000Z');

function identitySeedId(value: number): string {
  return `018f0000-0000-7000-8000-${value.toString(16).padStart(12, '0')}`;
}

export const seedIds = {
  ownerUser: '018f0000-0000-7000-8000-000000000001',
  ownerRole: '018f0000-0000-7000-8000-000000000002',
  customerRole: '018f0000-0000-7000-8000-000000000003',
  catalogReadPermission: '018f0000-0000-7000-8000-000000000004',
  catalogWritePermission: '018f0000-0000-7000-8000-000000000005',
  inventoryReadPermission: '018f0000-0000-7000-8000-000000000006',
  inventoryAdjustPermission: '018f0000-0000-7000-8000-000000000007',
  ownerRolePermission: '018f0000-0000-7000-8000-000000000008',
  ownerRolePermissionWrite: '018f0000-0000-7000-8000-000000000009',
  ownerInventoryPermission: '018f0000-0000-7000-8000-00000000000a',
  ownerInventoryAdjustPermission: '018f0000-0000-7000-8000-00000000000b',
  ownerUserRole: '018f0000-0000-7000-8000-00000000000c',
  ownerCredential: '018f0000-0000-7000-8000-00000000000d',
  category: '018f0000-0000-7000-8000-000000000010',
  categoryFa: '018f0000-0000-7000-8000-000000000011',
  categoryEn: '018f0000-0000-7000-8000-000000000012',
  collection: '018f0000-0000-7000-8000-000000000013',
  collectionFa: '018f0000-0000-7000-8000-000000000014',
  collectionEn: '018f0000-0000-7000-8000-000000000015',
  apiary: '018f0000-0000-7000-8000-000000000020',
  apiaryFa: '018f0000-0000-7000-8000-000000000021',
  apiaryEn: '018f0000-0000-7000-8000-000000000022',
  supplier: '018f0000-0000-7000-8000-000000000023',
  ownBatch: '018f0000-0000-7000-8000-000000000024',
  suppliedBatch: '018f0000-0000-7000-8000-000000000025',
  ownProduct: '018f0000-0000-7000-8000-000000000030',
  ownProductFa: '018f0000-0000-7000-8000-000000000031',
  ownProductEn: '018f0000-0000-7000-8000-000000000032',
  ownVariant: '018f0000-0000-7000-8000-000000000033',
  ownVariantFa: '018f0000-0000-7000-8000-000000000034',
  ownVariantEn: '018f0000-0000-7000-8000-000000000035',
  suppliedProduct: '018f0000-0000-7000-8000-000000000036',
  suppliedProductFa: '018f0000-0000-7000-8000-000000000037',
  suppliedProductEn: '018f0000-0000-7000-8000-000000000038',
  suppliedVariant: '018f0000-0000-7000-8000-000000000039',
  suppliedVariantFa: '018f0000-0000-7000-8000-00000000003a',
  suppliedVariantEn: '018f0000-0000-7000-8000-00000000003b',
  ownProductCategory: '018f0000-0000-7000-8000-000000000040',
  suppliedProductCategory: '018f0000-0000-7000-8000-000000000041',
  ownProductCollection: '018f0000-0000-7000-8000-000000000042',
  suppliedProductCollection: '018f0000-0000-7000-8000-000000000043',
  ownAllocation: '018f0000-0000-7000-8000-000000000044',
  suppliedAllocation: '018f0000-0000-7000-8000-000000000045',
  location: '018f0000-0000-7000-8000-000000000050',
  ownInventory: '018f0000-0000-7000-8000-000000000051',
  suppliedInventory: '018f0000-0000-7000-8000-000000000052',
  ownLedger: '018f0000-0000-7000-8000-000000000053',
  suppliedLedger: '018f0000-0000-7000-8000-000000000054',
  ownPrice: '018f0000-0000-7000-8000-000000000060',
  suppliedPrice: '018f0000-0000-7000-8000-000000000061',
  taxRate: '018f0000-0000-7000-8000-000000000062',
  shippingZone: '018f0000-0000-7000-8000-000000000070',
  shippingMethod: '018f0000-0000-7000-8000-000000000071',
  shippingMethodFa: '018f0000-0000-7000-8000-000000000072',
  shippingMethodEn: '018f0000-0000-7000-8000-000000000073',
  shippingRate: '018f0000-0000-7000-8000-000000000074',
  aboutPage: '018f0000-0000-7000-8000-000000000080',
  aboutPageFa: '018f0000-0000-7000-8000-000000000081',
  aboutPageEn: '018f0000-0000-7000-8000-000000000082',
  localeSetting: '018f0000-0000-7000-8000-000000000090',
  currencySetting: '018f0000-0000-7000-8000-000000000091',
} as const;

export type SeedOptions = Readonly<{
  staffEmail: string;
  staffPasswordHash?: string;
}>;

export async function seedDatabase(client: PrismaClient, options: SeedOptions): Promise<void> {
  const commonAudit = { createdAt: seedTime, updatedAt: seedTime };

  await client.user.upsert({
    where: { id: seedIds.ownerUser },
    create: {
      id: seedIds.ownerUser,
      email: options.staffEmail,
      displayName: 'Development Owner',
      preferredLocale: 'fa',
      isStaff: true,
      ...commonAudit,
    },
    update: {
      email: options.staffEmail,
      displayName: 'Development Owner',
      preferredLocale: 'fa',
      isStaff: true,
      updatedAt: seedTime,
    },
  });

  const roles = [
    { id: seedIds.ownerRole, code: 'OWNER', name: 'Owner' },
    { id: identitySeedId(0x1001), code: 'ADMIN', name: 'Administrator' },
    { id: identitySeedId(0x1002), code: 'ORDER_MANAGER', name: 'Order manager' },
    { id: identitySeedId(0x1003), code: 'INVENTORY_MANAGER', name: 'Inventory manager' },
    { id: identitySeedId(0x1004), code: 'CONTENT_EDITOR', name: 'Content editor' },
    { id: identitySeedId(0x1005), code: 'SUPPORT', name: 'Support' },
    { id: seedIds.customerRole, code: 'CUSTOMER', name: 'Customer' },
  ] as const;
  for (const role of roles) {
    await client.role.upsert({
      where: { id: role.id },
      create: { ...role, ...commonAudit },
      update: { code: role.code, name: role.name, updatedAt: seedTime },
    });
  }

  const permissions = [
    { id: seedIds.catalogReadPermission, code: 'catalog:read' },
    { id: seedIds.catalogWritePermission, code: 'catalog:write' },
    { id: seedIds.inventoryReadPermission, code: 'inventory:read' },
    { id: seedIds.inventoryAdjustPermission, code: 'inventory:adjust' },
    { id: identitySeedId(0x1101), code: 'catalog:publish' },
    { id: identitySeedId(0x1102), code: 'procurement:read' },
    { id: identitySeedId(0x1103), code: 'procurement:write' },
    { id: identitySeedId(0x1104), code: 'order:read' },
    { id: identitySeedId(0x1105), code: 'order:write' },
    { id: identitySeedId(0x1106), code: 'order:refund' },
    { id: identitySeedId(0x1107), code: 'order:cancel' },
    { id: identitySeedId(0x1108), code: 'customer:read' },
    { id: identitySeedId(0x1109), code: 'customer:export' },
    { id: identitySeedId(0x110a), code: 'content:read' },
    { id: identitySeedId(0x110b), code: 'content:write' },
    { id: identitySeedId(0x110c), code: 'content:publish' },
    { id: identitySeedId(0x110d), code: 'review:moderate' },
    { id: identitySeedId(0x110e), code: 'settings:read' },
    { id: identitySeedId(0x110f), code: 'settings:write' },
    { id: identitySeedId(0x1110), code: 'role:grant' },
    { id: identitySeedId(0x1111), code: 'audit:read' },
  ] as const;
  for (const permission of permissions) {
    await client.permission.upsert({
      where: { id: permission.id },
      create: { ...permission, createdAt: seedTime },
      update: { code: permission.code },
    });
  }

  const bundles = new Map<string, readonly string[]>([
    ['OWNER', permissions.map((permission) => permission.code)],
    [
      'ADMIN',
      permissions
        .map((permission) => permission.code)
        .filter((code) => code !== 'role:grant' && code !== 'settings:write'),
    ],
    [
      'ORDER_MANAGER',
      ['order:read', 'order:write', 'order:refund', 'order:cancel', 'customer:read'],
    ],
    [
      'INVENTORY_MANAGER',
      ['inventory:read', 'inventory:adjust', 'procurement:read', 'procurement:write'],
    ],
    [
      'CONTENT_EDITOR',
      [
        'catalog:read',
        'catalog:write',
        'catalog:publish',
        'content:read',
        'content:write',
        'content:publish',
        'review:moderate',
      ],
    ],
    ['SUPPORT', ['order:read', 'customer:read']],
    ['CUSTOMER', []],
  ]);
  const permissionsByCode = new Map<string, (typeof permissions)[number]>(
    permissions.map((permission) => [permission.code, permission]),
  );
  let assignmentNumber = 0x2000;
  for (const role of roles) {
    for (const permissionCode of bundles.get(role.code) ?? []) {
      const permission = permissionsByCode.get(permissionCode);
      if (permission === undefined) throw new Error(`Unknown seeded permission ${permissionCode}.`);
      const existing = await client.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      });
      if (existing === null) {
        await client.rolePermission.create({
          data: {
            id: identitySeedId(assignmentNumber),
            roleId: role.id,
            permissionId: permission.id,
          },
        });
      }
      assignmentNumber += 1;
    }
  }

  await client.userRole.upsert({
    where: { id: seedIds.ownerUserRole },
    create: {
      id: seedIds.ownerUserRole,
      userId: seedIds.ownerUser,
      roleId: seedIds.ownerRole,
      grantedBy: seedIds.ownerUser,
      grantedAt: seedTime,
    },
    update: {
      userId: seedIds.ownerUser,
      roleId: seedIds.ownerRole,
      grantedBy: seedIds.ownerUser,
      grantedAt: seedTime,
    },
  });

  if (options.staffPasswordHash !== undefined && options.staffPasswordHash.length > 0) {
    await client.authCredential.upsert({
      where: { id: seedIds.ownerCredential },
      create: {
        id: seedIds.ownerCredential,
        userId: seedIds.ownerUser,
        type: 'PASSWORD',
        secretHash: options.staffPasswordHash,
        createdAt: seedTime,
      },
      update: { secretHash: options.staffPasswordHash },
    });
  }

  await client.category.upsert({
    where: { id: seedIds.category },
    create: { id: seedIds.category, path: 'honey', ...commonAudit },
    update: { path: 'honey', updatedAt: seedTime },
  });
  const categoryTranslations = [
    { id: seedIds.categoryFa, locale: 'fa', name: 'عسل', slug: 'asal' },
    { id: seedIds.categoryEn, locale: 'en', name: 'Honey', slug: 'honey' },
  ];
  for (const translation of categoryTranslations) {
    await client.categoryTranslation.upsert({
      where: { id: translation.id },
      create: { ...translation, categoryId: seedIds.category },
      update: { locale: translation.locale, name: translation.name, slug: translation.slug },
    });
  }

  await client.collection.upsert({
    where: { id: seedIds.collection },
    create: { id: seedIds.collection, ...commonAudit },
    update: { updatedAt: seedTime },
  });
  const collectionTranslations = [
    { id: seedIds.collectionFa, locale: 'fa', name: 'برداشت کوهستان', slug: 'bardasht-koohestan' },
    { id: seedIds.collectionEn, locale: 'en', name: 'Mountain Harvest', slug: 'mountain-harvest' },
  ];
  for (const translation of collectionTranslations) {
    await client.collectionTranslation.upsert({
      where: { id: translation.id },
      create: { ...translation, collectionId: seedIds.collection },
      update: { locale: translation.locale, name: translation.name, slug: translation.slug },
    });
  }

  await client.apiary.upsert({
    where: { id: seedIds.apiary },
    create: {
      id: seedIds.apiary,
      code: 'APIARY-MOUNTAIN-01',
      name: 'Mountain Apiary',
      region: 'Azerbaijan',
      altitudeBand: '1,600–1,900 m',
      ...commonAudit,
    },
    update: {
      name: 'Mountain Apiary',
      region: 'Azerbaijan',
      altitudeBand: '1,600–1,900 m',
      updatedAt: seedTime,
    },
  });
  const apiaryTranslations = [
    {
      id: seedIds.apiaryFa,
      locale: 'fa',
      name: 'زنبورستان کوهستان',
      description: 'دامنه‌ای پر از گل‌های وحشی',
    },
    {
      id: seedIds.apiaryEn,
      locale: 'en',
      name: 'Mountain Apiary',
      description: 'Wildflower-covered mountain slopes',
    },
  ];
  for (const translation of apiaryTranslations) {
    await client.apiaryTranslation.upsert({
      where: { id: translation.id },
      create: { ...translation, apiaryId: seedIds.apiary },
      update: {
        locale: translation.locale,
        name: translation.name,
        description: translation.description,
      },
    });
  }

  await client.supplier.upsert({
    where: { id: seedIds.supplier },
    create: {
      id: seedIds.supplier,
      code: 'SUPPLY-SELECTED-01',
      legalName: 'Selected Supply Fixture',
      qualityRating: 5,
      notes: 'Synthetic internal development record.',
      ...commonAudit,
    },
    update: {
      legalName: 'Selected Supply Fixture',
      qualityRating: 5,
      notes: 'Synthetic internal development record.',
      updatedAt: seedTime,
    },
  });

  await client.harvestBatch.upsert({
    where: { id: seedIds.ownBatch },
    create: {
      id: seedIds.ownBatch,
      batchCode: 'OWN-2026-001',
      sourcingType: 'OWN_PRODUCTION',
      apiaryId: seedIds.apiary,
      harvestSeason: 'spring',
      harvestYear: 2026,
      floralSources: ['wildflower'],
      quantityGrams: 120000,
      ...commonAudit,
    },
    update: {
      sourcingType: 'OWN_PRODUCTION',
      apiaryId: seedIds.apiary,
      supplierId: null,
      harvestSeason: 'spring',
      harvestYear: 2026,
      floralSources: ['wildflower'],
      quantityGrams: 120000,
      updatedAt: seedTime,
    },
  });
  await client.harvestBatch.upsert({
    where: { id: seedIds.suppliedBatch },
    create: {
      id: seedIds.suppliedBatch,
      batchCode: 'SELECTED-2026-001',
      sourcingType: 'SELECTED_SUPPLIER',
      supplierId: seedIds.supplier,
      harvestSeason: 'summer',
      harvestYear: 2026,
      floralSources: ['thyme'],
      quantityGrams: 90000,
      ...commonAudit,
    },
    update: {
      sourcingType: 'SELECTED_SUPPLIER',
      apiaryId: null,
      supplierId: seedIds.supplier,
      harvestSeason: 'summer',
      harvestYear: 2026,
      floralSources: ['thyme'],
      quantityGrams: 90000,
      updatedAt: seedTime,
    },
  });

  const products = [
    {
      id: seedIds.ownProduct,
      source: 'OWN_PRODUCTION' as const,
      apiaryId: seedIds.apiary,
      varietal: 'Wildflower',
      season: 'spring',
    },
    {
      id: seedIds.suppliedProduct,
      source: 'SELECTED_SUPPLIER' as const,
      apiaryId: null,
      varietal: 'Thyme',
      season: 'summer',
    },
  ];
  for (const product of products) {
    await client.product.upsert({
      where: { id: product.id },
      create: {
        id: product.id,
        status: 'DRAFT',
        primaryCategoryId: seedIds.category,
        honeyVarietal: product.varietal,
        floralSources: [product.varietal.toLowerCase()],
        originRegion: 'Azerbaijan',
        harvestSeason: product.season,
        apiaryId: product.apiaryId,
        sourcingType: product.source,
        ...commonAudit,
      },
      update: {
        status: 'DRAFT',
        primaryCategoryId: seedIds.category,
        honeyVarietal: product.varietal,
        floralSources: [product.varietal.toLowerCase()],
        originRegion: 'Azerbaijan',
        harvestSeason: product.season,
        apiaryId: product.apiaryId,
        sourcingType: product.source,
        updatedAt: seedTime,
      },
    });
  }

  const variants = [
    { id: seedIds.ownVariant, productId: seedIds.ownProduct, sku: 'HNY-WILD-450' },
    { id: seedIds.suppliedVariant, productId: seedIds.suppliedProduct, sku: 'HNY-THYME-450' },
  ];
  for (const variant of variants) {
    await client.productVariant.upsert({
      where: { id: variant.id },
      create: {
        ...variant,
        status: 'DRAFT',
        netWeightGrams: 450,
        jarSizeLabelKey: 'jar.450g',
        packagingTypeKey: 'packaging.glass',
        weightGramsShipping: 700,
        dimensionsMm: [85, 85, 120],
        isDefault: true,
        ...commonAudit,
      },
      update: {
        sku: variant.sku,
        netWeightGrams: 450,
        jarSizeLabelKey: 'jar.450g',
        packagingTypeKey: 'packaging.glass',
        weightGramsShipping: 700,
        dimensionsMm: [85, 85, 120],
        isDefault: true,
        updatedAt: seedTime,
      },
    });
  }
  await client.product.update({
    where: { id: seedIds.ownProduct },
    data: { defaultVariantId: seedIds.ownVariant, updatedAt: seedTime },
  });
  await client.product.update({
    where: { id: seedIds.suppliedProduct },
    data: { defaultVariantId: seedIds.suppliedVariant, updatedAt: seedTime },
  });

  const productTranslations = [
    {
      id: seedIds.ownProductFa,
      productId: seedIds.ownProduct,
      locale: 'fa',
      name: 'عسل گل‌های وحشی',
      slug: 'asal-golhaye-vahshi',
      tastingNotes: 'گلی و نرم',
    },
    {
      id: seedIds.ownProductEn,
      productId: seedIds.ownProduct,
      locale: 'en',
      name: 'Wildflower Honey',
      slug: 'wildflower-honey',
      tastingNotes: 'Floral and rounded',
    },
    {
      id: seedIds.suppliedProductFa,
      productId: seedIds.suppliedProduct,
      locale: 'fa',
      name: 'عسل آویشن',
      slug: 'asal-avishan',
      tastingNotes: 'گیاهی و گرم',
    },
    {
      id: seedIds.suppliedProductEn,
      productId: seedIds.suppliedProduct,
      locale: 'en',
      name: 'Thyme Honey',
      slug: 'thyme-honey',
      tastingNotes: 'Herbal and warm',
    },
  ];
  for (const translation of productTranslations) {
    await client.productTranslation.upsert({
      where: { id: translation.id },
      create: translation,
      update: {
        name: translation.name,
        slug: translation.slug,
        tastingNotes: translation.tastingNotes,
      },
    });
  }

  const variantTranslations = [
    {
      id: seedIds.ownVariantFa,
      variantId: seedIds.ownVariant,
      locale: 'fa',
      name: 'شیشه ۴۵۰ گرمی',
    },
    { id: seedIds.ownVariantEn, variantId: seedIds.ownVariant, locale: 'en', name: '450 g jar' },
    {
      id: seedIds.suppliedVariantFa,
      variantId: seedIds.suppliedVariant,
      locale: 'fa',
      name: 'شیشه ۴۵۰ گرمی',
    },
    {
      id: seedIds.suppliedVariantEn,
      variantId: seedIds.suppliedVariant,
      locale: 'en',
      name: '450 g jar',
    },
  ];
  for (const translation of variantTranslations) {
    await client.variantTranslation.upsert({
      where: { id: translation.id },
      create: translation,
      update: { name: translation.name },
    });
  }

  const productCategories = [
    { id: seedIds.ownProductCategory, productId: seedIds.ownProduct },
    { id: seedIds.suppliedProductCategory, productId: seedIds.suppliedProduct },
  ];
  for (const item of productCategories) {
    await client.productCategory.upsert({
      where: { id: item.id },
      create: { ...item, categoryId: seedIds.category },
      update: { productId: item.productId, categoryId: seedIds.category },
    });
  }
  const productCollections = [
    { id: seedIds.ownProductCollection, productId: seedIds.ownProduct, position: 0 },
    { id: seedIds.suppliedProductCollection, productId: seedIds.suppliedProduct, position: 1 },
  ];
  for (const item of productCollections) {
    await client.productCollection.upsert({
      where: { id: item.id },
      create: { ...item, collectionId: seedIds.collection },
      update: {
        productId: item.productId,
        collectionId: seedIds.collection,
        position: item.position,
      },
    });
  }

  const allocations = [
    { id: seedIds.ownAllocation, harvestBatchId: seedIds.ownBatch, variantId: seedIds.ownVariant },
    {
      id: seedIds.suppliedAllocation,
      harvestBatchId: seedIds.suppliedBatch,
      variantId: seedIds.suppliedVariant,
    },
  ];
  for (const allocation of allocations) {
    await client.batchAllocation.upsert({
      where: { id: allocation.id },
      create: { ...allocation, quantityUnits: 100, packedAt: seedTime, createdAt: seedTime },
      update: { quantityUnits: 100, packedAt: seedTime },
    });
  }

  await client.stockLocation.upsert({
    where: { id: seedIds.location },
    create: {
      id: seedIds.location,
      code: 'MAIN',
      name: 'Main stock',
      type: 'WAREHOUSE',
      isSellable: true,
      isDefault: true,
      ...commonAudit,
    },
    update: { name: 'Main stock', isSellable: true, isDefault: true, updatedAt: seedTime },
  });

  const inventory = [
    { id: seedIds.ownInventory, variantId: seedIds.ownVariant, onHand: 100 },
    { id: seedIds.suppliedInventory, variantId: seedIds.suppliedVariant, onHand: 100 },
  ];
  for (const item of inventory) {
    await client.inventoryItem.upsert({
      where: { id: item.id },
      create: { ...item, stockLocationId: seedIds.location, ...commonAudit },
      update: {
        onHand: item.onHand,
        reserved: 0,
        allocated: 0,
        incoming: 0,
        version: 0,
        updatedAt: seedTime,
      },
    });
  }

  const ledgerEntries = [
    { id: seedIds.ownLedger, variantId: seedIds.ownVariant, refId: seedIds.ownBatch },
    {
      id: seedIds.suppliedLedger,
      variantId: seedIds.suppliedVariant,
      refId: seedIds.suppliedBatch,
    },
  ];
  for (const entry of ledgerEntries) {
    const existing = await client.stockLedgerEntry.findUnique({
      where: { id: entry.id },
      select: { id: true },
    });
    if (existing === null) {
      await client.stockLedgerEntry.create({
        data: {
          ...entry,
          stockLocationId: seedIds.location,
          delta: 100,
          reason: 'RECEIPT',
          refType: 'harvest_batch',
          createdAt: seedTime,
        },
      });
    }
  }

  const prices = [
    { id: seedIds.ownPrice, variantId: seedIds.ownVariant, amountMinor: 48500000n },
    { id: seedIds.suppliedPrice, variantId: seedIds.suppliedVariant, amountMinor: 52500000n },
  ];
  for (const price of prices) {
    await client.variantPrice.upsert({
      where: { id: price.id },
      create: { ...price, currency: 'IRR', validFrom: seedTime, ...commonAudit },
      update: {
        amountMinor: price.amountMinor,
        currency: 'IRR',
        validFrom: seedTime,
        updatedAt: seedTime,
      },
    });
  }

  await client.taxRate.upsert({
    where: { id: seedIds.taxRate },
    create: {
      id: seedIds.taxRate,
      code: 'IR-DEFAULT',
      name: 'Default',
      rateBps: 0,
      country: 'IR',
      ...commonAudit,
    },
    update: { name: 'Default', rateBps: 0, country: 'IR', updatedAt: seedTime },
  });

  await client.shippingZone.upsert({
    where: { id: seedIds.shippingZone },
    create: {
      id: seedIds.shippingZone,
      name: 'Iran',
      countries: ['IR'],
      provinces: [],
      ...commonAudit,
    },
    update: { name: 'Iran', countries: ['IR'], provinces: [], updatedAt: seedTime },
  });
  await client.shippingMethod.upsert({
    where: { id: seedIds.shippingMethod },
    create: {
      id: seedIds.shippingMethod,
      code: 'manual-flat',
      zoneId: seedIds.shippingZone,
      provider: 'manual-flat',
      ...commonAudit,
    },
    update: {
      zoneId: seedIds.shippingZone,
      provider: 'manual-flat',
      isActive: true,
      updatedAt: seedTime,
    },
  });
  const methodTranslations = [
    { id: seedIds.shippingMethodFa, locale: 'fa', name: 'ارسال استاندارد' },
    { id: seedIds.shippingMethodEn, locale: 'en', name: 'Standard delivery' },
  ];
  for (const translation of methodTranslations) {
    await client.shippingMethodTranslation.upsert({
      where: { id: translation.id },
      create: { ...translation, shippingMethodId: seedIds.shippingMethod },
      update: { locale: translation.locale, name: translation.name },
    });
  }
  await client.shippingRate.upsert({
    where: { id: seedIds.shippingRate },
    create: {
      id: seedIds.shippingRate,
      methodId: seedIds.shippingMethod,
      currency: 'IRR',
      baseMinor: 0n,
      validFrom: seedTime,
      ...commonAudit,
    },
    update: { currency: 'IRR', baseMinor: 0n, validFrom: seedTime, updatedAt: seedTime },
  });

  await client.page.upsert({
    where: { id: seedIds.aboutPage },
    create: { id: seedIds.aboutPage, key: 'about', ...commonAudit },
    update: { key: 'about', updatedAt: seedTime },
  });
  const pageTranslations = [
    {
      id: seedIds.aboutPageFa,
      locale: 'fa',
      title: 'درباره ما',
      slug: 'darbare-ma',
      blocks: [{ type: 'paragraph', text: 'روایت زنبورستان‌های کوهستانی ما' }],
    },
    {
      id: seedIds.aboutPageEn,
      locale: 'en',
      title: 'About us',
      slug: 'about-us',
      blocks: [{ type: 'paragraph', text: 'The story of our mountain apiaries' }],
    },
  ];
  for (const translation of pageTranslations) {
    await client.pageTranslation.upsert({
      where: { id: translation.id },
      create: { ...translation, pageId: seedIds.aboutPage },
      update: { title: translation.title, slug: translation.slug, blocks: translation.blocks },
    });
  }

  await client.setting.upsert({
    where: { id: seedIds.localeSetting },
    create: {
      id: seedIds.localeSetting,
      key: 'enabled_locales',
      valueJson: ['fa', 'en'],
      ...commonAudit,
    },
    update: { valueJson: ['fa', 'en'], updatedAt: seedTime },
  });
  await client.setting.upsert({
    where: { id: seedIds.currencySetting },
    create: {
      id: seedIds.currencySetting,
      key: 'enabled_currencies',
      valueJson: ['IRR'],
      ...commonAudit,
    },
    update: { valueJson: ['IRR'], updatedAt: seedTime },
  });
}

export async function readSeedFingerprint(
  client: PrismaClient,
): Promise<Readonly<Record<string, unknown>>> {
  const [users, products, translations, batches, inventory, ledger, settings] = await Promise.all([
    client.user.count(),
    client.product.count(),
    client.productTranslation.count(),
    client.harvestBatch.count(),
    client.inventoryItem.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, onHand: true, reserved: true, allocated: true },
    }),
    client.stockLedgerEntry.count(),
    client.setting.findMany({ orderBy: { key: 'asc' }, select: { key: true, valueJson: true } }),
  ]);
  return { users, products, translations, batches, inventory, ledger, settings };
}
