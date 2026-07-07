const fs = require('fs');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

// Both NotFound (404 with a code) and a bare 404 with no code mean "no object at this
// key" for HeadObject/HeadBucket alike — S3 doesn't distinguish "bucket missing" from
// "key missing" in a HeadObject response (no body on either). objectExists()/
// getObjectSize() below both currently treat any 404 as "not found" — a real upload
// attempt (PutObject) still surfaces a clear NoSuchBucket error if the bucket itself is
// wrong, so this hasn't caused a silent failure in practice, but it's a known blind spot
// (flagged during Phase 3 credential debugging, deliberately not tightened here).
function isNotFoundError(err) {
  return err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404;
}

// AWS config comes from the root .env ONLY (same discipline as ANTHROPIC_API_KEY etc. in
// server/index.js) — never hardcoded, never written to a system/user env var.

// getClient() constructs the S3Client LAZILY, on first actual use — not at module load
// time. The AWS SDK's S3Client throws synchronously ("Region is missing") if AWS_REGION
// is unset, and this module is required from server/routes/render.js via
// renderAssets.js — which is required unconditionally, on every server startup, whether
// or not AWS is configured yet. Phase 1 doesn't need AWS credentials at all for local
// rendering (renderTarget: 'local', the default) — only uploadFile()/objectExists() (both
// unused until Phase 2) actually need a working client, so only they pay for constructing
// one, and only when called.
let _client = null;
function getClient() {
  if (!_client) {
    _client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: process.env.AWS_ACCESS_KEY_ID
        ? {
            accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined, // falls back to the default AWS credential chain if unset
    });
  }
  return _client;
}

// getPublicUrl — virtual-hosted-style S3 URL for a key. Pure string interpolation, no
// client needed — this is what makes renderAssets.js's resolveRenderAssetUrl() safe to
// call with no AWS credentials configured at all (Phase 1's whole point: compute the URL
// an asset WILL have, without needing AWS reachable). Assumes the bucket serves objects
// publicly (or via a CloudFront/presigned-URL layer) — the actual access policy is a
// Phase 2 concern (upload time), not something this Phase 1 URL-computation helper decides.
function getPublicUrl(s3Key) {
  return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
}

// uploadFile — streams a local file to S3. Not called anywhere yet (Phase 2 wires this into
// the actual upload step); added now per the phase 1 spec so Phase 2 doesn't need to touch
// this module's shape.
async function uploadFile(localPath, s3Key) {
  const upload = new Upload({
    client: getClient(),
    params: {
      Bucket: process.env.AWS_S3_BUCKET,
      Key:    s3Key,
      Body:   fs.createReadStream(localPath),
    },
  });
  return upload.done();
}

// objectExists — HeadObject probe.
async function objectExists(s3Key) {
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: s3Key }));
    return true;
  } catch (err) {
    if (isNotFoundError(err)) return false;
    throw err;
  }
}

// getObjectSize — HeadObject probe returning the object's byte size, or null if it
// doesn't exist. Used by s3Sync.js to distinguish "already uploaded, unchanged" (S3 size
// matches the local file's size — safe to skip) from "key exists but content differs"
// (e.g. a regenerated scene image reusing the same filename — must re-upload) for BOTH
// shared (clips) and per-project (image/audio) assets, and to verify a just-completed
// upload actually landed at the expected size rather than trusting a non-throwing
// upload() call alone.
async function getObjectSize(s3Key) {
  try {
    const res = await getClient().send(new HeadObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: s3Key }));
    return res.ContentLength ?? null;
  } catch (err) {
    if (isNotFoundError(err)) return null;
    throw err;
  }
}

module.exports = { getClient, uploadFile, getPublicUrl, objectExists, getObjectSize };
