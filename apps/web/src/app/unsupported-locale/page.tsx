import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Unsupported locale',
};

/**
 * Rewrite target for unsupported locale prefixes. Intentionally not the homepage.
 */
export default function UnsupportedLocalePage() {
  return (
    <main>
      <h1>Unsupported locale</h1>
      <p>This language path is not available.</p>
    </main>
  );
}
