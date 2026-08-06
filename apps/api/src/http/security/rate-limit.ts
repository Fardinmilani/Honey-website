import { RateLimitedAppError } from '@honey/backend';

export type RateLimitResult = Readonly<{
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSeconds: number;
}>;

export interface RateLimitStore {
  consume(key: string, nowMs: number): Promise<RateLimitResult>;
}

type Window = { count: number; resetAtMs: number };

export class InMemoryRateLimitStore implements RateLimitStore {
  readonly #windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  async consume(key: string, nowMs: number): Promise<RateLimitResult> {
    const previous = this.#windows.get(key);
    const window =
      previous === undefined || previous.resetAtMs <= nowMs
        ? { count: 0, resetAtMs: nowMs + this.windowMs }
        : previous;
    window.count += 1;
    this.#windows.set(key, window);
    const retryAfterSeconds = Math.max(1, Math.ceil((window.resetAtMs - nowMs) / 1_000));
    return {
      allowed: window.count <= this.limit,
      limit: this.limit,
      remaining: Math.max(0, this.limit - window.count),
      resetAtMs: window.resetAtMs,
      retryAfterSeconds,
    };
  }
}

export function rateLimitError(result: RateLimitResult): RateLimitedAppError {
  return new RateLimitedAppError({ retryAfterSeconds: result.retryAfterSeconds });
}
