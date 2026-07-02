// Plain Node test — no framework wired into this repo yet. Run with:
//   node server/services/frameMath.test.js
const assert = require('assert')
const {
  FPS, DIP_FADE, DIP_MID, MIN_SCENE_FRAMES, TRANSITION_FRAMES, CUT_FRAMES,
  MAX_SCENE_SECONDS, NARRATION_BUFFER_SECONDS,
  minDurationSeconds, canUseDipTransition, isValidTransition, validateSceneUpdate,
  getTransition, sceneDur, calculateDocumentaryDuration,
} = require('./frameMath')

// Constants must match remotion/src/compositions/Documentary.jsx exactly:
//   TRANSITION_FRAMES = 12, DIP_FRAMES = 18 -> DIP_FADE = 9, MIN_SCENE_FRAMES = 13
assert.strictEqual(FPS, 30)
assert.strictEqual(TRANSITION_FRAMES, 12)
assert.strictEqual(DIP_FADE, 9)
assert.strictEqual(MIN_SCENE_FRAMES, 13)
assert.strictEqual(MAX_SCENE_SECONDS, 8.0)
assert.strictEqual(NARRATION_BUFFER_SECONDS, 0.8)
console.log('PASS: constants match Documentary.jsx / voiceover.js')

// ── minDurationSeconds ──────────────────────────────────────────────────────
assert.strictEqual(minDurationSeconds(3.5), 4.3)
assert.strictEqual(minDurationSeconds(0), 0.8)
assert.strictEqual(minDurationSeconds(undefined), 0.8)
assert.strictEqual(minDurationSeconds(-1), 0.8) // negative treated as no audio
console.log('PASS: minDurationSeconds')

// ── canUseDipTransition — mirrors Documentary.jsx getTransition() downgrade check:
//    dip requires sceneDurationFrames >= DIP_FADE * 2 (18 frames = 0.6s @ 30fps) ─────────────
assert.strictEqual(canUseDipTransition(0.5), false) // 15 frames < 18
assert.strictEqual(canUseDipTransition(0.6), true)  // 18 frames == 18
assert.strictEqual(canUseDipTransition(0.58), false) // 17.4 frames -> rounds to 17 < 18
assert.strictEqual(canUseDipTransition(2), true)
assert.strictEqual(canUseDipTransition(0), false)
console.log('PASS: canUseDipTransition matches Documentary.jsx downgrade threshold')

// ── isValidTransition ────────────────────────────────────────────────────────
assert.strictEqual(isValidTransition('dissolve'), true)
assert.strictEqual(isValidTransition('dip_black'), true)
assert.strictEqual(isValidTransition('dip_white'), true)
assert.strictEqual(isValidTransition('cut'), true)
assert.strictEqual(isValidTransition('wipe'), false)
assert.strictEqual(isValidTransition(undefined), false)
console.log('PASS: isValidTransition')

// ── validateSceneUpdate ───────────────────────────────────────────────────────
let errs = validateSceneUpdate({ duration_seconds: 5, audio_duration: 3.5 }, { duration_seconds: 4.0 })
assert.strictEqual(errs.length, 1)
assert(/narration-sync buffer/.test(errs[0]), `expected buffer message, got: ${errs[0]}`)
console.log('PASS: validateSceneUpdate rejects below-buffer duration')

errs = validateSceneUpdate({ duration_seconds: 5, audio_duration: 3.5 }, { duration_seconds: 4.3 })
assert.strictEqual(errs.length, 0, 'exact buffer boundary should be valid')
console.log('PASS: validateSceneUpdate accepts duration exactly at the buffer boundary')

errs = validateSceneUpdate({ duration_seconds: 5 }, { duration_seconds: 9 })
assert.strictEqual(errs.length, 1)
assert(/<= 8/.test(errs[0]), `expected max message, got: ${errs[0]}`)
console.log('PASS: validateSceneUpdate rejects duration above 8s max')

errs = validateSceneUpdate({ duration_seconds: 5 }, { duration_seconds: 'oops' })
assert.strictEqual(errs.length, 1)
assert(/must be a number/.test(errs[0]))
console.log('PASS: validateSceneUpdate rejects non-numeric duration')

errs = validateSceneUpdate({ duration_seconds: 0.5 }, { transition_out: 'dip_white' })
assert.strictEqual(errs.length, 1)
assert(/dip transition/.test(errs[0]), `expected dip message, got: ${errs[0]}`)
console.log('PASS: validateSceneUpdate rejects dip transition on too-short existing scene')

errs = validateSceneUpdate({ duration_seconds: 5 }, { duration_seconds: 0.5, transition_out: 'dip_white' })
assert.strictEqual(errs.length, 2, 'both the buffer violation and the dip violation should be reported')
console.log('PASS: validateSceneUpdate reports both duration and dip errors when both are violated')

errs = validateSceneUpdate({ duration_seconds: 2 }, { transition_out: 'dip_white' })
assert.strictEqual(errs.length, 0)
console.log('PASS: validateSceneUpdate accepts dip transition on long-enough scene')

errs = validateSceneUpdate({ duration_seconds: 5 }, { transition_out: 'wipe' })
assert.strictEqual(errs.length, 1)
assert(/must be one of/.test(errs[0]))
console.log('PASS: validateSceneUpdate rejects unknown transition type')

errs = validateSceneUpdate({ duration_seconds: 5 }, { audio_mix_override: { narration: 1.2 } })
assert.strictEqual(errs.length, 1)
assert(/audio_mix_override\.narration/.test(errs[0]))
console.log('PASS: validateSceneUpdate rejects out-of-range audio_mix_override value')

errs = validateSceneUpdate({ duration_seconds: 5 }, { audio_mix_override: { narration: 1.0, music: 0.12, ambient: 0.06 } })
assert.strictEqual(errs.length, 0)
console.log('PASS: validateSceneUpdate accepts a valid audio_mix_override')

errs = validateSceneUpdate({ duration_seconds: 5 }, { audio_mix_override: null })
assert.strictEqual(errs.length, 0, 'null audio_mix_override (revert) should always be valid')
console.log('PASS: validateSceneUpdate accepts audio_mix_override: null (revert)')

// ── FT-2: getTransition / sceneDur / calculateDocumentaryDuration ────────────
// Constants must match remotion/src/compositions/Documentary.jsx exactly.
assert.strictEqual(CUT_FRAMES, 1)
assert.strictEqual(DIP_MID, 10) // DIP_FADE(9) + 1
console.log('PASS: FT-2 constants match Documentary.jsx')

assert.deepStrictEqual(getTransition({ transition_out: 'dissolve' }, 150), { type: 'dissolve', frames: TRANSITION_FRAMES })
assert.deepStrictEqual(getTransition({ transition_out: 'cut' }, 150), { type: 'cut', frames: CUT_FRAMES })
assert.deepStrictEqual(getTransition({ transition_out: 'dip_black' }, 150), { type: 'dip_black', frames: DIP_FADE })
// Too-short scene silently downgrades a dip to dissolve at render time — mirrors Documentary.jsx.
assert.deepStrictEqual(getTransition({ transition_out: 'dip_black' }, 10), { type: 'dissolve', frames: TRANSITION_FRAMES })
// Missing transition_out defaults to dissolve
assert.deepStrictEqual(getTransition({}, 150), { type: 'dissolve', frames: TRANSITION_FRAMES })
console.log('PASS: getTransition matches Documentary.jsx (including dip downgrade + default)')

assert.strictEqual(sceneDur({ duration_seconds: 5 }, 30), 150)
assert.strictEqual(sceneDur({ duration_seconds: 0.1 }, 30), MIN_SCENE_FRAMES) // clamped up to the floor
assert.strictEqual(sceneDur({}, 30), 150) // missing duration_seconds defaults to 5s
console.log('PASS: sceneDur matches Documentary.jsx (default + MIN_SCENE_FRAMES floor)')

// ── calculateDocumentaryDuration recomputes correctly after a reorder ────────
// Three 5s scenes (150 frames each, well above MIN_SCENE_FRAMES and the dip threshold),
// each with a different transition_out so swapping their adjacency actually changes the
// (n-1)-boundary deduction — proving the total duration depends on array order, not just
// scene content, exactly as FT-2 requires after a drag reorder.
const sceneA = { scene_id: 'A', duration_seconds: 5, transition_out: 'dissolve' } // -12 frames as a boundary
const sceneB = { scene_id: 'B', duration_seconds: 5, transition_out: 'dip_black' } // -8 net frames as a boundary
const sceneD = { scene_id: 'D', duration_seconds: 5, transition_out: 'cut' } // -1 frame as a boundary

const originalOrder = [sceneA, sceneB, sceneD] // boundaries: A->B (dissolve, -12), B->D (dip, -8); D's own transition unused (last scene)
const originalTotal = calculateDocumentaryDuration(originalOrder, 30)
assert.strictEqual(originalTotal, 150 * 3 - (TRANSITION_FRAMES + (DIP_FADE + DIP_FADE - DIP_MID)))
assert.strictEqual(originalTotal, 430)
console.log(`PASS: calculateDocumentaryDuration on original order = ${originalTotal} frames`)

const reorderedOrder = [sceneB, sceneD, sceneA] // boundaries: B->D (dip, -8), D->A (cut, -1); A's own transition now unused (last scene)
const reorderedTotal = calculateDocumentaryDuration(reorderedOrder, 30)
assert.strictEqual(reorderedTotal, 150 * 3 - ((DIP_FADE + DIP_FADE - DIP_MID) + CUT_FRAMES))
assert.strictEqual(reorderedTotal, 441)
console.log(`PASS: calculateDocumentaryDuration on reordered order = ${reorderedTotal} frames`)

assert.notStrictEqual(originalTotal, reorderedTotal, 'reordering the same scenes must change the frame-overlap deduction')
console.log('PASS: reordering the same three scenes changes total duration (430 -> 441 frames) because adjacency changed')

// Same set, same total scene content — only order differs — confirms this is purely an
// adjacency effect, not a scene-count or scene-content difference.
const idsBefore = new Set(originalOrder.map(s => s.scene_id))
const idsAfter  = new Set(reorderedOrder.map(s => s.scene_id))
assert.deepStrictEqual(idsBefore, idsAfter, 'both orders must contain exactly the same scene_id set')
console.log('PASS: reorder scenario uses the identical scene_id set — duration change is purely from adjacency')

console.log('\nAll frameMath.test.js checks passed.')
