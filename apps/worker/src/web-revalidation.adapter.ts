import type {
  CatalogRevalidationInput,
  SitemapRevalidationInput,
  SitemapRevalidationPort,
} from '@honey/backend';

/** One fixed server-to-server destination; payloads cannot supply a URL or secret. */
export class FixedWebRevalidationAdapter implements SitemapRevalidationPort {
  readonly #endpoint: string;

  constructor(
    webOrigin: string,
    private readonly secret: string,
    private readonly request: typeof fetch = fetch,
  ) {
    const origin = new URL(webOrigin);
    if (origin.origin !== webOrigin || origin.username !== '' || origin.password !== '') {
      throw new TypeError('Invalid fixed web revalidation origin.');
    }
    this.#endpoint = `${origin.origin}/api/bff/revalidate`;
  }

  revalidateSitemap(input: SitemapRevalidationInput): Promise<void> {
    return this.#send({ scope: 'sitemap', locale: input.locale });
  }

  revalidateCatalog(input: CatalogRevalidationInput): Promise<void> {
    return this.#send({
      scope: input.scope,
      ...(input.id === undefined ? {} : { id: input.id }),
    });
  }

  async #send(body: Readonly<Record<string, string>>): Promise<void> {
    const response = await this.request(this.#endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.secret}`,
      },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error('WEB_REVALIDATION_AUTH_REJECTED');
    }
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      throw new Error('WEB_REVALIDATION_REJECTED');
    }
    if (!response.ok) throw new Error('WEB_REVALIDATION_UNAVAILABLE');
  }
}
