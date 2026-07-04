// Plain Node test (no React test runner is wired into the client). Run with:
//   node client/overlayGate.test.cjs
//
// The overlay review UI is gated purely on the client: overlays already live in scene data from
// the single /api/analyze call, and the review surface (banner + modal + per-scene badges) must
// only appear once the Visuals step is marked complete — WITHOUT firing any new API call. There
// is no jsdom/RTL here, so this asserts the gate contract structurally against the source:
//   1. the gate is exactly `wizard.isComplete('visuals')`
//   2. banner + modal + badges render only when that gate is open
//   3. no overlay accept/reject path (nor the gate transition) performs a fetch
//   4. no orphaned /api/overlays[/generate] reference remains anywhere in client/src

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, 'src')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) walk(full, acc)
    else if (/\.(jsx?|tsx?)$/.test(name)) acc.push(full)
  }
  return acc
}

// ── 4. No orphaned endpoint reference anywhere in client/src ──────────────────
const allFiles = walk(root)
const offenders = allFiles.filter(f => /\/api\/overlays/i.test(fs.readFileSync(f, 'utf8')))
assert.strictEqual(offenders.length, 0,
  `no client file may reference /api/overlays — found: ${offenders.map(f => path.relative(root, f)).join(', ')}`)
console.log('PASS: no orphaned /api/overlays[/generate] reference in client/src')

// ── VideoCreator gate contract ────────────────────────────────────────────────
const vc = read('pages/VideoCreator.jsx')

// 1. Gate is Visuals-complete
assert.ok(/const\s+overlaysVisible\s*=\s*wizard\.isComplete\(\s*['"]visuals['"]\s*\)/.test(vc),
  'overlaysVisible must be defined as wizard.isComplete("visuals")')
console.log('PASS: display gate is wizard.isComplete("visuals")')

// 2a. Banner renders only when gate open AND there are suggestions
assert.ok(/overlaysVisible\s*&&\s*overlayStats\.suggested\s*>\s*0/.test(vc),
  'banner must be guarded by overlaysVisible && overlayStats.suggested > 0')
// 2b. Modal renders only when gate open
assert.ok(/overlaysVisible\s*&&\s*overlayReviewOpen/.test(vc),
  'OverlayReviewModal must be guarded by overlaysVisible && overlayReviewOpen')
console.log('PASS: banner and review modal both render only once the gate is open')

// 2c. Callbacks handed to VisualsStep are themselves gated (null before Visuals complete)
assert.ok(/onAcceptSceneOverlays=\{overlaysVisible \? handleAcceptSceneOverlays : null\}/.test(vc),
  'accept callback must be null until overlaysVisible')
assert.ok(/onRejectSceneOverlays=\{overlaysVisible \? handleRejectSceneOverlays : null\}/.test(vc),
  'reject callback must be null until overlaysVisible')
console.log('PASS: per-scene accept/reject callbacks are gated null until Visuals complete')

// 3. No overlay handler (nor the gate) fires an API call — they only setScenes locally.
//    Extract each handler body and assert it contains setScenes and NOT fetch.
const handlerNames = [
  'handleAcceptAllOverlays', 'handleRejectAllOverlays',
  'handleAcceptSceneOverlays', 'handleRejectSceneOverlays',
  'handleAcceptOverlay', 'handleRejectOverlay',
]
for (const name of handlerNames) {
  const idx = vc.indexOf(`const ${name} = `)
  assert.ok(idx !== -1, `${name} must exist in VideoCreator`)
  const body = vc.slice(idx, idx + 400)
  assert.ok(/setScenes\(/.test(body), `${name} must update scenes locally via setScenes`)
  assert.ok(!/fetch\(/.test(body), `${name} must NOT perform a fetch (no API call on review actions)`)
}
console.log('PASS: all 6 overlay handlers mutate local state only — zero fetch/API calls')

// ── SceneGrid per-scene badge is gated ─────────────────────────────────────────
const grid = read('components/video-creator/SceneGrid.jsx')
assert.ok(/overlaysVisible\s*&&\s*\(\(\)\s*=>/.test(grid),
  'SceneGrid per-scene overlay badge block must be guarded by overlaysVisible')
console.log('PASS: SceneGrid per-scene overlay badge is gated on overlaysVisible')

console.log('\nALL OVERLAY GATE CONTRACT TESTS PASSED')
