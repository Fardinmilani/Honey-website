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

test('rejects Prisma outside packages/db', async () => {
  const root = await fixture({
    'packages/backend/src/probe.ts': "import { PrismaClient } from '@prisma/client';",
  });
  try {
    const result = await analyzeWorkspace(root);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0]?.code, 'forbidden-prisma-import');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects framework and persistence imports in backend domain code', async () => {
  const root = await fixture({
    'packages/backend/src/platform/domain/probe.ts': "import { Injectable } from '@nestjs/common';",
  });
  try {
    const result = await analyzeWorkspace(root);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0]?.code, 'forbidden-backend-domain-import');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects PostgreSQL drivers in apps/api', async () => {
  const root = await fixture({ 'apps/api/src/probe.ts': "import pg from 'pg';" });
  try {
    const result = await analyzeWorkspace(root);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0]?.code, 'forbidden-db-driver-import');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const dependency of ['argon2', 'otplib', '@otplib/totp']) {
  test(`rejects ${dependency} in apps/api`, async () => {
    const root = await fixture({
      'apps/api/src/probe.ts': `import '${dependency}';`,
    });
    try {
      const result = await analyzeWorkspace(root);
      assert.equal(result.violations.length, 1);
      assert.equal(result.violations[0]?.code, 'forbidden-api-identity-crypto-import');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

for (const dependency of [
  '@aws-sdk/client-s3',
  '@smithy/node-http-handler',
  'sharp',
  'file-type',
]) {
  test(`rejects ${dependency} in apps/api media transport`, async () => {
    const root = await fixture({
      'apps/api/src/probe.ts': `import '${dependency}';`,
    });
    try {
      const result = await analyzeWorkspace(root);
      assert.equal(result.violations.length, 1);
      assert.equal(result.violations[0]?.code, 'forbidden-api-media-provider-import');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

for (const dependency of ['@aws-sdk/client-s3', 'sharp', 'redis']) {
  test(`rejects ${dependency} in media domain`, async () => {
    const root = await fixture({
      'packages/backend/src/modules/media/domain/probe.ts': `import '${dependency}';`,
    });
    try {
      const result = await analyzeWorkspace(root);
      assert.equal(result.violations.length, 1);
      assert.equal(result.violations[0]?.code, 'forbidden-backend-domain-import');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test('rejects persistence imports in packages/contracts', async () => {
  const root = await fixture({ 'packages/contracts/src/probe.ts': "import '@honey/db';" });
  try {
    const result = await analyzeWorkspace(root);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0]?.code, 'forbidden-edge');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

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
