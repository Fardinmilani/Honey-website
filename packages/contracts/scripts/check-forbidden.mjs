import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const document = JSON.parse(await readFile(resolve(directory, '../openapi.json'), 'utf8'));
const raw = JSON.stringify(document);

const globalForbidden = [
  /moisture/iu,
  /\blab(?:oratory)?\b/iu,
  /\bhmf\b/iu,
  /diastase/iu,
  /purity/iu,
  /medical/iu,
  /therapeutic/iu,
  /seller.?id/iu,
  /vendor.?id/iu,
  /merchant.?id/iu,
];
const globalMatches = globalForbidden
  .filter((pattern) => pattern.test(raw))
  .map((pattern) => pattern.source);
if (globalMatches.length > 0) {
  process.stderr.write(`Forbidden OpenAPI vocabulary found: ${globalMatches.join(', ')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('OpenAPI global forbidden-vocabulary check passed.\n');
}

function componentFromRef(ref) {
  const prefix = '#/components/schemas/';
  if (!ref.startsWith(prefix)) return undefined;
  return document.components?.schemas?.[ref.slice(prefix.length)];
}

const publicForbidden =
  /^(?:supplier(?:id|name|code)?|legalname|contactname|sourcingtype|apiaryid|harvestbatchid|landedcost|unitcost|qualityrating|internalnotes|price|currency|total|discount|stock|inventory(?:count)?|onhand|reserved|allocated|incoming|reorderpoint|safetystock|stocklocation|cost|storagekey|bucket|signedprivateurl)$/iu;

function visit(schema, seen, path, errors) {
  if (schema === null || typeof schema !== 'object') return;
  if ('$ref' in schema && typeof schema.$ref === 'string') {
    if (seen.has(schema.$ref)) return;
    seen.add(schema.$ref);
    const resolved = componentFromRef(schema.$ref);
    if (resolved !== undefined) visit(resolved, seen, `${path} -> ${schema.$ref}`, errors);
    return;
  }
  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    if (publicForbidden.test(name.replaceAll(/[-_]/gu, ''))) {
      errors.push(`Forbidden public property ${name} at ${path}`);
    }
    visit(property, seen, `${path}.${name}`, errors);
  }
  if (schema.items !== undefined) visit(schema.items, seen, `${path}[]`, errors);
  for (const branch of [
    ...(schema.allOf ?? []),
    ...(schema.anyOf ?? []),
    ...(schema.oneOf ?? []),
  ]) {
    visit(branch, seen, `${path}.branch`, errors);
  }
}

const errors = [];
for (const [path, operations] of Object.entries(document.paths ?? {})) {
  if (path.startsWith('/v1/admin/')) continue;
  for (const [method, operation] of Object.entries(operations)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
    for (const [status, response] of Object.entries(operation.responses ?? {})) {
      if (!status.startsWith('2') || response.content === undefined) continue;
      for (const mediaType of Object.values(response.content)) {
        visit(mediaType.schema, new Set(), `${method.toUpperCase()} ${path} ${status}`, errors);
      }
    }
  }
}
if (errors.length > 0) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('OpenAPI public-reachability forbidden-field check passed.\n');
}
