import { describe, expect, it, vi } from 'vitest';
import pino from 'pino';

import { GracefulShutdown } from '../src/bootstrap/graceful-shutdown.js';

describe('graceful shutdown', () => {
  it('starts once for duplicate signals and completes once Nest closes', () => {
    const forceExit = vi.fn();
    const shutdown = new GracefulShutdown(100, pino({ level: 'silent' }), forceExit);
    shutdown.start('SIGTERM');
    shutdown.start('SIGINT');
    shutdown.onApplicationShutdown('SIGTERM');
    expect(forceExit).not.toHaveBeenCalled();
  });

  it('forces exit only after the configured deadline', () => {
    vi.useFakeTimers();
    try {
      const forceExit = vi.fn();
      const shutdown = new GracefulShutdown(100, pino({ level: 'silent' }), forceExit);
      shutdown.start('SIGTERM');
      vi.advanceTimersByTime(99);
      expect(forceExit).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(forceExit).toHaveBeenCalledExactlyOnceWith(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
