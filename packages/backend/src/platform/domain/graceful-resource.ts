export interface GracefulResource {
  close(): Promise<void>;
}

export class GracefulResourceRegistry implements GracefulResource {
  readonly #resources = new Set<GracefulResource>();
  #closing: Promise<void> | undefined;

  add(resource: GracefulResource): void {
    if (this.#closing !== undefined) throw new Error('Cannot register a resource during shutdown.');
    this.#resources.add(resource);
  }

  close(): Promise<void> {
    this.#closing ??= Promise.allSettled(
      [...this.#resources].map((resource) => resource.close()),
    ).then((results) => {
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    });
    return this.#closing;
  }
}
