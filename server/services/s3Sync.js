const fs = require('fs');
const { uploadFile, getObjectSize } = require('./s3');

// Real end-to-end testing (proj_1783321393296, 33 audio + 14 images + ~16 unique clips)
// showed a flat UPLOAD_CONCURRENCY=6 saturates typical upload bandwidth once multiple
// multi-hundred-MB real_footage clips are in flight at once: individual multipart upload
// connections went quiet long enough for S3 to close them ("Your socket connection to the
// server was not read from or written to within the timeout period") and produced
// ECONNRESET. Images/audio (tens of KB to ~10MB in that same test) never had this problem.
// So concurrency is now size-tiered instead of flat, and the two tiers run concurrently
// with each other (not sequentially) so a large clip set doesn't stall small-asset
// throughput — worst case is SMALL_ASSET_CONCURRENCY + LARGE_ASSET_CONCURRENCY sockets
// open at once, still well under the flat 6 that caused the failures.
const SMALL_ASSET_CONCURRENCY = 4;
const LARGE_ASSET_CONCURRENCY = 2;
const LARGE_FILE_THRESHOLD_BYTES = 50 * 1024 * 1024; // 50MB

// A transient network drop on ONE large file must not abort the whole render — retry a
// few times with exponential backoff before giving up. Only for errors that actually look
// transient (the exact error shapes observed in the real test below); a permissions/
// config error (AccessDenied, NoSuchBucket, InvalidAccessKeyId, ...) retrying won't fix,
// so those fail on the first attempt instead of wasting time.
const MAX_UPLOAD_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 500;

const TRANSIENT_ERROR_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNABORTED']);
function isTransientNetworkError(err) {
  if (err?.transient) return true; // explicitly marked by uploadOneWithRetry's own size-mismatch check
  if (err?.code && TRANSIENT_ERROR_CODES.has(err.code)) return true;
  const msg = err?.message || '';
  return /was not read from or written to within the timeout period|ECONNRESET|ETIMEDOUT|socket hang up/i.test(msg);
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

// uploadOneWithRetry — uploads a single asset, verifies it landed at the expected byte
// size (stronger than a bare existence check — catches a truncated/partial upload that
// would otherwise silently look "done"), and retries transient failures with backoff.
async function uploadOneWithRetry(asset, { uploadFileFn, getObjectSizeFn, onRetry }) {
  const localSize = fs.statSync(asset.localPath).size;
  let lastErr;

  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
    try {
      await uploadFileFn(asset.localPath, asset.key);
      const remoteSize = await getObjectSizeFn(asset.key);
      if (remoteSize !== localSize) {
        // A truncated/partial upload (the network dropped mid-transfer, S3 has a
        // short/incomplete object) is exactly the kind of thing a retry should fix —
        // explicitly marked retryable rather than relying on isTransientNetworkError's
        // message/code matching, which only recognizes externally-thrown SDK errors.
        throw Object.assign(
          new Error(`upload completed but size mismatch (local ${localSize} vs S3 ${remoteSize})`),
          { transient: true }
        );
      }
      return { ok: true };
    } catch (err) {
      lastErr = err;
      const canRetry = isTransientNetworkError(err) && attempt < MAX_UPLOAD_ATTEMPTS;
      if (!canRetry) return { ok: false, error: err.message };
      if (onRetry) onRetry(asset, attempt, MAX_UPLOAD_ATTEMPTS, err.message);
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
  return { ok: false, error: lastErr?.message };
}

// syncAssetsToS3 — uploads exactly the local files a render references, to the exact S3
// keys renderAssets.js's buildAssetKey() already computed for them (see render.js's
// resolveAsset — it builds the same key it hands to resolveRenderAssetUrl and pushes it
// onto the upload queue, so upload and resolved-URL can never drift onto different keys).
//
// assets: [{ localPath, key, shared, sceneId, kind }]
//   `shared` no longer changes upload logic here (see the size-comparison skip check
//   below, which applies uniformly) — it's passed through in failure entries only for
//   diagnostic labeling.
//
// Skip check: a key already in S3 whose size matches the local file's size is treated as
// "already uploaded, unchanged" and skipped — safe for shared clips (the dedup this was
// originally built for: never re-push the whole clip library) AND for per-project image/
// audio (lets a retry-after-partial-failure resume without re-uploading everything that
// already succeeded), because a genuinely regenerated file (new Higgsfield image, new
// narration take) essentially never happens to land on the exact same byte count as what
// it's replacing, so it still gets correctly re-uploaded. A failed size probe during this
// check (rather than a clean "not found") is treated as "assume it needs uploading" and
// logged, not thrown — a transient hiccup on this cheap metadata call must not abort the
// whole batch before any upload even starts.
//
// deps.uploadFile / deps.getObjectSize default to the real server/services/s3.js
// implementations — injectable so s3Sync.test.js can verify the dedup/concurrency/retry/
// failure-collection logic with in-memory fakes, no AWS credentials or network needed.
//
// onProgress(completed, total) fires after each upload attempt (success or failure).
// onRetry(asset, attempt, maxAttempts, errorMessage) fires before each retry delay.
// server/routes/render.js uses both to broadcast SSE upload progress/log messages.
//
// Returns { failures, uploadedCount, skippedCount, totalReferenced }. An empty
// `failures` array means every referenced asset is now confirmed present in S3 at the
// correct size.
async function syncAssetsToS3(assets, {
  onProgress,
  onRetry,
  uploadFile: uploadFileFn = uploadFile,
  getObjectSize: getObjectSizeFn = getObjectSize,
} = {}) {
  // Dedupe by key first — two scenes can reference the identical file (the same stock
  // clip picked for two scenes, or the same narration file reused).
  const byKey = new Map();
  for (const asset of assets) {
    if (!byKey.has(asset.key)) byKey.set(asset.key, asset);
  }
  const unique = [...byKey.values()];

  const skipCheckResults = await mapWithConcurrency(unique, SMALL_ASSET_CONCURRENCY, async (asset) => {
    let remoteSize;
    try {
      remoteSize = await getObjectSizeFn(asset.key);
    } catch (err) {
      console.warn(`[s3Sync] size check failed for ${asset.key}, assuming upload needed: ${err.message}`);
      return { asset, skip: false };
    }
    if (remoteSize === null) return { asset, skip: false };
    const localSize = fs.statSync(asset.localPath).size;
    return { asset, skip: remoteSize === localSize };
  });

  const toUpload     = skipCheckResults.filter(r => !r.skip).map(r => r.asset);
  const skippedCount = skipCheckResults.length - toUpload.length;

  const smallAssets = toUpload.filter(a => fs.statSync(a.localPath).size < LARGE_FILE_THRESHOLD_BYTES);
  const largeAssets = toUpload.filter(a => fs.statSync(a.localPath).size >= LARGE_FILE_THRESHOLD_BYTES);

  const total = toUpload.length;
  let completed = 0;
  const failures = [];

  async function runOne(asset) {
    const result = await uploadOneWithRetry(asset, { uploadFileFn, getObjectSizeFn, onRetry });
    if (!result.ok) failures.push({ ...asset, error: result.error });
    completed++;
    if (onProgress) onProgress(completed, total);
  }

  await Promise.all([
    mapWithConcurrency(smallAssets, SMALL_ASSET_CONCURRENCY, runOne),
    mapWithConcurrency(largeAssets, LARGE_ASSET_CONCURRENCY, runOne),
  ]);

  return {
    failures,
    uploadedCount:   toUpload.length - failures.length,
    skippedCount,
    totalReferenced: unique.length,
  };
}

module.exports = { syncAssetsToS3 };
