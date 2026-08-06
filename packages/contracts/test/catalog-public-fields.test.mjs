import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const document = JSON.parse(await readFile(resolve(directory, '../openapi.json'), 'utf8'));

const forbiddenProperty =
  /^(?:supplier(?:id|name|code)?|sourcingtype|apiaryid|harvestbatchid|landedcost|internalnotes|price|currency|total|discount|stock|inventory(?:count)?|cost|storagekey|bucket|signedprivateurl|moisture|hmf|diastase|purity|medical|therapeutic)$/iu;

function componentFromRef(ref) {
  const prefix = '#/components/schemas/';
  assert.ok(ref.startsWith(prefix), `Unexpected non-component schema reference ${ref}`);
  return document.components.schemas[ref.slice(prefix.length)];
}

function visit(schema, seen, path) {
  if (schema === null || typeof schema !== 'object') return;
  if ('$ref' in schema) {
    if (seen.has(schema.$ref)) return;
    seen.add(schema.$ref);
    visit(componentFromRef(schema.$ref), seen, `${path} -> ${schema.$ref}`);
    return;
  }
  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    assert.equal(
      forbiddenProperty.test(name.replaceAll(/[-_]/gu, '')),
      false,
      `Forbidden public catalog property ${name} at ${path}`,
    );
    visit(property, seen, `${path}.${name}`);
  }
  if (schema.items !== undefined) visit(schema.items, seen, `${path}[]`);
  for (const branch of [
    ...(schema.allOf ?? []),
    ...(schema.anyOf ?? []),
    ...(schema.oneOf ?? []),
  ]) {
    visit(branch, seen, `${path}.branch`);
  }
}

test('public catalog response schemas contain no private, sourcing, pricing, or stock fields', () => {
  const catalogPaths = Object.entries(document.paths).filter(([path]) =>
    path.startsWith('/v1/catalog/'),
  );
  assert.ok(catalogPaths.length >= 8, 'Expected the complete public catalog route set');
  for (const [path, operations] of catalogPaths) {
    for (const [method, operation] of Object.entries(operations)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      for (const [status, response] of Object.entries(operation.responses ?? {})) {
        if (!status.startsWith('2') || response.content === undefined) continue;
        for (const mediaType of Object.values(response.content)) {
          visit(mediaType.schema, new Set(), `${method.toUpperCase()} ${path} ${status}`);
        }
      }
    }
  }
});
