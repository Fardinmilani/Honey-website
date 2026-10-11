import { createRequire } from 'node:module';
const require = createRequire(new URL('../packages/backend/package.json', import.meta.url));
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const endpoint = process.env.S3_INTERNAL_ENDPOINT ?? 'http://127.0.0.1:9000';
if (!['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname))
  throw new Error('Only local MinIO is inspected.');
const client = new S3Client({
  endpoint,
  region: process.env.S3_REGION ?? 'local',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? process.env.MINIO_ROOT_USER ?? 'honey-local-minio',
    secretAccessKey:
      process.env.S3_SECRET_KEY ??
      process.env.MINIO_ROOT_PASSWORD ??
      'replace-with-local-development-password',
  },
});
try {
  let matches = 0;
  for (const bucket of [
    process.env.S3_PUBLIC_BUCKET ?? 'honey-media',
    process.env.S3_PRIVATE_BUCKET ?? 'honey-private',
  ]) {
    let token;
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          MaxKeys: 1000,
          ...(token === undefined ? {} : { ContinuationToken: token }),
        }),
      );
      matches += (page.Contents ?? []).filter((item) =>
        /hero|honey-scroll|honey-poster|hero-start|hero-end/iu.test(item.Key ?? ''),
      ).length;
      token = page.NextContinuationToken;
    } while (token !== undefined);
  }
  if (matches !== 0) throw new Error('Hero exclusion check failed.');
  process.stdout.write('Local MinIO Hero-name scan: 0 matches across both configured buckets.\n');
} catch {
  throw new Error(
    'Local MinIO Hero exclusion check failed; object names and credentials are redacted.',
  );
} finally {
  client.destroy();
}
