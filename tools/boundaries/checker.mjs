import { readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

const WORKSPACES = [
  ['apps/web', 'web'],
  ['apps/api', 'api'],
  ['apps/worker', 'worker'],
  ['packages/backend', 'backend'],
  ['packages/core', 'core'],
  ['packages/db', 'db'],
  ['packages/contracts', 'contracts'],
  ['packages/i18n', 'i18n'],
  ['packages/ui', 'ui'],
  ['packages/utils', 'utils'],
  ['packages/config-ts', 'config-ts'],
  ['packages/config-eslint', 'config-eslint'],
];

const ALLOWED = new Map([
  ['web', new Set(['ui', 'i18n', 'contracts', 'core', 'utils'])],
  ['api', new Set(['backend', 'contracts', 'core', 'utils'])],
  ['worker', new Set(['backend', 'core', 'utils'])],
  ['backend', new Set(['db', 'core', 'utils'])],
  ['core', new Set()],
  ['db', new Set()],
  ['contracts', new Set(['core', 'utils'])],
  ['i18n', new Set(['core', 'utils'])],
  ['ui', new Set(['core', 'utils'])],
  ['utils', new Set()],
  ['config-ts', new Set()],
  ['config-eslint', new Set()],
]);

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
const importPatterns = [
  /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/gu,
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
];

function slash(value) {
  return value.split(sep).join('/');
}

function extension(path) {
  const match = /\.[^./]+$/u.exec(path);
  return match?.[0] ?? '';
}

function workspaceForAbsolute(root, absolutePath) {
  const rel = slash(relative(root, absolutePath));
  const match = WORKSPACES.find(([prefix]) => rel === prefix || rel.startsWith(`${prefix}/`));
  return match ? { root: match[0], id: match[1], relative: rel } : undefined;
}

function workspaceForAlias(specifier) {
  if (!specifier.startsWith('@honey/')) return undefined;
  const first = specifier.slice('@honey/'.length).split('/')[0];
  const known = WORKSPACES.find(([, id]) => id === first);
  return known
    ? { root: known[0], id: known[1], deep: specifier !== `@honey/${first}` }
    : undefined;
}

function importedSpecifiers(source) {
  const results = new Set();
  for (const pattern of importPatterns) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      if (match[1]) results.add(match[1]);
    }
  }
  return [...results];
}

async function sourceFiles(directory) {
  const output = [];
  async function visit(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.turbo')
        continue;
      const full = resolve(current, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(extension(entry.name))) output.push(full);
    }
  }
  await visit(directory);
  return output;
}

function moduleName(root, file) {
  const rel = slash(relative(resolve(root, 'packages/backend/src/modules'), file));
  if (rel.startsWith('../') || rel === '..') return undefined;
  return rel.split('/')[0] || undefined;
}

function isPublicModuleEntry(root, targetPath) {
  const modulesRoot = resolve(root, 'packages/backend/src/modules');
  const rel = slash(relative(modulesRoot, targetPath));
  if (rel.startsWith('../') || rel === '..') return false;
  return /^[^/]+\/index(?:\.[cm]?[jt]sx?)?$/u.test(rel);
}

function findCycles(graph) {
  const cycles = [];
  const visited = new Set();
  const active = [];
  const activeSet = new Set();

  function walk(node) {
    if (activeSet.has(node)) {
      const index = active.indexOf(node);
      cycles.push([...active.slice(index), node]);
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    active.push(node);
    activeSet.add(node);
    for (const target of graph.get(node) ?? []) walk(target);
    active.pop();
    activeSet.delete(node);
  }

  for (const node of graph.keys()) walk(node);
  return cycles;
}

export async function analyzeWorkspace(rootDirectory) {
  const root = resolve(rootDirectory);
  const violations = [];
  const graph = new Map(WORKSPACES.map(([, id]) => [id, new Set()]));

  for (const [workspacePath, sourceId] of WORKSPACES) {
    const files = await sourceFiles(resolve(root, workspacePath, 'src'));
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      for (const specifier of importedSpecifiers(source)) {
        let target;
        let targetAbsolute;
        if (specifier.startsWith('.')) {
          targetAbsolute = resolve(dirname(file), specifier);
          target = workspaceForAbsolute(root, targetAbsolute);
        } else {
          target = workspaceForAlias(specifier);
        }
        if (!target || target.id === sourceId) {
          if (sourceId === 'backend' && target?.id === 'backend' && targetAbsolute) {
            const fromModule = moduleName(root, file);
            const toModule = moduleName(root, targetAbsolute);
            if (
              fromModule &&
              toModule &&
              fromModule !== toModule &&
              !isPublicModuleEntry(root, targetAbsolute)
            ) {
              violations.push({
                code: 'backend-deep-import',
                file: slash(relative(root, file)),
                specifier,
                message: `backend module ${fromModule} reaches into ${toModule}; import its public index instead`,
              });
            }
          }
          continue;
        }

        graph.get(sourceId)?.add(target.id);
        const allowed = ALLOWED.get(sourceId) ?? new Set();
        if (!allowed.has(target.id)) {
          violations.push({
            code: 'forbidden-edge',
            file: slash(relative(root, file)),
            specifier,
            message: `${sourceId} -> ${target.id} is not allowed`,
          });
          continue;
        }
        if (target.id === 'backend' && target.deep) {
          violations.push({
            code: 'backend-deep-import',
            file: slash(relative(root, file)),
            specifier,
            message: 'composition roots must import the public @honey/backend entry point only',
          });
        }
      }
    }
  }

  for (const cycle of findCycles(graph)) {
    violations.push({
      code: 'workspace-cycle',
      file: '(workspace graph)',
      specifier: cycle.join(' -> '),
      message: 'workspace dependency cycle detected',
    });
  }

  return { graph, violations };
}

export function formatViolations(violations) {
  if (violations.length === 0)
    return 'Boundary check passed: no forbidden edges or workspace cycles found.';
  return [
    `Boundary check failed with ${violations.length} violation(s):`,
    ...violations.map(
      (violation) =>
        `- [${violation.code}] ${violation.file}: ${violation.specifier} — ${violation.message}`,
    ),
  ].join('\n');
}
