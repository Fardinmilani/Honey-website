import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { analyzeWorkspace } from './checker.mjs';

async function fixture(files) {
  const root = await mkdtemp(join(tmpdir(), 'honey-boundaries-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  return root;
}

const requiredFailures = [
  ['worker importing api', 'apps/worker/src/probe.ts', "import '@honey/api';"],
  ['web importing db', 'apps/web/src/probe.ts', "import '@honey/db';"],
  ['api importing db', 'apps/api/src/probe.ts', "import '@honey/db';"],
  ['ui importing backend', 'packages/ui/src/probe.ts', "import '@honey/backend';"],
];

for (const [name, path, source] of requiredFailures) {
  test(`rejects ${name}`, async () => {
    const root = await fixture({ [path]: source });
    try {
      const result = await analyzeWorkspace(root);
      assert.equal(result.violations.length, 1);
      assert.equal(result.violations[0]?.code, 'forbidden-edge');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test('accepts the documented dependency direction', async () => {
  const root = await fixture({
    'apps/web/src/index.ts': "import '@honey/ui'; import '@honey/contracts';",
    'apps/api/src/index.ts': "import '@honey/backend'; import '@honey/contracts';",
    'apps/worker/src/index.ts': "import '@honey/backend';",
    'packages/backend/src/index.ts': "import '@honey/db'; import '@honey/core';",
  });
  try {
    const result = await analyzeWorkspace(root);
    assert.deepEqual(result.violations, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects a workspace cycle', async () => {
  const root = await fixture({
    'packages/contracts/src/index.ts': "import '@honey/core';",
    'packages/core/src/index.ts': "import '@honey/contracts';",
  });
  try {
    const result = await analyzeWorkspace(root);
    assert.ok(result.violations.some((violation) => violation.code === 'forbidden-edge'));
    assert.ok(result.violations.some((violation) => violation.code === 'workspace-cycle'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
