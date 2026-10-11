import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    else if (entry.name.endsWith('.ts')) result.push(path);
  }
  return result;
}
function decorators(node) {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}
function calls(node) {
  return decorators(node)
    .map((item) => item.expression)
    .filter(ts.isCallExpression);
}
function named(call, name) {
  return ts.isIdentifier(call.expression) && call.expression.text === name;
}

/** Phase 17 supersedes earlier absence guards with a stricter API boundary proof. */
export async function verifyAdminBoundary(root) {
  const modules = await files(resolve(root, 'apps/api/src/modules'));
  let controllers = 0;
  let operations = 0;
  for (const path of modules) {
    const source = ts.createSourceFile(
      path,
      await readFile(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const node of source.statements.filter(ts.isClassDeclaration)) {
      const classCalls = calls(node);
      const controller = classCalls.find((call) => named(call, 'Controller'));
      const prefix = controller?.arguments[0];
      if (
        prefix === undefined ||
        !ts.isStringLiteral(prefix) ||
        !prefix.text.startsWith('v1/admin/')
      )
        continue;
      controllers += 1;
      assert.ok(
        classCalls.some((call) => named(call, 'RequireStaffSession')),
        `${node.name?.text} must require STAFF.`,
      );
      assert.ok(
        !classCalls.some((call) => named(call, 'Public')),
        `${node.name?.text} cannot be public.`,
      );
      for (const member of node.members.filter(ts.isMethodDeclaration)) {
        const methodCalls = calls(member);
        if (
          !methodCalls.some((call) =>
            ['Get', 'Post', 'Put', 'Patch', 'Delete'].some((name) => named(call, name)),
          )
        )
          continue;
        operations += 1;
        const permission = methodCalls.find((call) => named(call, 'RequirePermissions'));
        assert.ok(
          permission !== undefined &&
            permission.arguments.length > 0 &&
            permission.arguments.every(ts.isStringLiteral),
          `Missing explicit permission in ${path}: ${member.name.getText(source)}.`,
        );
        assert.ok(
          !methodCalls.some((call) => named(call, 'Public')),
          'An admin operation cannot be public.',
        );
      }
    }
  }
  assert.ok(controllers >= 10 && operations >= 90, 'Admin API coverage unexpectedly disappeared.');
  const guard = await readFile(
    resolve(root, 'apps/api/src/http/auth/authorization.guard.ts'),
    'utf8',
  );
  assert.match(guard, /authenticateSession/u);
  assert.match(guard, /principal\.kind !== 'STAFF'/u);
  assert.match(guard, /this\.identity\.authorize\(principal, permissions\)/u);
  const layout = await readFile(
    resolve(root, 'apps/web/src/app/[locale]/(admin)/admin/(staff)/layout.tsx'),
    'utf8',
  );
  assert.match(layout, /adminUser/u);
  assert.match(layout, /force-dynamic/u);
  return { controllers, operations };
}
