// Plain Node test — no framework wired into this repo yet. Run with:
//   node server/services/s3Sync.test.js
//
// Never talks to AWS: uploadFile/objectExists are injected fakes throughout, exercising
// syncAssetsToS3's dedup, shared-tier existence-skip, bounded concurrency, and
// failure-collection logic entirely in-memory. Phase 3 covers a real end-to-end S3 upload
// once a bucket + IAM credentials exist.

const assert = require('assert');
const { syncAssetsToS3 } = require('./s3Sync');

// Must match s3Sync.js's UPLOAD_CONCURRENCY — not exported, so re-asserted here by value.
const UPLOAD_CONCURRENCY = 6;

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function run(name, fn) {
  await fn();
  console.log(`PASS: ${name}`);
}

(async () => {
  // ── dedup by key ─────────────────────────────────────────────────────────────
  await run('two scenes referencing the identical key upload it only once', async () => {
    const uploaded = [];
    const result = await syncAssetsToS3(
      [
        { localPath: '/a/scene_001.mp3', key: 'proj_x/audio/scene_001.mp3', shared: false, sceneId: '001' },
        { localPath: '/a/scene_001.mp3', key: 'proj_x/audio/scene_001.mp3', shared: false, sceneId: '005' },
      ],
      {
        uploadFile: async (localPath, key) => { uploaded.push(key); },
        objectExists: async () => true,
      }
    );
    assert.strictEqual(uploaded.length, 1);
    assert.strictEqual(result.totalReferenced, 1);
    assert.strictEqual(result.uploadedCount, 1);
    assert.deepStrictEqual(result.failures, []);
  });

  // ── shared-tier dedup via objectExists ───────────────────────────────────────
  await run('shared asset already in S3 is skipped, not uploaded', async () => {
    const uploaded = [];
    const result = await syncAssetsToS3(
      [{ localPath: '/lib/clips/x.mp4', key: 'library/clips/x.mp4', shared: true, sceneId: '001' }],
      {
        uploadFile: async (localPath, key) => { uploaded.push(key); },
        objectExists: async () => true, // already exists in S3
      }
    );
    assert.strictEqual(uploaded.length, 0);
    assert.strictEqual(result.skippedCount, 1);
    assert.strictEqual(result.uploadedCount, 0);
    assert.strictEqual(result.totalReferenced, 1);
  });

  await run('shared asset NOT in S3 is uploaded', async () => {
    const uploaded = [];
    const result = await syncAssetsToS3(
      [{ localPath: '/lib/clips/y.mp4', key: 'library/clips/y.mp4', shared: true, sceneId: '001' }],
      {
        uploadFile: async (localPath, key) => { uploaded.push(key); },
        objectExists: async () => false, // not there yet, then confirmed true post-upload below
      }
    );
    // objectExists is also used for the post-upload confirmation — a fake that always
    // returns false would make the upload look like it silently failed. Use a stateful
    // fake instead to distinguish "pre-upload existence check" from "post-upload confirm".
    assert.strictEqual(uploaded.length, 1);
    assert.strictEqual(result.failures.length, 1); // confirms post-upload check ran and caught the always-false fake
  });

  await run('shared asset upload + post-upload confirmation, stateful fake', async () => {
    const present = new Set();
    const uploaded = [];
    const result = await syncAssetsToS3(
      [{ localPath: '/lib/clips/z.mp4', key: 'library/clips/z.mp4', shared: true, sceneId: '001' }],
      {
        uploadFile: async (localPath, key) => { uploaded.push(key); present.add(key); },
        objectExists: async (key) => present.has(key),
      }
    );
    assert.strictEqual(uploaded.length, 1);
    assert.strictEqual(result.uploadedCount, 1);
    assert.strictEqual(result.skippedCount, 0);
    assert.deepStrictEqual(result.failures, []);
  });

  // ── project-tier always uploads, even if "exists" would say otherwise ────────
  await run('per-project asset uploads unconditionally, ignoring objectExists', async () => {
    const uploaded = [];
    const result = await syncAssetsToS3(
      [{ localPath: '/p/003.png', key: 'proj_x/images/003.png', shared: false, sceneId: '003' }],
      {
        uploadFile: async (localPath, key) => { uploaded.push(key); },
        objectExists: async () => true, // would look "already there", but shared:false must not skip
      }
    );
    assert.strictEqual(uploaded.length, 1, 'per-project assets must always upload/overwrite');
    assert.strictEqual(result.uploadedCount, 1);
    assert.strictEqual(result.skippedCount, 0);
  });

  // ── failure collection doesn't abort the rest ────────────────────────────────
  await run('one failing upload is collected, others still complete', async () => {
    const assets = [
      { localPath: '/p/a.png', key: 'proj_x/images/a.png', shared: false, sceneId: 'a' },
      { localPath: '/p/b.png', key: 'proj_x/images/b.png', shared: false, sceneId: 'b' },
      { localPath: '/p/c.png', key: 'proj_x/images/c.png', shared: false, sceneId: 'c' },
    ];
    const result = await syncAssetsToS3(assets, {
      uploadFile: async (localPath, key) => {
        if (key.endsWith('b.png')) throw new Error('simulated network failure');
      },
      objectExists: async () => true,
    });
    assert.strictEqual(result.failures.length, 1);
    assert.strictEqual(result.failures[0].key, 'proj_x/images/b.png');
    assert.strictEqual(result.failures[0].error, 'simulated network failure');
    assert.strictEqual(result.uploadedCount, 2);
  });

  // ── bounded concurrency ───────────────────────────────────────────────────────
  await run(`uploads run with concurrency <= ${UPLOAD_CONCURRENCY}, and use more than 1 in parallel`, async () => {
    let inFlight = 0;
    let peak = 0;
    const assets = Array.from({ length: 20 }, (_, i) => ({
      localPath: `/p/${i}.png`, key: `proj_x/images/${i}.png`, shared: false, sceneId: String(i),
    }));
    await syncAssetsToS3(assets, {
      uploadFile: async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await delay(5);
        inFlight--;
      },
      objectExists: async () => true,
    });
    assert.ok(peak <= UPLOAD_CONCURRENCY, `peak concurrency ${peak} exceeded limit ${UPLOAD_CONCURRENCY}`);
    assert.ok(peak > 1, `expected uploads to overlap, but peak concurrency was only ${peak}`);
  });

  // ── onProgress fires once per attempt, with the right totals ────────────────
  await run('onProgress reports (completed, total) once per upload attempt', async () => {
    const calls = [];
    const assets = Array.from({ length: 4 }, (_, i) => ({
      localPath: `/p/${i}.png`, key: `proj_x/images/${i}.png`, shared: false, sceneId: String(i),
    }));
    await syncAssetsToS3(assets, {
      uploadFile: async () => {},
      objectExists: async () => true,
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
      objectExists: async () => { called = true; return true; },
    });
    assert.strictEqual(called, false);
    assert.deepStrictEqual(result, { failures: [], uploadedCount: 0, skippedCount: 0, totalReferenced: 0 });
  });

  console.log('\nAll s3Sync tests passed.');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
