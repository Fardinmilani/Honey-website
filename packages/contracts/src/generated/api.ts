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
  '/v1/admin/catalog/categories': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
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
    get?: never;
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
    get?: never;
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
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    AcceptedResponseDto: {
      /** @example true */
      accepted: boolean;
    };
    AdminProductDto: {
      /** Format: uuid */
      apiaryId: string | null;
      brandLine: string | null;
      categories: Record<string, never>[];
      collections: Record<string, never>[];
      /** Format: uuid */
      defaultVariantId: string | null;
      floralSources: string[];
      harvestSeason: string | null;
      honeyVarietal: string | null;
      /** Format: uuid */
      id: string;
      media: Record<string, never>[];
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
      translations: Record<string, never>[];
      variants: Record<string, never>[];
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
    CategoryListResponseDto: {
      data: components['schemas']['PublicCategoryDto'][];
      meta: components['schemas']['MetaDto'];
    };
    CategoryResponseDto: {
      data: components['schemas']['PublicCategoryDto'];
      meta: components['schemas']['MetaDto'];
    };
    CollectionListResponseDto: {
      data: components['schemas']['PublicCollectionDto'][];
      meta: components['schemas']['MetaDto'];
    };
    CollectionResponseDto: {
      data: components['schemas']['PublicCollectionDto'];
      meta: components['schemas']['MetaDto'];
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
    PageDto: {
      hasMore: boolean;
      limit: number;
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
      dimensionsMm: number[];
      /** Format: uuid */
      id: string;
      isDefault: boolean;
      jarSizeLabelKey: string;
      name: string;
      netWeightGrams: number;
      packagingTypeKey: string;
      position: number;
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
        | 'inventory:read'
        | 'inventory:adjust'
        | 'procurement:read'
        | 'procurement:write'
        | 'order:read'
        | 'order:write'
        | 'order:refund'
        | 'order:cancel'
        | 'customer:read'
        | 'customer:export'
        | 'content:read'
        | 'content:write'
        | 'content:publish'
        | 'review:moderate'
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
    ValidationIssueDto: {
      /** @example INVALID_VALUE */
      code: string;
      /** @example field */
      path: string;
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
}
