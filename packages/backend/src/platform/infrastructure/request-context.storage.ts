import { AsyncLocalStorage } from 'node:async_hooks';

import type { RequestContext, RequestContextPort } from '../domain/request-context.js';

export class RequestContextStorage implements RequestContextPort {
  readonly #storage = new AsyncLocalStorage<RequestContext>();

  get(): RequestContext | undefined {
    return this.#storage.getStore();
  }

  run<Result>(context: RequestContext, work: () => Result): Result {
    return this.#storage.run(context, work);
  }
}
