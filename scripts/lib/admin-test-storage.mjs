import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

/** Isolated buckets, with the test origin only. Existing bucket policies remain untouched. */
export async function createAdminTestStorage(root) {
  const require = createRequire(resolve(root, 'packages/backend/package.json'));
  const {
    S3Client,
    CreateBucketCommand,
    PutBucketPolicyCommand,
    ListObjectsV2Command,
    DeleteObjectsCommand,
    DeleteBucketCommand,
  } = require('@aws-sdk/client-s3');
  const execute = promisify(execFile);
  const endpoint = 'http://127.0.0.1:9107';
  const browserEndpoint = endpoint;
  const accessKeyId = 'phase17-test';
  const secretAccessKey = randomBytes(32).toString('base64url');
  const container = `honey-phase17-minio-${randomUUID()}`;
  const dockerEnv = {
    ...process.env,
    MINIO_ROOT_USER: accessKeyId,
    MINIO_ROOT_PASSWORD: secretAccessKey,
    MINIO_API_CORS_ALLOW_ORIGIN: 'http://127.0.0.1:3107',
  };
  let started = false;
  const client = new S3Client({
    endpoint,
    forcePathStyle: true,
    region: 'local',
    credentials: { accessKeyId, secretAccessKey },
  });
  const prefix = `honey-phase17-${randomUUID()}`;
  const publicBucket = `${prefix}-public`;
  const privateBucket = `${prefix}-private`;
  const created = [];
  async function cleanup() {
    try {
      for (const bucket of created) {
        if (!/^honey-phase17-[a-f0-9-]{36}-(public|private)$/u.test(bucket))
          throw new Error('Unsafe test bucket.');
        for (;;) {
          const page = await client.send(
            new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1000 }),
          );
          const objects = (page.Contents ?? [])
            .filter((item) => typeof item.Key === 'string')
            .map((item) => ({ Key: item.Key }));
          if (objects.length === 0) break;
          await client.send(
            new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }),
          );
        }
        await client.send(new DeleteBucketCommand({ Bucket: bucket }));
      }
    } finally {
      client.destroy();
      if (started && /^honey-phase17-minio-[a-f0-9-]{36}$/u.test(container))
        await execute('docker', ['rm', '--force', container], {
          windowsHide: true,
          timeout: 30000,
        });
    }
  }
  let failureCode;
  try {
    await execute(
      'docker',
      [
        'run',
        '--detach',
        '--name',
        container,
        '--publish',
        '127.0.0.1:9107:9000',
        '--env',
        'MINIO_ROOT_USER',
        '--env',
        'MINIO_ROOT_PASSWORD',
        '--env',
        'MINIO_API_CORS_ALLOW_ORIGIN',
        'minio/minio:RELEASE.2025-09-07T16-13-09Z',
        'server',
        '/data',
      ],
      { env: dockerEnv, windowsHide: true, timeout: 60000 },
    );
    started = true;
    const deadline = Date.now() + 60000;
    for (;;) {
      try {
        if (
          (
            await globalThis.fetch(`${endpoint}/minio/health/ready`, {
              signal: globalThis.AbortSignal.timeout(2000),
            })
          ).ok
        )
          break;
      } catch {
        /* Readiness only; no connection data is printed. */
      }
      if (Date.now() >= deadline) throw new Error('MinIOReadinessTimeout');
      await new Promise((accept) => setTimeout(accept, 1000));
    }
    for (const bucket of [publicBucket, privateBucket]) {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
      created.push(bucket);
    }
    await client.send(
      new PutBucketPolicyCommand({
        Bucket: publicBucket,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: '*',
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${publicBucket}/*`],
            },
          ],
        }),
      }),
    );
    return {
      env: {
        S3_PUBLIC_BUCKET: publicBucket,
        S3_PRIVATE_BUCKET: privateBucket,
        S3_INTERNAL_ENDPOINT: endpoint,
        S3_BROWSER_ENDPOINT: browserEndpoint,
        S3_REGION: 'local',
        S3_ACCESS_KEY: accessKeyId,
        S3_SECRET_KEY: secretAccessKey,
        PUBLIC_MEDIA_BASE_URL: `${browserEndpoint}/${publicBucket}/`,
      },
      cleanup,
    };
  } catch (error) {
    await cleanup();
    // Preserve only the classified name; raw transport errors can contain private metadata.
    failureCode =
      error instanceof Error && /^[A-Za-z0-9]{1,60}$/u.test(error.name) ? error.name : 'Unknown';
  }
  throw new Error(`Isolated admin object storage initialization failed (${failureCode}).`, {
    cause: failureCode,
  });
}
