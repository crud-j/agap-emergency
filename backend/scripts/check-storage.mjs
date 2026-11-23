// Checks object storage (R2, Garage, MinIO) with the same S3 settings as
// src/media/media.service.ts. Reads STORAGE_* from the environment; prints no secrets.
//
//   cd backend
//   node scripts/check-storage.mjs
//
// Steps: HeadBucket (the backend's startup check; a refusal here makes every upload
// fall back to local disk), then put, get and delete a small test object, first with
// the SDK's default checksums, then with checksums only when required (plan step 1.5).
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');

const endpoint = process.env.STORAGE_ENDPOINT;
const bucket = process.env.STORAGE_BUCKET ?? 'agap-media';
const region = process.env.STORAGE_REGION ?? 'auto';
const accessKeyId = process.env.STORAGE_ACCESS_KEY;
const secretAccessKey = process.env.STORAGE_SECRET_KEY;

const missing = ['STORAGE_ENDPOINT', 'STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY'].filter(
  (k) => !process.env[k],
);
if (missing.length) {
  console.error(`Missing: ${missing.join(', ')}`);
  process.exit(2);
}

console.log(`Endpoint: ${endpoint}`);
console.log(`Bucket:   ${bucket}   Region: ${region}\n`);

function client(checksumsWhenRequired) {
  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
    ...(checksumsWhenRequired
      ? { requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' }
      : {}),
  });
}

function describe(err) {
  const status = err?.$metadata?.httpStatusCode;
  return `${err?.name ?? 'Error'}${status ? ` (HTTP ${status})` : ''}: ${err?.message ?? String(err)}`;
}

async function step(label, fn) {
  try {
    await fn();
    console.log(`  OK    ${label}`);
    return true;
  } catch (err) {
    console.log(`  FAIL  ${label}\n        ${describe(err)}`);
    return false;
  }
}

async function roundTrip(s3) {
  const key = `healthcheck/check-storage-${Date.now()}.txt`;
  const body = `agap storage check ${new Date().toISOString()}`;
  const put = await step('put test object', () =>
    s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'text/plain' })),
  );
  if (!put) return false;
  const got = await step('get test object and compare', async () => {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const text = await res.Body.transformToString();
    if (text !== body) throw new Error('content differs');
  });
  const del = await step('delete test object', () =>
    s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
  );
  return got && del;
}

const s3 = client(false);
console.log('1. Startup bucket check (HeadBucket)');
const head = await step('HeadBucket', () => s3.send(new HeadBucketCommand({ Bucket: bucket })));

console.log('\n2. Upload round trip, SDK default checksums');
let ok = await roundTrip(s3);
let needsChecksumFix = false;
if (!ok) {
  console.log('\n3. Upload round trip, checksums only when required');
  ok = await roundTrip(client(true));
  needsChecksumFix = ok;
}

console.log('\nResult:');
if (!head) console.log('  - HeadBucket refused: the backend would treat storage as down. Check the token scope.');
if (needsChecksumFix) console.log('  - Default checksums fail: apply plan step 1.5 to media.service.ts.');
if (head && ok && !needsChecksumFix) console.log('  - Storage works with the backend settings as they are.');
if (!ok) console.log('  - Uploads fail even without checksums. Check endpoint, bucket name and keys.');
process.exit(head && ok ? 0 : 1);
