export interface paths {
  '/healthz': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Check process liveness
     * @description Reports whether the HTTP process is alive without querying dependencies.
     */
    get: operations['getHealth'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/readyz': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Check required dependencies
     * @description Reports readiness after a bounded PostgreSQL dependency check.
     */
    get: operations['getReadiness'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/audit': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read safe filtered audit metadata without secret-bearing JSON
     * @description STAFF audit:read query with keyset paging and validated actor, subject, action and date-range filters. Raw audit JSON and network metadata are omitted.
     */
    get: operations['listAdminAudit'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/categories': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read bounded category hierarchy and translations
     * @description STAFF catalog:read query returning owned category hierarchy and all translations, optionally filtered by UUID.
     */
    get: operations['listAdminCategories'];
    put?: never;
    /**
     * Create a catalog category
     * @description Create a catalog category.
     */
    post: operations['createCatalogCategory'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/categories/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Update category ordering
     * @description Update category ordering.
     */
    put: operations['updateCatalogCategory'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/categories/{id}/move': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Move a category hierarchy subtree
     * @description Move a category hierarchy subtree.
     */
    post: operations['moveCatalogCategory'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/categories/{id}/translations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Create or update a category translation
     * @description Create or update a category translation.
     */
    put: operations['upsertCatalogCategoryTranslation'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/collections': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read bounded collections and translations
     * @description STAFF catalog:read query returning collection publication state and translations, optionally filtered by UUID.
     */
    get: operations['listAdminCollections'];
    put?: never;
    /**
     * Create a draft catalog collection
     * @description Create a draft catalog collection.
     */
    post: operations['createCatalogCollection'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/collections/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Update collection ordering
     * @description Update collection ordering.
     */
    put: operations['updateCatalogCollection'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/collections/{id}/archive': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Archive a catalog collection
     * @description Archive a catalog collection.
     */
    post: operations['archiveCatalogCollection'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/collections/{id}/publish': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Publish a complete catalog collection
     * @description Publish a complete catalog collection.
     */
    post: operations['publishCatalogCollection'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/collections/{id}/translations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Create or update a collection translation
     * @description Create or update a collection translation.
     */
    put: operations['upsertCatalogCollectionTranslation'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/products': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read products of all publication states with locale completeness inputs
     * @description STAFF catalog:read query with bounded keyset pagination, SKU or localized-name search, and publication-state filtering.
     */
    get: operations['listAdminProducts'];
    put?: never;
    /**
     * Create a draft catalog product
     * @description Create a draft catalog product.
     */
    post: operations['createCatalogProduct'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/products/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read an internal catalog product
     * @description Read an internal catalog product.
     */
    get: operations['getAdminCatalogProduct'];
    /**
     * Update catalog product fields
     * @description Update catalog product fields.
     */
    put: operations['updateCatalogProduct'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/products/{id}/archive': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Archive a catalog product
     * @description Archive a catalog product.
     */
    post: operations['archiveCatalogProduct'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/products/{id}/categories': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Assign a category to a product
     * @description Assign a category to a product.
     */
    post: operations['assignCatalogProductCategory'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/products/{id}/categories/{relationId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /**
     * Remove a product category assignment
     * @description Remove a product category assignment.
     */
    delete: operations['unassignCatalogProductCategory'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/products/{id}/collections': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Assign a product to a collection
     * @description Assign a product to a collection.
     */
    post: operations['assignCatalogProductCollection'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/products/{id}/collections/{relationId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /**
     * Remove a product collection assignment
     * @description Remove a product collection assignment.
     */
    delete: operations['unassignCatalogProductCollection'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/products/{id}/media': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Attach a verified public media asset
     * @description Attach a verified public media asset.
     */
    post: operations['attachCatalogProductMedia'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/products/{id}/media/{attachmentId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /**
     * Detach media from a product
     * @description Detach media from a product.
     */
    delete: operations['detachCatalogProductMedia'];
    options?: never;
    head?: never;
    /**
     * Update product media presentation fields
     * @description Update product media presentation fields.
     */
    patch: operations['updateCatalogProductMedia'];
    trace?: never;
  };
  '/v1/admin/catalog/products/{id}/publish': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Publish a complete catalog product
     * @description Publish a complete catalog product.
     */
    post: operations['publishCatalogProduct'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/products/{id}/translations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Create or update a product translation
     * @description Create or update a product translation.
     */
    put: operations['upsertCatalogProductTranslation'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/products/{id}/variants': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Create a draft product variant
     * @description Create a draft product variant.
     */
    post: operations['createCatalogVariant'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/products/{id}/variants/{variantId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Update product variant fields
     * @description Update product variant fields.
     */
    put: operations['updateCatalogVariant'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/products/{id}/variants/{variantId}/archive': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Archive a product variant
     * @description Archive a product variant.
     */
    post: operations['archiveCatalogVariant'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/products/{id}/variants/{variantId}/default': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Set the product default variant
     * @description Set the product default variant.
     */
    post: operations['setDefaultCatalogVariant'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/products/{id}/variants/{variantId}/publish': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Publish a draft product variant
     * @description Publish a draft product variant.
     */
    post: operations['publishCatalogVariant'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/catalog/products/{id}/variants/{variantId}/translations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Create or update a variant translation
     * @description Create or update a variant translation.
     */
    put: operations['upsertCatalogVariantTranslation'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/content/{kind}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read bounded editorial content and translation completeness
     * @description Read bounded editorial content and translation completeness.
     */
    get: operations['listAdminContent'];
    put?: never;
    /**
     * Create an audited editorial draft
     * @description Create an audited editorial draft.
     */
    post: operations['createAdminContent'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/content/{kind}/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read private editorial content
     * @description Read private editorial content.
     */
    get: operations['getAdminContent'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/content/{kind}/{id}/archive': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Archive editorial content and invalidate public surfaces
     * @description Archive editorial content and invalidate public surfaces.
     */
    post: operations['archiveContent'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/content/{kind}/{id}/publish': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Publish only complete enabled-locale editorial content
     * @description Publish only complete enabled-locale editorial content.
     */
    post: operations['publishContent'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/content/{kind}/{id}/translations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Save a validated plain-text block translation
     * @description Save a validated plain-text block translation.
     */
    put: operations['saveContentTranslation'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/customers': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Audited exact email or UUID customer lookup
     * @description STAFF customer:read lookup excludes staff, credentials and sessions, masks phone numbers, and records only the result count in the audit.
     */
    get: operations['lookupAdminCustomers'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/fulfilment/orders/{orderId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read staff fulfilment details
     * @description Returns order lines and shipment state to staff with order:read permission.
     */
    get: operations['getFulfilmentOrder'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/fulfilment/orders/{orderId}/cancel': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Cancel an unshipped order and release its allocation
     * @description Cancels an order before any shipment draft exists and releases its allocated stock.
     */
    post: operations['cancelUnshippedFulfilmentOrder'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/fulfilment/orders/{orderId}/shipments': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Prepare a shipment draft without moving physical stock
     * @description Creates one idempotent shipment draft for paid, allocated order lines.
     */
    post: operations['createFulfilmentShipment'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/fulfilment/shipments/{shipmentId}/deliver': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Record manual delivery
     * @description Records delivery for a shipment already in transit without moving stock again.
     */
    post: operations['deliverFulfilmentShipment'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/fulfilment/shipments/{shipmentId}/dispatch': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Confirm physical dispatch and consume allocated stock once
     * @description Atomically moves allocated stock out of inventory and marks the shipment in transit.
     */
    post: operations['dispatchFulfilmentShipment'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/inventory/adjustments': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Apply a privileged inventory adjustment
     * @description Apply a privileged inventory adjustment.
     */
    post: operations['adminAdjustInventory'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/inventory/items': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List inventory items
     * @description List inventory items.
     */
    get: operations['adminListInventoryItems'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/inventory/items/{variantId}/{stockLocationId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read one inventory item
     * @description Read one inventory item.
     */
    get: operations['adminGetInventoryItem'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/inventory/items/{variantId}/{stockLocationId}/planning': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /**
     * Update inventory planning fields
     * @description Update inventory planning fields.
     */
    patch: operations['adminUpdateInventoryPlanning'];
    trace?: never;
  };
  '/v1/admin/inventory/ledger/{variantId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List stock ledger entries for a variant
     * @description List stock ledger entries for a variant.
     */
    get: operations['adminListStockLedger'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/inventory/locations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List stock locations
     * @description List stock locations.
     */
    get: operations['adminListStockLocations'];
    put?: never;
    /**
     * Create a stock location
     * @description Create a stock location.
     */
    post: operations['adminCreateStockLocation'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/inventory/locations/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /**
     * Update a stock location
     * @description Update a stock location.
     */
    patch: operations['adminUpdateStockLocation'];
    trace?: never;
  };
  '/v1/admin/inventory/locations/page': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read bounded stock locations
     * @description Staff-only cursor query over inventory-owned locations.
     */
    get: operations['listAdminStockLocations'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/inventory/reconciliation': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Detect and optionally repair inventory drift
     * @description Detect and optionally repair inventory drift.
     */
    post: operations['adminReconcileInventory'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/media': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read a bounded media library
     * @description Staff-only trusted metadata; private assets have no permanent public URL.
     */
    get: operations['listAdminMedia'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/media/{assetId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get trusted media metadata
     * @description Returns safe persisted metadata and canonical public URLs only when public.
     */
    get: operations['getMediaAsset'];
    put?: never;
    post?: never;
    /**
     * Delete an unattached media asset
     * @description Deletes only a media asset that is not protected by an attachment constraint.
     */
    delete: operations['deleteMediaAsset'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/media/{assetId}/alt-text': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /**
     * Replace localized media alt text
     * @description Validates canonical BCP-47 locale keys and bounded plain-text values.
     */
    patch: operations['updateMediaAltText'];
    trace?: never;
  };
  '/v1/admin/media/{assetId}/private-url': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Create a short-lived private media URL
     * @description Signs only the stored key of an authorized private media asset.
     */
    post: operations['createPrivateMediaUrl'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/media/upload-intents': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Authorize one direct media upload
     * @description Creates an owner-bound, short-lived upload intent and a constrained direct-to-storage POST authorization.
     */
    post: operations['createMediaUploadIntent'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/media/upload-intents/{uploadId}/complete': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Verify and process a direct upload
     * @description Consumes the owner-bound intent, verifies stored bytes by magic number, processes images, and persists only trusted metadata.
     */
    post: operations['completeMediaUpload'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/notifications/templates': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read bounded per-locale templates
     * @description Read bounded per-locale templates.
     */
    get: operations['listNotificationTemplates'];
    /**
     * Save an audited template with explicit allowed placeholders
     * @description Save an audited template with explicit allowed placeholders.
     */
    put: operations['saveNotificationTemplate'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/notifications/templates/preview': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Render safe synthetic preview without sending a message
     * @description Render safe synthetic preview without sending a message.
     */
    post: operations['previewNotificationTemplate'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/orders': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read a bounded staff order page
     * @description STAFF order:read query with exact order-number or customer-email filters and keyset pagination.
     */
    get: operations['listAdminOrders'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/orders/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read immutable staff order snapshots
     * @description Reads frozen order lines, addresses and stored totals. Requires STAFF order:read.
     */
    get: operations['getAdminOrder'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/orders/{id}/notes': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read internal order notes
     * @description Reads a bounded page of staff-only notes after checking the order exists.
     */
    get: operations['listAdminOrderNotes'];
    put?: never;
    /**
     * Add one internal plain-text order note and audit atomically
     * @description STAFF order:note write protected by CSRF. Stores bounded internal text and audit metadata in one transaction.
     */
    post: operations['addAdminOrderNote'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/payments/{paymentId}/refund-requests': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Request an idempotent staff refund with recent TOTP verification
     * @description The key is mandatory. Same-key retries return the persisted refund; altered input conflicts. Server-owned provider capabilities, refundable cap and verified payment outcomes remain authoritative.
     */
    post: operations['requestIdempotentAdminRefund'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/payments/{paymentId}/refunds': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Refund a paid payment (requires a recent step-up)
     * @description Rejects with a conflict unless the staff session has recently re-verified its TOTP via POST /v1/me/step-up. The server, not the caller, computes the refundable cap.
     */
    post: operations['requestPaymentRefund'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/payments/orders/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read bounded safe payment and refund records
     * @description Returns stored amounts, provider capabilities and bounded refund history without provider credentials or references. API authorization is authoritative.
     */
    get: operations['listAdminOrderPayments'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/pricing/coupons': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List internal coupon records
     * @description List internal coupon records.
     */
    get: operations['adminListCoupons'];
    put?: never;
    /**
     * Create a validated coupon record
     * @description Create a validated coupon record.
     */
    post: operations['adminCreateCoupon'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/pricing/coupons/{id}/status': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /**
     * Change coupon status with a concurrency check
     * @description Change coupon status with a concurrency check.
     */
    patch: operations['setAdminCouponStatus'];
    trace?: never;
  };
  '/v1/admin/pricing/coupons/page': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read a bounded coupon page
     * @description Read a bounded coupon page.
     */
    get: operations['pageAdminCoupons'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/pricing/tax-rates': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List internal tax-rate records
     * @description List internal tax-rate records.
     */
    get: operations['adminListTaxRates'];
    put?: never;
    /**
     * Create a validated tax-rate record
     * @description Create a validated tax-rate record.
     */
    post: operations['adminCreateTaxRate'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/pricing/tax-rates/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Update a validated tax configuration record
     * @description Update a validated tax configuration record.
     */
    put: operations['updateAdminTaxRate'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/pricing/tax-rates/page': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read a bounded tax configuration page
     * @description Read a bounded tax configuration page.
     */
    get: operations['pageAdminTaxRates'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/pricing/variant-prices': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List internal variant price records
     * @description List internal variant price records.
     */
    get: operations['adminListVariantPrices'];
    put?: never;
    /**
     * Create a validated variant price record
     * @description Create a validated variant price record.
     */
    post: operations['adminCreateVariantPrice'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/pricing/variant-prices/page': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read a bounded variant price page
     * @description Read a bounded variant price page.
     */
    get: operations['pageAdminVariantPrices'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/procurement/purchase-orders': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List purchase orders
     * @description List purchase orders.
     */
    get: operations['adminListPurchaseOrders'];
    put?: never;
    /**
     * Create a draft purchase order
     * @description Create a draft purchase order.
     */
    post: operations['adminCreatePurchaseOrder'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/procurement/purchase-orders/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read one purchase order
     * @description Read one purchase order.
     */
    get: operations['adminGetPurchaseOrder'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/procurement/purchase-orders/{id}/landed-cost': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read internal landed-cost allocation
     * @description Read internal landed-cost allocation.
     */
    get: operations['adminGetLandedCost'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/procurement/purchase-orders/{id}/lines': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Replace draft purchase-order lines
     * @description Replace draft purchase-order lines.
     */
    post: operations['adminReplacePurchaseOrderLines'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/procurement/purchase-orders/{id}/receipts': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Receive goods against a purchase order
     * @description Receive goods against a purchase order.
     */
    post: operations['adminCreateGoodsReceipt'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/procurement/purchase-orders/{id}/transition': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Apply an explicit purchase-order transition
     * @description Apply an explicit purchase-order transition.
     */
    post: operations['adminTransitionPurchaseOrder'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/procurement/suppliers': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List suppliers
     * @description List suppliers.
     */
    get: operations['adminListSuppliers'];
    put?: never;
    /**
     * Create a supplier
     * @description Create a supplier.
     */
    post: operations['adminCreateSupplier'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/procurement/suppliers/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read one supplier
     * @description Read one supplier.
     */
    get: operations['adminGetSupplier'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /**
     * Update a supplier
     * @description Update a supplier.
     */
    patch: operations['adminUpdateSupplier'];
    trace?: never;
  };
  '/v1/admin/reviews': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read the bounded moderation queue with safe product context
     * @description Read the bounded moderation queue with safe product context.
     */
    get: operations['listPendingReviews'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/reviews/{id}/approve': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Approve a pending review after publication-policy checks
     * @description Approve a pending review after publication-policy checks.
     */
    post: operations['approveReview'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/reviews/{id}/reject': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Reject a pending review without rewriting customer text
     * @description Reject a pending review without rewriting customer text.
     */
    post: operations['rejectReview'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/shipping/configuration': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read shipping configuration
     * @description Returns configured shipping zones, methods, translations, and rate rules for staff.
     */
    get: operations['listShippingConfiguration'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/shipping/methods/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Configure a shipping method
     * @description Creates or replaces one localized manual shipping method.
     */
    put: operations['upsertShippingMethod'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/shipping/rates/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Configure a shipping rate
     * @description Creates or replaces one integer-minor-unit manual rate rule.
     */
    put: operations['upsertShippingRate'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/shipping/zones/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Configure a shipping zone
     * @description Creates or replaces one server-owned destination zone.
     */
    put: operations['upsertShippingZone'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/sourcing/allocations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Create a batch allocation
     * @description Create a batch allocation.
     */
    post: operations['adminCreateBatchAllocation'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/sourcing/apiaries': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List apiaries
     * @description List apiaries.
     */
    get: operations['adminListApiaries'];
    put?: never;
    /**
     * Create an apiary
     * @description Create an apiary.
     */
    post: operations['adminCreateApiary'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/sourcing/apiaries/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read one apiary
     * @description Read one apiary.
     */
    get: operations['adminGetApiary'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /**
     * Update an apiary
     * @description Update an apiary.
     */
    patch: operations['adminUpdateApiary'];
    trace?: never;
  };
  '/v1/admin/sourcing/apiaries/{id}/translations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Upsert an apiary translation
     * @description Upsert an apiary translation.
     */
    post: operations['adminUpsertApiaryTranslation'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/sourcing/apiaries/page': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read bounded apiaries and translations
     * @description Staff-only cursor query over sourcing-owned apiaries.
     */
    get: operations['listAdminApiaries'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/sourcing/harvest-batches': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List harvest batches
     * @description List harvest batches.
     */
    get: operations['adminListHarvestBatches'];
    put?: never;
    /**
     * Create a harvest batch
     * @description Create a harvest batch.
     */
    post: operations['adminCreateHarvestBatch'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/sourcing/harvest-batches/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read one harvest batch
     * @description Read one harvest batch.
     */
    get: operations['adminGetHarvestBatch'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/sourcing/harvest-batches/{id}/allocations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List allocations for a harvest batch
     * @description List allocations for a harvest batch.
     */
    get: operations['adminListBatchAllocations'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/sourcing/harvest-batches/{id}/allocations/page': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read bounded packing allocations
     * @description Staff-only cursor query that verifies the harvest batch exists.
     */
    get: operations['listAdminBatchAllocations'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/admin/sourcing/production-intake': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Record own-production inventory intake
     * @description Record own-production inventory intake.
     */
    post: operations['adminProductionIntake'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/auth/email-verification/confirm': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Confirm email verification
     * @description Consumes one valid, unexpired verification token and atomically marks the email verified.
     */
    post: operations['confirmEmailVerification'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/auth/email-verification/request': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Request email verification
     * @description Returns the same accepted response regardless of whether an eligible account exists.
     */
    post: operations['requestEmailVerification'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/auth/login': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Authenticate with email and password
     * @description Creates a customer session or a short-lived staff TOTP challenge after generic credential validation.
     */
    post: operations['login'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/auth/logout': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Revoke the current session
     * @description Revokes the server-side session before clearing the matching authentication cookies.
     */
    post: operations['logout'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/auth/logout-all': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Revoke every active session
     * @description Immediately revokes every active session owned by the authenticated account.
     */
    post: operations['logoutAll'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/auth/password-reset/confirm': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Confirm a password reset
     * @description Consumes one reset token, replaces the Argon2id credential, and revokes existing sessions.
     */
    post: operations['confirmPasswordReset'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/auth/password-reset/request': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Request a password reset
     * @description Rate-limits the request and returns an enumeration-safe accepted response.
     */
    post: operations['requestPasswordReset'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/auth/register': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Register a customer account
     * @description Creates only a CUSTOMER account and sends a one-time verification email when accepted.
     */
    post: operations['registerCustomer'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/auth/staff/totp/confirm': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Complete staff TOTP authentication
     * @description Consumes the pre-authentication cookie and creates a staff session only after valid TOTP verification.
     */
    post: operations['confirmStaffTotp'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/cart': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read the current server-priced cart
     * @description Read the current server-priced cart.
     */
    get: operations['getCart'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/cart/coupon': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Apply one coupon to the current cart
     * @description Apply one coupon to the current cart.
     */
    post: operations['applyCartCoupon'];
    /**
     * Remove the coupon from the current cart
     * @description Remove the coupon from the current cart.
     */
    delete: operations['removeCartCoupon'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/cart/lines': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Add a variant to the current cart
     * @description Add a variant to the current cart.
     */
    post: operations['addCartLine'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/cart/lines/{lineId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /**
     * Remove one current-cart line
     * @description Remove one current-cart line.
     */
    delete: operations['removeCartLine'];
    options?: never;
    head?: never;
    /**
     * Set one current-cart line quantity
     * @description Set one current-cart line quantity.
     */
    patch: operations['updateCartLine'];
    trace?: never;
  };
  '/v1/catalog/categories': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List localized catalog categories
     * @description List localized catalog categories.
     */
    get: operations['listCatalogCategories'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/catalog/categories/{slug}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Resolve one localized category slug
     * @description Resolve one localized category slug.
     */
    get: operations['getCatalogCategoryBySlug'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/catalog/categories/{slug}/products': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List products in one category
     * @description List products in one category.
     */
    get: operations['listCatalogCategoryProducts'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/catalog/collections': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List published localized collections
     * @description List published localized collections.
     */
    get: operations['listCatalogCollections'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/catalog/collections/{slug}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Resolve one localized collection slug
     * @description Resolve one localized collection slug.
     */
    get: operations['getCatalogCollectionBySlug'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/catalog/collections/{slug}/products': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List products in one collection
     * @description List products in one collection.
     */
    get: operations['listCatalogCollectionProducts'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/catalog/products': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List published localized products
     * @description List published localized products.
     */
    get: operations['listCatalogProducts'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/catalog/products/{slug}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Resolve one localized product slug
     * @description Resolve one localized product slug.
     */
    get: operations['getCatalogProductBySlug'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/catalog/search': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Search published products in one locale
     * @description Search published products in one locale.
     */
    get: operations['searchCatalogProducts'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/checkout': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Start an owner-scoped checkout
     * @description Creates a checkout from the server-derived cart owner. The client may send contact and address selections only; money and owner fields are rejected.
     */
    post: operations['startCheckout'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/checkout/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read the current owner checkout
     * @description Returns the caller-owned checkout. Another owner receives 404.
     */
    get: operations['getCheckout'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/checkout/{id}/confirm': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Create one pending-payment order
     * @description Creates exactly one UNPAID order from the locked checkout snapshot. Replays with the same Idempotency-Key return the same order.
     */
    post: operations['confirmCheckout'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/checkout/{id}/extend': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Extend an active checkout reservation hold once, up to the 30-minute maximum
     * @description The server computes the new expiry. The client sends no body and cannot set the hold length.
     */
    post: operations['extendCheckoutReservation'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/checkout/{id}/shipping-selection': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Select a server-owned shipping quote for this checkout
     * @description Only an owned quote identifier is accepted. The server validates the destination, method, rate, and checkout pricing before selection.
     */
    post: operations['selectCheckoutShippingQuote'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/content/{kind}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read published content in the requested locale without fallback
     * @description Read published content in the requested locale without fallback.
     */
    get: operations['listPublishedContent'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/content/{kind}/{slug}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Resolve a published locale slug
     * @description Resolve a published locale slug.
     */
    get: operations['getPublishedContent'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/me': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get the authenticated account
     * @description Returns only the safe account and effective authorization summary for the current principal.
     */
    get: operations['getMe'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/me/reviews': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Submit one immutable pending review with server-verified purchase linkage
     * @description Submit one immutable pending review with server-verified purchase linkage.
     */
    post: operations['submitProductReview'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/me/reviews/eligibility': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Check the authenticated customer’s own fully delivered purchase
     * @description Check the authenticated customer’s own fully delivered purchase.
     */
    get: operations['getReviewEligibility'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/me/sessions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List active sessions for this account
     * @description Lists only active sessions owned by the authenticated account.
     */
    get: operations['listMySessions'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/me/sessions/{sessionId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /**
     * Revoke one of this account’s sessions
     * @description Revokes an owned session and returns not found for a session owned by another account.
     */
    delete: operations['revokeMySession'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/me/step-up': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Re-verify staff TOTP for a sensitive action
     * @description Raises the current staff session's trust level for a short window; consumed by other modules (e.g. refunds) that require recent re-authentication rather than a bare session.
     */
    post: operations['requestStepUp'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/newsletter/confirm': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Explicitly consume an expiring newsletter-only confirmation token
     * @description Explicitly consume an expiring newsletter-only confirmation token.
     */
    post: operations['confirmNewsletterSubscription'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/newsletter/subscribe': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Request explicit-consent double opt-in with a generic response
     * @description Request explicit-consent double opt-in with a generic response.
     */
    post: operations['requestNewsletterSubscription'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/newsletter/unsubscribe': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Explicit idempotent newsletter opt-out with a secure token
     * @description Explicit idempotent newsletter opt-out with a secure token.
     */
    post: operations['unsubscribeNewsletter'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/orders': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List current customer account orders
     * @description Guests receive 404. Authenticated customers receive only their own orders.
     */
    get: operations['listMyOrders'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/orders/{number}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read one owner-scoped order
     * @description Returns one owner-scoped order. Another owner or a guessed order number receives 404.
     */
    get: operations['getMyOrder'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/payments': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Start (or resume) payment for an order
     * @description Creates or resumes a payment from the server-owned order total. The client may send only the order number and an Idempotency-Key; money and card fields are rejected.
     */
    post: operations['startPayment'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/payments/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read one owner-scoped payment
     * @description Returns the caller-owned payment projection. Another owner receives 404. Responses are private and must not be stored.
     */
    get: operations['getPayment'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/payments/{id}/return': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Verify the provider outcome after the customer returns from the gateway
     * @description The browser only signals "check now" — every field it carries in the query string is ignored; the server re-verifies its own stored provider reference (ADR-0022).
     */
    post: operations['verifyPaymentReturn'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/products/{productId}/reviews': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Read approved reviews and their exact approved-only aggregate
     * @description Read approved reviews and their exact approved-only aggregate.
     */
    get: operations['listApprovedProductReviews'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/webhooks/payments/{provider}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Receive a signed provider webhook event
     * @description Accepts the exact raw body for signature verification. CSRF is not used; invalid signatures are persisted and ignored.
     */
    post: operations['receivePaymentWebhook'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    AcceptedDto: {
      /** @enum {boolean} */
      accepted: true;
    };
    AcceptedResponseDto: {
      /** @example true */
      accepted: boolean;
    };
    AdminCategoryAssignmentDto: {
      /** Format: date-time */
      deletedAt: string | null;
      /**
       * Format: uuid
       * @description Assigned category identifier.
       */
      id: string;
    };
    AdminCollectionAssignmentDto: {
      /**
       * Format: uuid
       * @description Assigned collection identifier.
       */
      id: string;
      position: number;
    };
    AdminContentDto: {
      id: string;
      key: string;
      /** @enum {string} */
      kind: 'page' | 'article' | 'faq';
      publishedAt: string | null;
      /** @enum {string} */
      status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
      translations: components['schemas']['TranslationDto'][];
      updatedAt: string;
    };
    AdminContentPageDto: {
      items: components['schemas']['AdminContentDto'][];
      nextCursor: string | null;
    };
    AdminMediaAttachmentDto: {
      altTextByLocale: {
        [key: string]: string;
      };
      /** Format: uuid */
      id: string;
      /** Format: uuid */
      mediaAssetId: string;
      position: number;
      /** @enum {string} */
      role: 'GALLERY' | 'THUMBNAIL' | 'LIFESTYLE' | 'VIDEO';
      /** Format: uuid */
      variantId?: string | null;
    };
    AdminPaymentDto: {
      amountMinor: string;
      canRefund: boolean;
      /** Format: date-time */
      createdAt: string;
      currency: string;
      /** Format: uuid */
      id: string;
      /** Format: uuid */
      orderId: string;
      /** Format: date-time */
      paidAt: string | null;
      partialRefund: boolean;
      provider: string;
      refunds: components['schemas']['AdminRefundDto'][];
      remainingRefundableMinor: string;
      status: string;
    };
    AdminPaymentPageDto: {
      items: components['schemas']['AdminPaymentDto'][];
      nextCursor: string | null;
    };
    AdminProductDto: {
      /** Format: uuid */
      apiaryId: string | null;
      brandLine: string | null;
      categories: components['schemas']['AdminCategoryAssignmentDto'][];
      collections: components['schemas']['AdminCollectionAssignmentDto'][];
      /** Format: uuid */
      defaultVariantId: string | null;
      floralSources: string[];
      harvestSeason: string | null;
      honeyVarietal: string | null;
      /** Format: uuid */
      id: string;
      media: components['schemas']['AdminMediaAttachmentDto'][];
      originAltitudeBand: string | null;
      originRegion: string | null;
      /** Format: uuid */
      primaryCategoryId: string | null;
      publishedAt: string | null;
      sku: string | null;
      sortWeight: number;
      /** @enum {string} */
      sourcingType: 'OWN_PRODUCTION' | 'SELECTED_SUPPLIER';
      /** @enum {string} */
      status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
      translations: components['schemas']['AdminProductTranslationDto'][];
      variants: components['schemas']['AdminVariantDto'][];
    };
    AdminProductPageDto: {
      items: components['schemas']['AdminProductSummaryDto'][];
      nextCursor: string | null;
    };
    AdminProductSummaryDto: {
      id: string;
      sku: string | null;
      /** @enum {string} */
      status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
      translations: components['schemas']['AdminTranslationSummaryDto'][];
      /** Format: date-time */
      updatedAt: string;
    };
    AdminProductTranslationDto: {
      description?: string | null;
      /** Format: uuid */
      id: string;
      locale: string;
      metaDescription?: string | null;
      metaTitle?: string | null;
      name: string;
      pairingSuggestions?: string | null;
      shortDescription?: string | null;
      slug: string;
      storyHtml?: string | null;
      tastingNotes?: string | null;
    };
    AdminRefundDto: {
      amountMinor: string;
      /** Format: date-time */
      completedAt: string | null;
      /** Format: date-time */
      createdAt: string;
      /** Format: uuid */
      id: string;
      reason: string;
      status: string;
    };
    AdminReviewDto: {
      body: string;
      createdAt: string;
      id: string;
      locale: string;
      /** Format: uuid */
      productId: string;
      productNames: {
        [key: string]: string;
      };
      rating: number;
      /** @enum {string} */
      status: 'PENDING' | 'APPROVED' | 'REJECTED';
      title: string;
      /** @enum {boolean} */
      verifiedPurchase: true;
    };
    AdminTaxonomyDto: {
      id: string;
      parentId: string | null;
      path: string | null;
      sortWeight: number;
      status: string | null;
      translations: components['schemas']['AdminTaxonomyTranslationDto'][];
    };
    AdminTaxonomyPageDto: {
      items: components['schemas']['AdminTaxonomyDto'][];
      nextCursor: string | null;
    };
    AdminTaxonomyTranslationDto: {
      description?: string | null;
      locale: string;
      metaDescription?: string | null;
      metaTitle?: string | null;
      name: string;
      slug: string;
    };
    AdminTranslationSummaryDto: {
      locale: string;
      name: string;
      slug: string;
    };
    AdminVariantDto: {
      barcode?: string | null;
      /** Format: date-time */
      deletedAt: string | null;
      dimensionsMm: number[];
      /** Format: uuid */
      id: string;
      isDefault: boolean;
      jarSizeLabelKey: string;
      netWeightGrams: number;
      packagingTypeKey: string;
      position: number;
      /** Format: uuid */
      productId: string;
      sku: string;
      /** @enum {string} */
      status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
      translations: components['schemas']['AdminVariantTranslationDto'][];
      weightGramsShipping: number;
    };
    AdminVariantTranslationDto: {
      /** Format: uuid */
      id: string;
      locale: string;
      name: string;
    };
    AggregateDto: {
      average: number;
      count: number;
    };
    AllocationPageDto: {
      items: components['schemas']['AllocationQueryItemDto'][];
      nextCursor: string | null;
    };
    AllocationQueryItemDto: {
      /** Format: date-time */
      createdAt: string;
      /** Format: uuid */
      harvestBatchId: string;
      /** Format: uuid */
      id: string;
      notes: string | null;
      /** Format: date-time */
      packedAt: string;
      quantityUnits: number;
      /** Format: uuid */
      variantId: string;
    };
    ApiaryPageDto: {
      items: components['schemas']['ApiaryQueryItemDto'][];
      nextCursor: string | null;
    };
    ApiaryQueryItemDto: {
      altitudeBand: string | null;
      code: string;
      /** Format: date-time */
      createdAt: string;
      /** Format: uuid */
      id: string;
      isOwnOperation: boolean;
      name: string;
      notes: string | null;
      region: string;
      translations: components['schemas']['ApiaryTranslationDto'][];
      /** Format: date-time */
      updatedAt: string;
    };
    ApiaryTranslationDto: {
      description: string | null;
      locale: string;
      name: string;
    };
    AuditEntryDto: {
      action: string;
      actorUserId: string | null;
      /** Format: date-time */
      createdAt: string;
      id: string;
      requestId: string | null;
      subjectId: string;
      subjectType: string;
    };
    AuditPageDto: {
      items: components['schemas']['AuditEntryDto'][];
      nextCursor: string | null;
    };
    AuthenticatedResponseDto: {
      /** @description Double-submit value for X-CSRF-Token. */
      csrfToken: string;
      /** Format: date-time */
      expiresAt: string;
      /** @enum {string} */
      next: 'AUTHENTICATED';
      user: components['schemas']['SafeUserDto'];
    };
    CancelFulfilmentOrderResponseDto: {
      /** @example true */
      cancelled: boolean;
    };
    CartAdjustmentDto: {
      /** @enum {string} */
      code: 'QUANTITY_CLAMPED';
      /** Format: uuid */
      lineId: string;
    };
    CartCouponDto: {
      code: string;
      reason: string | null;
      /** @enum {string} */
      state: 'APPLIED' | 'INELIGIBLE' | 'DEFERRED';
    };
    CartLineDto: {
      /** @enum {string} */
      availabilityBand: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
      discount: components['schemas']['MoneyDto'];
      /** Format: uuid */
      id: string;
      lineSubtotal: components['schemas']['MoneyDto'];
      lineTotal: components['schemas']['MoneyDto'];
      product: components['schemas']['CartProductDto'];
      quantity: number;
      /** @enum {string} */
      state: 'PURCHASABLE' | 'OUT_OF_STOCK' | 'UNPUBLISHED' | 'PRICE_UNAVAILABLE';
      unitPrice: components['schemas']['MoneyDto'] | null;
      variant: components['schemas']['CartVariantDto'];
      /** Format: uuid */
      variantId: string;
    };
    CartProductDto: {
      /** Format: uuid */
      id: string;
      /** Format: uri */
      imageUrl: string | null;
      name: string;
      slug: string;
    };
    CartResponseDto: {
      adjustments: components['schemas']['CartAdjustmentDto'][];
      coupon: components['schemas']['CartCouponDto'] | null;
      currency: string;
      discountTotal: components['schemas']['MoneyDto'];
      /** Format: date-time */
      expiresAt: string;
      /** Format: uuid */
      id: string;
      lines: components['schemas']['CartLineDto'][];
      locale: string;
      merchandiseTotal: components['schemas']['MoneyDto'];
      subtotal: components['schemas']['MoneyDto'];
      tax: components['schemas']['CartTaxDto'];
    };
    CartTaxDto: {
      amount: components['schemas']['MoneyDto'] | null;
      /** @enum {string} */
      state: 'UNRESOLVED' | 'RESOLVED';
    };
    CartVariantDto: {
      name: string;
      netWeightGrams: number;
    };
    CategoryListResponseDto: {
      data: components['schemas']['PublicCategoryDto'][];
      meta: components['schemas']['MetaDto'];
    };
    CategoryResponseDto: {
      data: components['schemas']['PublicCategoryDto'];
      meta: components['schemas']['MetaDto'];
    };
    CheckoutResponseDto: {
      /** Format: email */
      email: string;
      /** Format: uuid */
      id: string;
      /** @enum {string} */
      status: 'OPEN' | 'AWAITING_PAYMENT' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
    };
    CollectionListResponseDto: {
      data: components['schemas']['PublicCollectionDto'][];
      meta: components['schemas']['MetaDto'];
    };
    CollectionResponseDto: {
      data: components['schemas']['PublicCollectionDto'];
      meta: components['schemas']['MetaDto'];
    };
    ConfirmCheckoutResponseDto: {
      checkout: components['schemas']['CheckoutResponseDto'];
      /** @example HNY-2026-000123 */
      orderNumber: string;
    };
    CouponPageDto: {
      items: components['schemas']['CouponResponseDto'][];
      nextCursor: string | null;
    };
    CouponResponseDto: {
      /** @enum {string} */
      appliesTo: 'ALL' | 'CATEGORY' | 'COLLECTION' | 'VARIANT';
      code: string;
      currency: string | null;
      /** Format: date-time */
      endsAt: string | null;
      /** Format: uuid */
      id: string;
      maxDiscountMinor: string | null;
      minSubtotalMinor: string | null;
      /** Format: date-time */
      startsAt: string;
      /** @enum {string} */
      status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED';
      targetIds: string[];
      /** @enum {string} */
      type: 'PERCENT' | 'FIXED' | 'FREE_SHIPPING';
      usageLimitPerUser: number | null;
      usageLimitTotal: number | null;
      value: string;
    };
    CouponStatusResponseDto: {
      id: string;
      /** @enum {string} */
      status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED';
    };
    CustomerDto: {
      /** Format: date-time */
      createdAt: string;
      displayName: string | null;
      email: string;
      emailVerified: boolean;
      id: string;
      phoneMasked: string | null;
      preferredLocale: string;
      status: string;
    };
    CustomerOrderResponseDto: {
      grandTotal: components['schemas']['MoneyDto'];
      /** @example HNY-2026-000123 */
      number: string;
      shipments?: components['schemas']['CustomerShipmentResponseDto'][];
      status: string;
    };
    CustomerPageDto: {
      items: components['schemas']['CustomerDto'][];
      nextCursor: string | null;
    };
    CustomerShipmentResponseDto: {
      /** Format: date-time */
      deliveredAt: string | null;
      /** Format: uuid */
      id: string;
      /** Format: date-time */
      shippedAt: string | null;
      /** @enum {string} */
      status: 'PENDING' | 'LABEL_CREATED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'RETURNED';
      trackingNumber: string | null;
      trackingUrl: string | null;
    };
    DirectUploadDto: {
      /** Format: date-time */
      expiresAt: string;
      fields: {
        [key: string]: string;
      };
      /** @enum {string} */
      method: 'POST';
      /** Format: uri */
      url: string;
    };
    EligibilityDto: {
      eligible: boolean;
    };
    HealthResponseDto: {
      /**
       * @example ok
       * @enum {string}
       */
      status: 'ok';
    };
    LoginResponseDto: {
      csrfToken?: string;
      /** Format: date-time */
      expiresAt?: string;
      /** @enum {string} */
      next: 'AUTHENTICATED' | 'TOTP_REQUIRED' | 'TOTP_ENROLLMENT_REQUIRED';
      /** @description Controlled TOTP enrollment URI; returned only after a valid staff password. */
      provisioningUri?: string;
      user?: components['schemas']['SafeUserDto'];
    };
    MediaAssetDto: {
      altTextByLocale: {
        [key: string]: string;
      };
      bytes: number;
      checksum: string;
      /** Format: date-time */
      createdAt: string;
      /** Format: uuid */
      createdBy: string;
      derivatives: components['schemas']['MediaDerivativeDto'][];
      durationSeconds: number | null;
      height: number | null;
      /** Format: uuid */
      id: string;
      /** @enum {string} */
      kind: 'IMAGE' | 'VIDEO';
      /** @enum {string} */
      mimeType:
        'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif' | 'video/mp4' | 'video/webm';
      /** Format: date-time */
      updatedAt: string;
      /** Format: uri */
      url: string | null;
      /** @enum {string} */
      visibility: 'PUBLIC' | 'PRIVATE';
      width: number | null;
    };
    MediaDerivativeDto: {
      bytes: number;
      checksum: string;
      /** @enum {string} */
      format: 'webp' | 'jpg';
      height: number;
      /** Format: uuid */
      id: string;
      /** @enum {string} */
      mimeType: 'image/webp' | 'image/jpeg';
      /** Format: uri */
      url: string | null;
      /** @enum {string} */
      variant: 'thumb' | 'card' | 'hero' | 'og';
      width: number;
    };
    MediaLibraryPageDto: {
      items: components['schemas']['MediaAssetDto'][];
      nextCursor: string | null;
    };
    MediaUploadIntentDto: {
      /** Format: uuid */
      assetId: string;
      /** Format: date-time */
      expiresAt: string;
      upload: components['schemas']['DirectUploadDto'];
      /** Format: uuid */
      uploadId: string;
    };
    MetaDto: {
      locale: string;
      requestId: string;
    };
    ModeratedDto: {
      id: string;
      /** @enum {string} */
      status: 'APPROVED' | 'REJECTED';
    };
    ModerationPageDto: {
      items: components['schemas']['AdminReviewDto'][];
      nextCursor: string | null;
    };
    MoneyDto: {
      /** @example 125000 */
      amountMinor: string;
      /** @example IRR */
      currency: string;
    };
    NoteDto: {
      actorUserId: string | null;
      body: string;
      /** Format: date-time */
      createdAt: string;
      /** Format: uuid */
      id: string;
    };
    NotePageDto: {
      items: components['schemas']['NoteDto'][];
      nextCursor: string | null;
    };
    OrderDetailDto: {
      billingAddress: {
        [key: string]: unknown;
      };
      currency: string;
      customerId: string | null;
      discountTotalMinor: string;
      email: string;
      fulfilmentStatus: string;
      grandTotalMinor: string;
      history: components['schemas']['OrderHistoryDto'][];
      /** Format: uuid */
      id: string;
      lines: components['schemas']['OrderLineDto'][];
      localeAtPurchase: string;
      number: string;
      paymentStatus: string;
      phone: string | null;
      /** Format: date-time */
      placedAt: string;
      refundedTotalMinor: string;
      shippingAddress: {
        [key: string]: unknown;
      };
      shippingMethod: {
        [key: string]: unknown;
      };
      shippingTotalMinor: string;
      /** @enum {string} */
      status:
        | 'PENDING_PAYMENT'
        | 'PAID'
        | 'PROCESSING'
        | 'PARTIALLY_FULFILLED'
        | 'FULFILLED'
        | 'COMPLETED'
        | 'CANCELLED'
        | 'REFUNDED'
        | 'PARTIALLY_REFUNDED'
        | 'FAILED';
      subtotalMinor: string;
      taxTotalMinor: string;
    };
    OrderHistoryDto: {
      /** Format: date-time */
      createdAt: string;
      fromStatus: string | null;
      id: string;
      toStatus: string;
    };
    OrderLineDto: {
      discountMinor: string;
      id: string;
      productName: {
        [key: string]: unknown;
      };
      quantity: number;
      sku: string;
      taxMinor: string;
      totalMinor: string;
      unitPriceMinor: string;
      variantName: {
        [key: string]: unknown;
      };
    };
    OrderPageDto: {
      items: components['schemas']['OrderSummaryDto'][];
      nextCursor: string | null;
    };
    OrderSummaryDto: {
      currency: string;
      email: string;
      fulfilmentStatus: string;
      grandTotalMinor: string;
      /** Format: uuid */
      id: string;
      number: string;
      paymentStatus: string;
      /** Format: date-time */
      placedAt: string;
      /** @enum {string} */
      status:
        | 'PENDING_PAYMENT'
        | 'PAID'
        | 'PROCESSING'
        | 'PARTIALLY_FULFILLED'
        | 'FULFILLED'
        | 'COMPLETED'
        | 'CANCELLED'
        | 'REFUNDED'
        | 'PARTIALLY_REFUNDED'
        | 'FAILED';
    };
    PageDto: {
      hasMore: boolean;
      limit: number;
      nextCursor: string | null;
    };
    PaymentResponseDto: {
      amount: components['schemas']['MoneyDto'];
      /** Format: date-time */
      createdAt: string;
      /** Format: uuid */
      id: string;
      /** @example HNY-2026-000123 */
      orderNumber: string;
      /** Format: date-time */
      paidAt: string | null;
      provider: string;
      redirectUrl: string | null;
      /** @enum {string} */
      status:
        | 'CREATED'
        | 'PENDING'
        | 'AUTHORIZED'
        | 'PAID'
        | 'FAILED'
        | 'CANCELLED'
        | 'EXPIRED'
        | 'REFUNDED'
        | 'PARTIALLY_REFUNDED';
    };
    PreviewDto: {
      allowedVariables: string[];
      /** @enum {string} */
      direction: 'rtl' | 'ltr';
      /** @enum {string} */
      locale: 'fa' | 'en';
      /** @enum {boolean} */
      smsEnabled: false;
      subject: string | null;
      text: string;
    };
    PricePageDto: {
      items: components['schemas']['VariantPriceResponseDto'][];
      nextCursor: string | null;
    };
    PrivateMediaUrlDto: {
      /** Format: date-time */
      expiresAt: string;
      /** Format: uri */
      url: string;
    };
    ProblemDetailsDto: {
      /** @example VALIDATION_FAILED */
      code: string;
      /** @example The request could not be processed. */
      detail?: string;
      errors?: components['schemas']['ValidationIssueDto'][];
      /** @example /v1/example */
      instance: string;
      /** @example 018f5d36-7b89-7a67-bb7a-e8f9f5db7412 */
      requestId: string;
      /** @example 422 */
      status: number;
      /** @example Request validation failed */
      title: string;
      /** @example https://api.honey.invalid/problems/validation-failed */
      type: string;
    };
    ProductListResponseDto: {
      data: components['schemas']['PublicProductDto'][];
      meta: components['schemas']['MetaDto'];
      page: components['schemas']['PageDto'];
    };
    ProductResponseDto: {
      data: components['schemas']['PublicProductDto'];
      meta: components['schemas']['MetaDto'];
    };
    PublicCatalogMediaDto: {
      altText: string;
      height: number | null;
      /** Format: uuid */
      id: string;
      /** @enum {string} */
      kind: 'IMAGE' | 'VIDEO';
      position: number;
      /** @enum {string} */
      role: 'GALLERY' | 'THUMBNAIL' | 'LIFESTYLE' | 'VIDEO';
      /** Format: uri */
      url: string;
      width: number | null;
    };
    PublicCategoryDto: {
      description: string | null;
      /** Format: uuid */
      id: string;
      metaDescription: string | null;
      metaTitle: string | null;
      name: string;
      /** Format: uuid */
      parentId: string | null;
      path: string;
      slug: string;
      sortWeight: number;
    };
    PublicCollectionDto: {
      description: string | null;
      /** Format: uuid */
      id: string;
      metaDescription: string | null;
      metaTitle: string | null;
      name: string;
      /** Format: date-time */
      publishedAt: string;
      slug: string;
      sortWeight: number;
    };
    PublicContentDto: {
      blocks: Record<string, never>[];
      id: string;
      /** @enum {string} */
      kind: 'page' | 'article' | 'faq';
      locale: string;
      media: {
        altTextByLocale?: {
          [key: string]: string;
        };
        height?: number | null;
        id?: string;
        kind?: string;
        url?: string;
        width?: number | null;
      }[];
      metaDescription: string | null;
      metaTitle: string | null;
      publishedAt: string;
      slug: string;
      slugs: {
        [key: string]: string;
      };
      title: string;
      updatedAt: string;
    };
    PublicContentPageDto: {
      items: components['schemas']['PublicContentDto'][];
      meta: {
        locale?: string;
      };
      nextCursor: string | null;
    };
    PublicProductDto: {
      brandLine: string | null;
      description: string | null;
      floralSources: string[];
      harvestSeason: string | null;
      honeyVarietal: string | null;
      /** Format: uuid */
      id: string;
      media: components['schemas']['PublicCatalogMediaDto'][];
      metaDescription: string | null;
      metaTitle: string | null;
      name: string;
      originAltitudeBand: string | null;
      originRegion: string | null;
      pairingSuggestions: string | null;
      /** Format: date-time */
      publishedAt: string;
      shortDescription: string | null;
      slug: string;
      storyHtml: string | null;
      tastingNotes: string | null;
      variants: components['schemas']['PublicVariantDto'][];
    };
    PublicVariantDto: {
      /** @enum {string} */
      availabilityBand: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
      dimensionsMm: number[];
      /** Format: uuid */
      id: string;
      isDefault: boolean;
      jarSizeLabelKey: string;
      name: string;
      netWeightGrams: number;
      packagingTypeKey: string;
      position: number;
      price?: {
        /** @example 125000 */
        amountMinor: string;
        /** @example IRR */
        currency: string;
      } | null;
      sku: string;
      weightGramsShipping: number;
    };
    ReadyResponseDto: {
      checks?: {
        /**
         * @example ready
         * @enum {string}
         */
        database: 'ready';
      };
      /**
       * @example ready
       * @enum {string}
       */
      status: 'ready';
    };
    RefundResponseDto: {
      amount: components['schemas']['MoneyDto'];
      /** Format: date-time */
      completedAt: string | null;
      /** Format: date-time */
      createdAt: string;
      /** Format: uuid */
      id: string;
      /** Format: uuid */
      paymentId: string;
      reason: string;
      /** @enum {string} */
      status: 'REQUESTED' | 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    };
    ReviewDto: {
      body: string;
      createdAt: string;
      id: string;
      locale: string;
      /** Format: uuid */
      productId: string;
      rating: number;
      title: string;
      /** @enum {boolean} */
      verifiedPurchase: true;
    };
    ReviewPageDto: {
      aggregate: components['schemas']['AggregateDto'] | null;
      items: components['schemas']['ReviewDto'][];
      nextCursor: string | null;
    };
    SafeUserDto: {
      displayName: string | null;
      /** Format: email */
      email: string;
      emailVerified: boolean;
      /** Format: uuid */
      id: string;
      isStaff: boolean;
      permissions: (
        | 'catalog:read'
        | 'catalog:write'
        | 'catalog:publish'
        | 'pricing:read'
        | 'pricing:write'
        | 'inventory:read'
        | 'inventory:adjust'
        | 'procurement:read'
        | 'procurement:write'
        | 'order:read'
        | 'order:write'
        | 'order:note'
        | 'order:refund'
        | 'order:cancel'
        | 'customer:read'
        | 'customer:export'
        | 'content:read'
        | 'content:write'
        | 'content:publish'
        | 'review:moderate'
        | 'review:submit'
        | 'settings:read'
        | 'settings:write'
        | 'role:grant'
        | 'audit:read'
      )[];
      /** @example fa */
      preferredLocale: string;
      roles: (
        | 'OWNER'
        | 'ADMIN'
        | 'ORDER_MANAGER'
        | 'INVENTORY_MANAGER'
        | 'CONTENT_EDITOR'
        | 'SUPPORT'
        | 'CUSTOMER'
      )[];
      /** @enum {string} */
      status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
    };
    SessionDto: {
      /** Format: date-time */
      createdAt: string;
      current: boolean;
      /** Format: date-time */
      expiresAt: string;
      /** Format: uuid */
      id: string;
      ip: string | null;
      /** @enum {string} */
      kind: 'CUSTOMER' | 'STAFF';
      /** Format: date-time */
      lastSeenAt: string;
      userAgentHash: string | null;
    };
    SessionsResponseDto: {
      sessions: components['schemas']['SessionDto'][];
    };
    ShipmentResponseDto: {
      /** Format: uuid */
      id: string;
      /** Format: uuid */
      orderId: string;
      /** @enum {string} */
      status: 'PENDING' | 'LABEL_CREATED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'RETURNED';
      trackingNumber: string | null;
      trackingUrl: string | null;
    };
    StepUpResponseDto: {
      /** @example true */
      accepted: boolean;
      /** Format: date-time */
      expiresAt: string;
    };
    StockLocationDto: {
      code: string;
      /** Format: date-time */
      createdAt: string;
      /** Format: uuid */
      id: string;
      isDefault: boolean;
      isSellable: boolean;
      name: string;
      /** @enum {string} */
      type: 'WAREHOUSE' | 'STUDIO' | 'EXTERNAL';
      /** Format: date-time */
      updatedAt: string;
    };
    StockLocationPageDto: {
      items: components['schemas']['StockLocationDto'][];
      nextCursor: string | null;
    };
    SubmittedDto: {
      id: string;
      /** @enum {string} */
      status: 'PENDING';
    };
    TaxPageDto: {
      items: components['schemas']['TaxRateResponseDto'][];
      nextCursor: string | null;
    };
    TaxRateResponseDto: {
      code: string;
      country: string;
      /** Format: uuid */
      id: string;
      isActive: boolean;
      isInclusive: boolean;
      rateBps: number;
      region: string | null;
    };
    TemplateListRecordDto: {
      allowedVariables: string[];
      body: string;
      /** @enum {string} */
      channel: 'EMAIL' | 'SMS';
      /** @enum {string} */
      code: 'shipment-shipped' | 'shipment-delivered' | 'newsletter-confirm' | 'newsletter-welcome';
      complete: boolean;
      id: string;
      /** @enum {string} */
      locale: 'fa' | 'en';
      subject: string | null;
      updatedAt: string;
    };
    TemplatePageDto: {
      items: components['schemas']['TemplateListRecordDto'][];
      nextCursor: string | null;
    };
    TemplateRecordDto: {
      body: string;
      /** @enum {string} */
      channel: 'EMAIL' | 'SMS';
      /** @enum {string} */
      code: 'shipment-shipped' | 'shipment-delivered' | 'newsletter-confirm' | 'newsletter-welcome';
      id: string;
      /** @enum {string} */
      locale: 'fa' | 'en';
      subject: string | null;
      updatedAt: string;
    };
    TranslationDto: {
      blocks: Record<string, never>[];
      locale: string;
      metaDescription: string | null;
      metaTitle: string | null;
      slug: string;
      title: string;
    };
    ValidationIssueDto: {
      /** @example INVALID_VALUE */
      code: string;
      /** @example field */
      path: string;
    };
    VariantPriceResponseDto: {
      /** @example 125000 */
      amountMinor: string;
      /** @example 150000 */
      compareAtMinor: string | null;
      currency: string;
      /** Format: uuid */
      id: string;
      /** Format: date-time */
      validFrom: string;
      /** Format: date-time */
      validTo: string | null;
      /** Format: uuid */
      variantId: string;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  getHealth: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The HTTP process is alive. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HealthResponseDto'];
        };
      };
      /** @description An unexpected failure occurred. */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  getReadiness: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description All required dependencies are ready. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ReadyResponseDto'];
        };
      };
      /** @description An unexpected failure occurred. */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      /** @description A required dependency is unavailable. */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  listAdminAudit: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuditPageDto'];
        };
      };
    };
  };
  listAdminCategories: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminTaxonomyPageDto'];
        };
      };
    };
  };
  createCatalogCategory: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** Format: uuid */
            id?: string;
          };
        };
      };
    };
  };
  updateCatalogCategory: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  moveCatalogCategory: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  upsertCatalogCategoryTranslation: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  listAdminCollections: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminTaxonomyPageDto'];
        };
      };
    };
  };
  createCatalogCollection: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** Format: uuid */
            id?: string;
          };
        };
      };
    };
  };
  updateCatalogCollection: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  archiveCatalogCollection: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  publishCatalogCollection: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  upsertCatalogCollectionTranslation: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  listAdminProducts: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminProductPageDto'];
        };
      };
    };
  };
  createCatalogProduct: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminProductDto'];
        };
      };
    };
  };
  getAdminCatalogProduct: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminProductDto'];
        };
      };
    };
  };
  updateCatalogProduct: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminProductDto'];
        };
      };
    };
  };
  archiveCatalogProduct: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminProductDto'];
        };
      };
    };
  };
  assignCatalogProductCategory: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  unassignCatalogProductCategory: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        relationId: string;
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  assignCatalogProductCollection: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  unassignCatalogProductCollection: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        relationId: string;
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  attachCatalogProductMedia: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminProductDto'];
        };
      };
    };
  };
  detachCatalogProductMedia: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        attachmentId: string;
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  updateCatalogProductMedia: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        attachmentId: string;
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminProductDto'];
        };
      };
    };
  };
  publishCatalogProduct: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminProductDto'];
        };
      };
    };
  };
  upsertCatalogProductTranslation: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminProductDto'];
        };
      };
    };
  };
  createCatalogVariant: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminProductDto'];
        };
      };
    };
  };
  updateCatalogVariant: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        variantId: string;
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminProductDto'];
        };
      };
    };
  };
  archiveCatalogVariant: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        variantId: string;
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminProductDto'];
        };
      };
    };
  };
  setDefaultCatalogVariant: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        variantId: string;
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminProductDto'];
        };
      };
    };
  };
  publishCatalogVariant: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        variantId: string;
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminProductDto'];
        };
      };
    };
  };
  upsertCatalogVariantTranslation: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        variantId: string;
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminProductDto'];
        };
      };
    };
  };
  listAdminContent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        kind: 'page' | 'article' | 'faq';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminContentPageDto'];
        };
      };
    };
  };
  createAdminContent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        kind: 'page' | 'article' | 'faq';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminContentDto'];
        };
      };
    };
  };
  getAdminContent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        kind: 'page' | 'article' | 'faq';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminContentDto'];
        };
      };
    };
  };
  archiveContent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        kind: 'page' | 'article' | 'faq';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminContentDto'];
        };
      };
    };
  };
  publishContent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        kind: 'page' | 'article' | 'faq';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminContentDto'];
        };
      };
    };
  };
  saveContentTranslation: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        kind: 'page' | 'article' | 'faq';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminContentDto'];
        };
      };
    };
  };
  lookupAdminCustomers: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CustomerPageDto'];
        };
      };
    };
  };
  getFulfilmentOrder: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        orderId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Order lines and shipments for staff fulfilment. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  cancelUnshippedFulfilmentOrder: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        orderId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CancelFulfilmentOrderResponseDto'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  createFulfilmentShipment: {
    parameters: {
      query?: never;
      header: {
        'Idempotency-Key': string;
      };
      path: {
        orderId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ShipmentResponseDto'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  deliverFulfilmentShipment: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        shipmentId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ShipmentResponseDto'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  dispatchFulfilmentShipment: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        shipmentId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ShipmentResponseDto'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  adminAdjustInventory: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminListInventoryItems: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminGetInventoryItem: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        stockLocationId: string;
        variantId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminUpdateInventoryPlanning: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        stockLocationId: string;
        variantId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminListStockLedger: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        variantId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminListStockLocations: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminCreateStockLocation: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminUpdateStockLocation: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  listAdminStockLocations: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['StockLocationPageDto'];
        };
      };
    };
  };
  adminReconcileInventory: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  listAdminMedia: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['MediaLibraryPageDto'];
        };
      };
    };
  };
  getMediaAsset: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        assetId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['MediaAssetDto'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  deleteMediaAsset: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        assetId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  updateMediaAltText: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        assetId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['MediaAssetDto'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  createPrivateMediaUrl: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        assetId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PrivateMediaUrlDto'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  createMediaUploadIntent: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['MediaUploadIntentDto'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  completeMediaUpload: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        uploadId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['MediaAssetDto'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  listNotificationTemplates: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TemplatePageDto'];
        };
      };
    };
  };
  saveNotificationTemplate: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TemplateRecordDto'];
        };
      };
    };
  };
  previewNotificationTemplate: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PreviewDto'];
        };
      };
    };
  };
  listAdminOrders: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OrderPageDto'];
        };
      };
    };
  };
  getAdminOrder: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OrderDetailDto'];
        };
      };
    };
  };
  listAdminOrderNotes: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['NotePageDto'];
        };
      };
    };
  };
  addAdminOrderNote: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['NoteDto'];
        };
      };
    };
  };
  requestIdempotentAdminRefund: {
    parameters: {
      query?: never;
      header: {
        'Idempotency-Key': string;
      };
      path: {
        paymentId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RefundResponseDto'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  requestPaymentRefund: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        paymentId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RefundResponseDto'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  listAdminOrderPayments: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminPaymentPageDto'];
        };
      };
    };
  };
  adminListCoupons: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CouponResponseDto'][];
        };
      };
    };
  };
  adminCreateCoupon: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CouponResponseDto'];
        };
      };
    };
  };
  setAdminCouponStatus: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CouponStatusResponseDto'];
        };
      };
    };
  };
  pageAdminCoupons: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CouponPageDto'];
        };
      };
    };
  };
  adminListTaxRates: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TaxRateResponseDto'][];
        };
      };
    };
  };
  adminCreateTaxRate: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TaxRateResponseDto'];
        };
      };
    };
  };
  updateAdminTaxRate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TaxRateResponseDto'];
        };
      };
    };
  };
  pageAdminTaxRates: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TaxPageDto'];
        };
      };
    };
  };
  adminListVariantPrices: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VariantPriceResponseDto'][];
        };
      };
    };
  };
  adminCreateVariantPrice: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VariantPriceResponseDto'];
        };
      };
    };
  };
  pageAdminVariantPrices: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PricePageDto'];
        };
      };
    };
  };
  adminListPurchaseOrders: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminCreatePurchaseOrder: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminGetPurchaseOrder: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminGetLandedCost: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminReplacePurchaseOrderLines: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminCreateGoodsReceipt: {
    parameters: {
      query?: never;
      header: {
        'Idempotency-Key': string;
      };
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminTransitionPurchaseOrder: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminListSuppliers: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminCreateSupplier: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  adminGetSupplier: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminUpdateSupplier: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  listPendingReviews: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ModerationPageDto'];
        };
      };
    };
  };
  approveReview: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ModeratedDto'];
        };
      };
    };
  };
  rejectReview: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ModeratedDto'];
        };
      };
    };
  };
  listShippingConfiguration: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Zones, methods, translations, and rates. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  upsertShippingMethod: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Saved method ID. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  upsertShippingRate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Saved rate ID. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  upsertShippingZone: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Saved zone ID. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  adminCreateBatchAllocation: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminListApiaries: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  adminCreateApiary: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  adminGetApiary: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminUpdateApiary: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminUpsertApiaryTranslation: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  listAdminApiaries: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ApiaryPageDto'];
        };
      };
    };
  };
  adminListHarvestBatches: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminCreateHarvestBatch: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminGetHarvestBatch: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  adminListBatchAllocations: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  listAdminBatchAllocations: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AllocationPageDto'];
        };
      };
    };
  };
  adminProductionIntake: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  confirmEmailVerification: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  requestEmailVerification: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AcceptedResponseDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  login: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LoginResponseDto'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  logout: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  logoutAll: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  confirmPasswordReset: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  requestPasswordReset: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AcceptedResponseDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  registerCustomer: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Registration was accepted. */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AcceptedResponseDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  confirmStaffTotp: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthenticatedResponseDto'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  getCart: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CartResponseDto'];
        };
      };
    };
  };
  applyCartCoupon: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CartResponseDto'];
        };
      };
    };
  };
  removeCartCoupon: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CartResponseDto'];
        };
      };
    };
  };
  addCartLine: {
    parameters: {
      query?: never;
      header: {
        'Idempotency-Key': string;
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CartResponseDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  removeCartLine: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        lineId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CartResponseDto'];
        };
      };
    };
  };
  updateCartLine: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        lineId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CartResponseDto'];
        };
      };
    };
  };
  listCatalogCategories: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CategoryListResponseDto'];
        };
      };
    };
  };
  getCatalogCategoryBySlug: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CategoryResponseDto'];
        };
      };
    };
  };
  listCatalogCategoryProducts: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProductListResponseDto'];
        };
      };
    };
  };
  listCatalogCollections: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CollectionListResponseDto'];
        };
      };
    };
  };
  getCatalogCollectionBySlug: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CollectionResponseDto'];
        };
      };
    };
  };
  listCatalogCollectionProducts: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProductListResponseDto'];
        };
      };
    };
  };
  listCatalogProducts: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProductListResponseDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  getCatalogProductBySlug: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProductResponseDto'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  searchCatalogProducts: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProductListResponseDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  startCheckout: {
    parameters: {
      query?: never;
      header: {
        'Idempotency-Key': string;
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CheckoutResponseDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  getCheckout: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CheckoutResponseDto'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  confirmCheckout: {
    parameters: {
      query?: never;
      header: {
        'Idempotency-Key': string;
      };
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ConfirmCheckoutResponseDto'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  extendCheckoutReservation: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CheckoutResponseDto'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  selectCheckoutShippingQuote: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CheckoutResponseDto'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  listPublishedContent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        kind: 'page' | 'article' | 'faq';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PublicContentPageDto'];
        };
      };
    };
  };
  getPublishedContent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
        kind: 'page' | 'article' | 'faq';
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PublicContentDto'];
        };
      };
    };
  };
  getMe: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SafeUserDto'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  submitProductReview: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SubmittedDto'];
        };
      };
    };
  };
  getReviewEligibility: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EligibilityDto'];
        };
      };
    };
  };
  listMySessions: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SessionsResponseDto'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  revokeMySession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  requestStepUp: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['StepUpResponseDto'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  confirmNewsletterSubscription: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AcceptedDto'];
        };
      };
    };
  };
  requestNewsletterSubscription: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AcceptedDto'];
        };
      };
    };
  };
  unsubscribeNewsletter: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AcceptedDto'];
        };
      };
    };
  };
  listMyOrders: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CustomerOrderResponseDto'][];
        };
      };
    };
  };
  getMyOrder: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        number: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CustomerOrderResponseDto'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  startPayment: {
    parameters: {
      query?: never;
      header: {
        'Idempotency-Key': string;
      };
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaymentResponseDto'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  getPayment: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaymentResponseDto'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  verifyPaymentReturn: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PaymentResponseDto'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  listApprovedProductReviews: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        productId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ReviewPageDto'];
        };
      };
    };
  };
  receivePaymentWebhook: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        provider: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Accepted; processing is idempotent and re-runnable. */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
}
