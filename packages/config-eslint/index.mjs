import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const workspaceGroups = {
  apps: ['@honey/web', '@honey/api', '@honey/worker'],
  backend: ['@honey/backend', '@honey/backend/*'],
  db: ['@honey/db', '@honey/db/*'],
  prisma: ['@prisma/client', '@prisma/client/*', '@prisma/*', 'prisma', 'prisma/*'],
  dbDrivers: ['pg', 'pg/*', 'postgres', 'postgres/*'],
  identityCrypto: ['argon2', 'argon2/*', 'otplib', 'otplib/*', '@otplib/*'],
  storageProcessing: ['@aws-sdk/*', '@smithy/*', 'sharp', 'sharp/*', 'file-type', 'file-type/*'],
  frontend: ['@honey/ui', '@honey/ui/*', '@honey/i18n', '@honey/i18n/*'],
  contracts: ['@honey/contracts', '@honey/contracts/*'],
  core: ['@honey/core', '@honey/core/*'],
  utils: ['@honey/utils', '@honey/utils/*'],
  configs: [
    '@honey/config-ts',
    '@honey/config-ts/*',
    '@honey/config-eslint',
    '@honey/config-eslint/*',
  ],
};

function restriction(groups, message) {
  return [
    'error',
    {
      patterns: [
        {
          group: groups.flatMap((group) => workspaceGroups[group]),
          message,
        },
      ],
    },
  ];
}

const ignores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.turbo/**',
  '**/coverage/**',
  'packages/db/src/generated/prisma/**',
  'apps/web/public/media/**',
  'pnpm-lock.yaml',
];

export function createHoneyEslintConfig() {
  return tseslint.config(
    { ignores },
    {
      ...js.configs.recommended,
      files: ['**/*.{js,mjs,cjs}'],
      languageOptions: {
        ...js.configs.recommended.languageOptions,
        globals: {
          Buffer: 'readonly',
          URL: 'readonly',
          URLSearchParams: 'readonly',
          clearTimeout: 'readonly',
          console: 'readonly',
          process: 'readonly',
          setTimeout: 'readonly',
        },
      },
    },
    ...tseslint.configs.recommended,
    {
      files: ['**/*.{ts,tsx,mts,cts}'],
      linterOptions: {
        reportUnusedDisableDirectives: 'error',
      },
      rules: {
        '@typescript-eslint/ban-ts-comment': [
          'error',
          {
            'ts-check': false,
            'ts-expect-error': 'allow-with-description',
            'ts-ignore': true,
            'ts-nocheck': true,
            minimumDescriptionLength: 10,
          },
        ],
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { fixStyle: 'inline-type-imports', prefer: 'type-imports' },
        ],
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
      },
    },
    {
      files: ['apps/web/src/**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
      rules: {
        'no-restricted-imports': restriction(
          ['backend', 'db', 'prisma', 'apps', 'configs'],
          'apps/web may import only @honey/ui, @honey/i18n, @honey/contracts, @honey/core, and @honey/utils.',
        ),
      },
    },
    {
      files: ['apps/api/src/**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
      rules: {
        'no-restricted-imports': restriction(
          [
            'db',
            'prisma',
            'dbDrivers',
            'identityCrypto',
            'storageProcessing',
            'frontend',
            'apps',
            'configs',
          ],
          'apps/api is an HTTP composition root and may reach business logic only through the public @honey/backend entry point.',
        ),
      },
    },
    {
      files: ['apps/worker/src/**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
      rules: {
        'no-restricted-imports': restriction(
          ['db', 'prisma', 'frontend', 'contracts', 'apps', 'configs'],
          'apps/worker may import only @honey/backend, @honey/core, and @honey/utils.',
        ),
      },
    },
    {
      files: ['packages/backend/src/**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
      rules: {
        'no-restricted-imports': restriction(
          ['prisma', 'dbDrivers', 'frontend', 'contracts', 'apps', 'configs'],
          'packages/backend may import only @honey/db, @honey/core, and @honey/utils. Cross-module access must use public module entry points.',
        ),
      },
    },
    {
      files: ['packages/backend/src/**/domain/**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '@nestjs/*',
                  'fastify',
                  'fastify/*',
                  '@honey/db',
                  '@honey/db/*',
                  '@prisma/*',
                  'prisma',
                  'prisma/*',
                  '@aws-sdk/*',
                  '@smithy/*',
                  'sharp',
                  'sharp/*',
                  'file-type',
                  'file-type/*',
                  'redis',
                  'redis/*',
                ],
                message: 'Backend domain code must remain transport- and persistence-independent.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['packages/core/src/**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
      rules: {
        'no-restricted-imports': restriction(
          ['apps', 'backend', 'db', 'prisma', 'frontend', 'contracts', 'utils', 'configs'],
          'packages/core is framework-free and may not import another workspace package.',
        ),
      },
    },
    {
      files: ['packages/db/src/**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
      rules: {
        'no-restricted-imports': restriction(
          ['apps', 'backend', 'frontend', 'contracts', 'core', 'utils', 'configs'],
          'packages/db is the persistence adapter and may not import another workspace package.',
        ),
      },
    },
    {
      files: ['packages/ui/src/**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
      rules: {
        'no-restricted-imports': restriction(
          ['apps', 'backend', 'db', 'prisma', 'configs'],
          'packages/ui may not import application, backend, or database code.',
        ),
      },
    },
    {
      files: [
        'packages/contracts/src/**/*.{ts,tsx,mts,cts,js,mjs,cjs}',
        'packages/i18n/src/**/*.{ts,tsx,mts,cts,js,mjs,cjs}',
      ],
      rules: {
        'no-restricted-imports': restriction(
          ['apps', 'backend', 'db', 'prisma', 'configs'],
          'Shared contracts and i18n packages may not depend on applications, backend, or persistence.',
        ),
      },
    },
    {
      files: ['packages/utils/src/**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
      rules: {
        'no-restricted-imports': restriction(
          ['apps', 'backend', 'db', 'prisma', 'frontend', 'contracts', 'core', 'configs'],
          'packages/utils contains dependency-free helpers and may not import another workspace package.',
        ),
      },
    },
  );
}
