import { defineConfig } from 'vitest/config';

// Bound simultaneous real database migrations and crypto-heavy test processes.
// Domain concurrency proofs still issue their competing operations concurrently.
export default defineConfig({ test: { maxWorkers: 2 } });
