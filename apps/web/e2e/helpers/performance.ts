import { expect, type Page } from '@playwright/test';

/**
 * Production mobile LCP target (see Phase 10 acceptance).
 * CI uses a relaxed budget for cold standalone + API startup.
 */
export const LCP_BUDGET_MS = process.env['CI'] === 'true' ? 4000 : 2500;
export const CLS_BUDGET = 0.05;

export type WebVitalsSample = {
  readonly lcp: number;
  readonly cls: number;
  readonly jsTransferBytes: number;
  readonly lcpElementTag: string | null;
};

export async function measureWebVitals(page: Page): Promise<WebVitalsSample> {
  return page.evaluate(async () => {
    const readLcp = (): { time: number; tag: string | null } => {
      const entries = performance.getEntriesByType('largest-contentful-paint');
      if (entries.length === 0) {
        return { time: 0, tag: null };
      }
      const last = entries[entries.length - 1] as PerformanceEntry & {
        element?: Element | null;
      };
      const tag =
        last.element !== undefined && last.element !== null
          ? last.element.tagName.toLowerCase()
          : null;
      return { time: last.startTime, tag };
    };

    let cls = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          hadRecentInput?: boolean;
          value?: number;
        };
        if (shift.hadRecentInput !== true && typeof shift.value === 'number') {
          cls += shift.value;
        }
      }
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });

    let lcp = readLcp();
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.length > 0) {
        const last = entries[entries.length - 1] as PerformanceEntry & {
          element?: Element | null;
        };
        const tag =
          last.element !== undefined && last.element !== null
            ? last.element.tagName.toLowerCase()
            : null;
        lcp = { time: last.startTime, tag };
      }
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    lcp = readLcp();

    const jsTransferBytes = performance
      .getEntriesByType('resource')
      .filter((entry) => {
        const resource = entry as PerformanceResourceTiming;
        return (
          resource.initiatorType === 'script' ||
          /\.mjs(?:\?|$)/iu.test(resource.name) ||
          /\.js(?:\?|$)/iu.test(resource.name)
        );
      })
      .reduce((total, entry) => total + (entry as PerformanceResourceTiming).transferSize, 0);

    clsObserver.disconnect();
    lcpObserver.disconnect();

    return {
      lcp: lcp.time,
      cls,
      jsTransferBytes,
      lcpElementTag: lcp.tag,
    };
  });
}

export function assertWebVitalsBudget(sample: WebVitalsSample): void {
  expect(
    sample.lcp,
    `LCP ${sample.lcp.toFixed(0)}ms exceeds budget ${LCP_BUDGET_MS}ms (production target 2500ms)`,
  ).toBeLessThanOrEqual(LCP_BUDGET_MS);
  expect(sample.cls, `CLS ${sample.cls} exceeds budget ${CLS_BUDGET}`).toBeLessThanOrEqual(
    CLS_BUDGET,
  );
}
