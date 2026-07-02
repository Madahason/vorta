// Plain Node test — no framework wired into this repo yet. Run with:
//   node server/services/frameMath.test.js
const assert = require('assert')
const {
  FPS, DIP_FADE, MIN_SCENE_FRAMES, TRANSITION_FRAMES, MAX_SCENE_SECONDS, NARRATION_BUFFER_SECONDS,
  minDurationSeconds, canUseDipTransition, isValidTransition, validateSceneUpdate,
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

console.log('\nAll frameMath.test.js checks passed.')
