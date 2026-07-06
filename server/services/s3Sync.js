const { uploadFile, objectExists } = require('./s3');

// Sane parallel upload limit — large real_footage clip sets shouldn't upload one-at-a-time,
// but an unbounded Promise.all over dozens of multi-hundred-MB files would compete for the
// same bandwidth/memory anyway. No new dependency: a small internal batch runner.
const UPLOAD_CONCURRENCY = 6;

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

// syncAssetsToS3 — uploads exactly the local files a render references, to the exact S3
// keys renderAssets.js's buildAssetKey() already computed for them (see render.js's
// resolveAsset — it builds the same key it hands to resolveRenderAssetUrl and pushes it
// onto the upload queue, so upload and resolved-URL can never drift onto different keys).
//
// assets: [{ localPath, key, shared, sceneId, kind }]
//   shared: true  — clips today (and, once that feature ships, library music/ambient/
//     stings/overlay-sounds) — these live in one deduplicated cross-project tier, so a
//     key already present in S3 is left alone (objectExists guard) instead of re-uploaded.
//     This is what stops every render from re-pushing the whole shared clip library.
//   shared: false — per-project image/audio/uploaded-narration — always uploaded/
//     overwritten; these are project-specific and may have regenerated since last render.
//
// deps.uploadFile / deps.objectExists default to the real server/services/s3.js
// implementations — injectable so s3Sync.test.js can verify the dedup/concurrency/
// failure-collection logic with in-memory fakes, no AWS credentials or network needed.
//
// onProgress(completed, total) fires after each upload attempt (success or failure) —
// server/routes/render.js uses this to broadcast SSE upload progress.
//
// Returns { failures, uploadedCount, skippedCount, totalReferenced }. An empty
// `failures` array means every referenced asset is now confirmed present in S3.
async function syncAssetsToS3(assets, {
  onProgress,
  uploadFile: uploadFileFn = uploadFile,
  objectExists: objectExistsFn = objectExists,
} = {}) {
  // Dedupe by key first — two scenes can reference the identical file (the same stock
  // clip picked for two scenes, or the same narration file reused), and there's no reason
  // to upload/check the same bytes twice within one render.
  const byKey = new Map();
  for (const asset of assets) {
    if (!byKey.has(asset.key)) byKey.set(asset.key, asset);
  }
  const unique = [...byKey.values()];

  const sharedAssets  = unique.filter(a => a.shared);
  const projectAssets = unique.filter(a => !a.shared);

  // Shared-tier dedup: skip anything already in S3. Existence checks are cheap HEAD
  // requests, but still worth batching for a large clip set.
  const existenceResults = await mapWithConcurrency(sharedAssets, UPLOAD_CONCURRENCY, async (asset) => ({
    asset,
    exists: await objectExistsFn(asset.key),
  }));
  const sharedToUpload = existenceResults.filter(r => !r.exists).map(r => r.asset);
  const sharedSkipped  = existenceResults.length - sharedToUpload.length;

  const toUpload = [...projectAssets, ...sharedToUpload];
  const total = toUpload.length;
  let completed = 0;
  const failures = [];

  await mapWithConcurrency(toUpload, UPLOAD_CONCURRENCY, async (asset) => {
    try {
      await uploadFileFn(asset.localPath, asset.key);
      // Post-upload validation — confirm the object is actually retrievable before
      // treating it as done, rather than trusting a non-throwing upload() call alone.
      const confirmed = await objectExistsFn(asset.key);
      if (!confirmed) {
        throw new Error('upload completed but a follow-up objectExists check returned false');
      }
    } catch (err) {
      failures.push({ ...asset, error: err.message });
    } finally {
      completed++;
      if (onProgress) onProgress(completed, total);
    }
  });

  return {
    failures,
    uploadedCount:   toUpload.length - failures.length,
    skippedCount:    sharedSkipped,
    totalReferenced: unique.length,
  };
}

module.exports = { syncAssetsToS3 };
