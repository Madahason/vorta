// Plain Node test — no framework wired into this repo yet. Run with:
//   node server/services/s3Sync.test.js
//
// Never talks to AWS: uploadFile/getObjectSize are injected fakes throughout, exercising
// syncAssetsToS3's dedup, size-comparison skip check, size-tiered concurrency, and
// retry/backoff logic entirely in-memory (against real temp files on disk, since
// fs.statSync(localPath) is not itself injectable — that's deliberate, it's the same
// local-file-size read the real code path uses). A real end-to-end S3 upload was already
// verified live against proj_1783321393296 in this session (45 assets landed; the
// failures that prompted this rewrite were all transient network drops on large clips,
// not auth/bucket/IAM — see PLAN.md).

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { syncAssetsToS3 } = require('./s3Sync');

async function run(name, fn) {
  await fn();
  console.log(`PASS: ${name}`);
}

// ── temp fixture files ──────────────────────────────────────────────────────────
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 's3sync-test-'));
const SMALL_A = path.join(TMP_DIR, 'small-a.bin');
const SMALL_B = path.join(TMP_DIR, 'small-b.bin');
fs.writeFileSync(SMALL_A, Buffer.alloc(100, 1));
fs.writeFileSync(SMALL_B, Buffer.alloc(200, 2));
const SMALL_A_SIZE = fs.statSync(SMALL_A).size;

// LARGE_FILE_THRESHOLD_BYTES in s3Sync.js is 50MB — not exported, so a sparse-ish file
// just over that is created via truncate (extends the file with zero-fill; doesn't
// require writing 50MB+ through JS) rather than hardcoding/duplicating the constant here.
const LARGE_A = path.join(TMP_DIR, 'large-a.bin');
const LARGE_B = path.join(TMP_DIR, 'large-b.bin');
const LARGE_C = path.join(TMP_DIR, 'large-c.bin');
const LARGE_SIZE = 60 * 1024 * 1024; // 60MB — over the 50MB threshold
for (const p of [LARGE_A, LARGE_B, LARGE_C]) {
  fs.writeFileSync(p, '');
  fs.truncateSync(p, LARGE_SIZE);
}

// makeFakeS3Store — a realistic in-memory stand-in for "what's actually in the bucket":
// getObjectSize reads from it, uploadFile writes to it (recording the REAL local file
// size, exactly like a real upload would). This is what makes the pre-upload skip-check
// and the post-upload verification behave consistently with each other in every test
// below, instead of each test hand-rolling a fake that has to separately account for
// both call sites.
function makeFakeS3Store(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getObjectSize: async (key) => (store.has(key) ? store.get(key) : null),
    uploadFile: async (localPath, key) => { store.set(key, fs.statSync(localPath).size); },
  };
}

function transientErr(message = 'Your socket connection to the server was not read from or written to within the timeout period. Idle connections will be closed.') {
  return new Error(message);
}
function econnreset() {
  const err = new Error('read ECONNRESET');
  err.code = 'ECONNRESET';
  return err;
}

(async () => {
  // ── dedup by key ─────────────────────────────────────────────────────────────
  await run('two scenes referencing the identical key upload it only once', async () => {
    const fake = makeFakeS3Store();
    const uploadSpy = [];
    const result = await syncAssetsToS3(
      [
        { localPath: SMALL_A, key: 'proj_x/audio/scene_001.mp3', shared: false, sceneId: '001' },
        { localPath: SMALL_A, key: 'proj_x/audio/scene_001.mp3', shared: false, sceneId: '005' },
      ],
      {
        uploadFile: async (localPath, key) => { uploadSpy.push(key); return fake.uploadFile(localPath, key); },
        getObjectSize: fake.getObjectSize,
      }
    );
    assert.strictEqual(uploadSpy.length, 1);
    assert.strictEqual(result.totalReferenced, 1);
    assert.strictEqual(result.uploadedCount, 1);
    assert.deepStrictEqual(result.failures, []);
  });

  // ── size-comparison skip check (applies uniformly, shared or not) ────────────
  await run('S3 object with matching size is skipped, not uploaded (shared)', async () => {
    const fake = makeFakeS3Store({ 'library/clips/x.mp4': SMALL_A_SIZE });
    const uploadSpy = [];
    const result = await syncAssetsToS3(
      [{ localPath: SMALL_A, key: 'library/clips/x.mp4', shared: true, sceneId: '001' }],
      { uploadFile: async (...args) => { uploadSpy.push(args[1]); return fake.uploadFile(...args); }, getObjectSize: fake.getObjectSize }
    );
    assert.strictEqual(uploadSpy.length, 0);
    assert.strictEqual(result.skippedCount, 1);
    assert.strictEqual(result.uploadedCount, 0);
  });

  await run('S3 object with matching size is skipped, not uploaded (per-project) — resume behavior', async () => {
    const fake = makeFakeS3Store({ 'proj_x/images/003.png': SMALL_A_SIZE });
    const uploadSpy = [];
    const result = await syncAssetsToS3(
      [{ localPath: SMALL_A, key: 'proj_x/images/003.png', shared: false, sceneId: '003' }],
      { uploadFile: async (...args) => { uploadSpy.push(args[1]); return fake.uploadFile(...args); }, getObjectSize: fake.getObjectSize }
    );
    assert.strictEqual(uploadSpy.length, 0, 'a per-project asset already uploaded at the same size must be skipped on resume');
    assert.strictEqual(result.skippedCount, 1);
  });

  await run('S3 object with DIFFERENT size is re-uploaded (regenerated content, same filename)', async () => {
    const fake = makeFakeS3Store({ 'proj_x/images/003.png': SMALL_A_SIZE + 999 }); // stale object
    const uploadSpy = [];
    const result = await syncAssetsToS3(
      [{ localPath: SMALL_A, key: 'proj_x/images/003.png', shared: false, sceneId: '003' }],
      { uploadFile: async (...args) => { uploadSpy.push(args[1]); return fake.uploadFile(...args); }, getObjectSize: fake.getObjectSize }
    );
    assert.strictEqual(uploadSpy.length, 1, 'a changed local file must overwrite the stale S3 object, never be skipped');
    assert.strictEqual(result.skippedCount, 0);
    assert.deepStrictEqual(result.failures, [], 'the re-upload must succeed once it lands at the correct (now-matching) size');
  });

  await run('no S3 object at all (getObjectSize null) uploads normally', async () => {
    const fake = makeFakeS3Store();
    const uploadSpy = [];
    await syncAssetsToS3(
      [{ localPath: SMALL_B, key: 'proj_x/images/004.png', shared: false, sceneId: '004' }],
      { uploadFile: async (...args) => { uploadSpy.push(args[1]); return fake.uploadFile(...args); }, getObjectSize: fake.getObjectSize }
    );
    assert.strictEqual(uploadSpy.length, 1);
  });

  await run('a failed size-check (not a clean "not found") does not crash the batch — assumes upload needed', async () => {
    const fake = makeFakeS3Store();
    let precheckThrown = false;
    const result = await syncAssetsToS3(
      [{ localPath: SMALL_A, key: 'proj_x/images/005.png', shared: false, sceneId: '005' }],
      {
        uploadFile: fake.uploadFile,
        getObjectSize: async (key) => {
          if (!precheckThrown) { precheckThrown = true; throw new Error('transient HeadObject blip'); }
          return fake.getObjectSize(key);
        },
      }
    );
    assert.deepStrictEqual(result.failures, [], 'a failed pre-check must not abort the batch, and must still attempt (and complete) the upload');
    assert.strictEqual(result.uploadedCount, 1);
  });

  // ── retry / backoff ────────────────────────────────────────────────────────────
  await run('transient upload failure is retried and succeeds on the 2nd attempt', async () => {
    const fake = makeFakeS3Store();
    let attempts = 0;
    const retryLog = [];
    const result = await syncAssetsToS3(
      [{ localPath: SMALL_A, key: 'proj_x/audio/scene_002.mp3', shared: false, sceneId: '002' }],
      {
        uploadFile: async (...args) => {
          attempts++;
          if (attempts === 1) throw transientErr();
          return fake.uploadFile(...args);
        },
        getObjectSize: fake.getObjectSize,
        onRetry: (asset, attempt, maxAttempts, msg) => retryLog.push({ attempt, maxAttempts, msg }),
      }
    );
    assert.strictEqual(attempts, 2);
    assert.deepStrictEqual(result.failures, []);
    assert.strictEqual(retryLog.length, 1);
    assert.strictEqual(retryLog[0].attempt, 1);
    assert.strictEqual(retryLog[0].maxAttempts, 4);
  });

  await run('transient upload failure that never recovers is retried up to the max, then fails', async () => {
    let attempts = 0;
    const retryLog = [];
    const result = await syncAssetsToS3(
      [{ localPath: SMALL_A, key: 'proj_x/audio/scene_006.mp3', shared: false, sceneId: '006' }],
      {
        uploadFile: async () => { attempts++; throw econnreset(); },
        getObjectSize: async () => null,
        onRetry: (asset, attempt) => retryLog.push(attempt),
      }
    );
    assert.strictEqual(attempts, 4, 'must attempt exactly MAX_UPLOAD_ATTEMPTS times, not more');
    assert.strictEqual(result.failures.length, 1);
    assert.strictEqual(result.failures[0].key, 'proj_x/audio/scene_006.mp3');
    assert.deepStrictEqual(retryLog, [1, 2, 3], 'onRetry fires before each retry, not after the final failed attempt');
  });

  await run('a non-transient error (e.g. AccessDenied) fails immediately, no retry wasted', async () => {
    let attempts = 0;
    let retried = false;
    const result = await syncAssetsToS3(
      [{ localPath: SMALL_A, key: 'proj_x/audio/scene_007.mp3', shared: false, sceneId: '007' }],
      {
        uploadFile: async () => { attempts++; throw new Error('AccessDenied: not authorized to perform s3:PutObject'); },
        getObjectSize: async () => null,
        onRetry: () => { retried = true; },
      }
    );
    assert.strictEqual(attempts, 1, 'non-transient errors must not be retried');
    assert.strictEqual(retried, false);
    assert.strictEqual(result.failures.length, 1);
    assert.ok(/AccessDenied/.test(result.failures[0].error));
  });

  await run('a truncated upload (size mismatch right after upload) is treated as retryable', async () => {
    let uploadCalls = 0;
    const retryLog = [];
    // First upload "succeeds" but lands short (simulated truncation); second upload
    // reports the correct, matching size.
    const sizeAfterUpload = [SMALL_A_SIZE - 1, SMALL_A_SIZE];
    const result = await syncAssetsToS3(
      [{ localPath: SMALL_A, key: 'proj_x/images/008.png', shared: false, sceneId: '008' }],
      {
        uploadFile: async () => { uploadCalls++; },
        getObjectSize: async () => {
          if (uploadCalls === 0) return null; // pre-check: nothing there yet
          return sizeAfterUpload[uploadCalls - 1];
        },
        onRetry: (asset, attempt, maxAttempts, msg) => retryLog.push(msg),
      }
    );
    assert.strictEqual(uploadCalls, 2, 'a size-mismatch must trigger a re-upload attempt, not an immediate failure');
    assert.deepStrictEqual(result.failures, []);
    assert.strictEqual(retryLog.length, 1);
    assert.ok(/size mismatch/.test(retryLog[0]));
  });

  // ── size-tiered concurrency ────────────────────────────────────────────────────
  await run('small and large assets run in separate, independently-bounded concurrency tiers', async () => {
    const fake = makeFakeS3Store();
    let smallInFlight = 0, peakSmall = 0;
    let largeInFlight = 0, peakLarge = 0;
    let bothActiveSimultaneously = false;

    const smallAssets = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map(id => ({
      localPath: SMALL_A, key: `proj_x/images/${id}.png`, shared: false, sceneId: id,
    }));
    const largeAssets = [LARGE_A, LARGE_B, LARGE_C].map((p, i) => ({
      localPath: p, key: `library/clips/large-${i}.mp4`, shared: true, sceneId: `clip${i}`,
    }));

    await syncAssetsToS3([...smallAssets, ...largeAssets], {
      uploadFile: async (localPath, key) => {
        const isLarge = localPath !== SMALL_A;
        if (isLarge) { largeInFlight++; peakLarge = Math.max(peakLarge, largeInFlight); }
        else         { smallInFlight++; peakSmall = Math.max(peakSmall, smallInFlight); }
        if (smallInFlight > 0 && largeInFlight > 0) bothActiveSimultaneously = true;
        await new Promise(r => setTimeout(r, 15));
        if (isLarge) largeInFlight--; else smallInFlight--;
        return fake.uploadFile(localPath, key);
      },
      getObjectSize: fake.getObjectSize,
    });

    assert.ok(peakSmall <= 4, `peak small concurrency ${peakSmall} exceeded SMALL_ASSET_CONCURRENCY (4)`);
    assert.ok(peakLarge <= 2, `peak large concurrency ${peakLarge} exceeded LARGE_ASSET_CONCURRENCY (2)`);
    assert.ok(peakSmall > 1, `expected small uploads to overlap, peak was only ${peakSmall}`);
    assert.ok(bothActiveSimultaneously, 'expected small and large tiers to run concurrently with each other, not sequentially');
  });

  // ── onProgress ────────────────────────────────────────────────────────────────
  await run('onProgress reports (completed, total) once per upload attempt', async () => {
    const fake = makeFakeS3Store();
    const calls = [];
    const assets = ['a', 'b', 'c', 'd'].map(id => ({
      localPath: SMALL_A, key: `proj_x/images/${id}.png`, shared: false, sceneId: id,
    }));
    await syncAssetsToS3(assets, {
      uploadFile: fake.uploadFile,
      getObjectSize: fake.getObjectSize,
      onProgress: (completed, total) => calls.push([completed, total]),
    });
    assert.strictEqual(calls.length, 4);
    calls.forEach(([, total]) => assert.strictEqual(total, 4));
    assert.deepStrictEqual(calls.map(c => c[0]).sort((a, b) => a - b), [1, 2, 3, 4]);
  });

  // ── empty input ───────────────────────────────────────────────────────────────
  await run('empty asset list resolves immediately with no calls', async () => {
    let called = false;
    const result = await syncAssetsToS3([], {
      uploadFile: async () => { called = true; },
      getObjectSize: async () => { called = true; return null; },
    });
    assert.strictEqual(called, false);
    assert.deepStrictEqual(result, { failures: [], uploadedCount: 0, skippedCount: 0, totalReferenced: 0 });
  });

  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  console.log('\nAll s3Sync tests passed.');
})().catch(err => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  console.error(err);
  process.exit(1);
});
