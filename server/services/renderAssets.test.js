// Plain Node test — no framework wired into this repo yet. Run with:
//   node server/services/renderAssets.test.js
//
// Sets AWS_REGION/AWS_S3_BUCKET before requiring the module under test so getPublicUrl()
// produces a deterministic URL regardless of whether a real .env is loaded — this suite
// never talks to AWS (renderAssets.js is pure string logic; s3.js's getPublicUrl() is
// itself just string interpolation, no network call).
process.env.AWS_REGION    = 'us-east-1';
process.env.AWS_S3_BUCKET = 'vorta-test-bucket';

const assert = require('assert');
const { resolveRenderAssetUrl } = require('./renderAssets');

const BASE = 'https://vorta-test-bucket.s3.us-east-1.amazonaws.com';

// ── falsy input ──────────────────────────────────────────────────────────────
assert.strictEqual(resolveRenderAssetUrl(null, 'images', 'proj_1'), null);
assert.strictEqual(resolveRenderAssetUrl(undefined, 'audio', 'proj_1'), null);
assert.strictEqual(resolveRenderAssetUrl('', 'images', 'proj_1'), null);
console.log('PASS: falsy rawPath resolves to null (not-generated-yet, not a failure)');

// ── per-project image, root-relative input ──────────────────────────────────
assert.strictEqual(
  resolveRenderAssetUrl('/projects/proj_1783141891744/assets/003.png', 'images', 'proj_1783141891744'),
  `${BASE}/proj_1783141891744/images/003.png`
);
console.log('PASS: root-relative /projects/... image path resolves under proj_<id>/images/');

// ── per-project audio, stale http://localhost URL (pre-fix scenes.json shape) ───
assert.strictEqual(
  resolveRenderAssetUrl('http://localhost:3001/projects/proj_x/audio/scene_001.mp3', 'audio', 'proj_x'),
  `${BASE}/proj_x/audio/scene_001.mp3`
);
console.log('PASS: stale http://localhost URL strips origin, resolves under proj_<id>/audio/');

// ── per-project audio, bare filename ─────────────────────────────────────────
assert.strictEqual(
  resolveRenderAssetUrl('scene_005.mp3', 'audio', 'proj_x'),
  `${BASE}/proj_x/audio/scene_005.mp3`
);
console.log('PASS: bare filename resolves under proj_<id>/audio/');

// ── shared clip, /library/... path, namespace=null (deduplicated, not per-project) ──
assert.strictEqual(
  resolveRenderAssetUrl('/library/clips/pixabay_4730_indoor_market__vegetable_marke.mp4', 'clips', null),
  `${BASE}/library/clips/pixabay_4730_indoor_market__vegetable_marke.mp4`
);
console.log('PASS: clip resolves under shared library/clips/, not proj_<id>/clips/');

// ── shared clip, stale http:// URL with a different host/port than audio/images used ──
assert.strictEqual(
  resolveRenderAssetUrl('http://localhost:3001/library/clips/x.mp4', 'clips', null),
  `${BASE}/library/clips/x.mp4`
);
console.log('PASS: clip with stale http://localhost URL still resolves under shared library/clips/');

// ── shared clip, a "/public/clips/..." shape (post local-staticFile-fix scenes.json) ──
assert.strictEqual(
  resolveRenderAssetUrl('/public/clips/x.mp4', 'clips', null),
  `${BASE}/library/clips/x.mp4`
);
console.log('PASS: /public/... prefix is stripped the same way as /projects/...');

// ── library music/ambient/stings/overlay-sounds — not wired into any render prop yet,
// but the resolver must already support the shared key shape for when that ships ──
assert.strictEqual(
  resolveRenderAssetUrl('/library/ambient/ambient_tech_neutral_1781012010832.mp3', 'ambient', null),
  `${BASE}/library/ambient/ambient_tech_neutral_1781012010832.mp3`
);
console.log('PASS: library ambient track resolves under shared library/ambient/ (unused today, ready for later)');

// ── query string stripped ────────────────────────────────────────────────────
assert.strictEqual(
  resolveRenderAssetUrl('/projects/proj_x/assets/003.png?v=2', 'images', 'proj_x'),
  `${BASE}/proj_x/images/003.png`
);
console.log('PASS: trailing query string is stripped before building the key');

console.log('\nAll renderAssets tests passed.');
