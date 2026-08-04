import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const roots = [
  '.turbo',
  'apps/web/dist',
  'apps/api/dist',
  'apps/worker/dist',
  'packages/backend/dist',
  'packages/core/dist',
  'packages/db/dist',
  'packages/contracts/dist',
  'packages/i18n/dist',
  'packages/ui/dist',
  'packages/utils/dist',
];

await Promise.all(roots.map((path) => rm(resolve(path), { recursive: true, force: true })));
console.log('Removed workspace build outputs.');
