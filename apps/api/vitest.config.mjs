import { defineConfig } from 'vitest/config';

// Keep full Nest startup suites within the runner's CPU/memory budget.
// All tests and their existing timeouts remain active.
export default defineConfig({ test: { maxWorkers: 2 } });
