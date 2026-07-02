// Plain Node test — no framework wired into this repo yet. Run with:
//   node server/services/frameMath.test.js
const assert = require('assert')
const {
  FPS, DIP_FADE, DIP_MID, MIN_SCENE_FRAMES, TRANSITION_FRAMES, CUT_FRAMES,
  MAX_SCENE_SECONDS, NARRATION_BUFFER_SECONDS, BOUNDARY_SAFETY_MARGIN_SECONDS,
  ACTION_CUT_BUFFER_SECONDS, PACING_VALUES, VALID_TRANSITIONS,
  minDurationSeconds, canUseDipTransition, isValidTransition, validateSceneUpdate,
  getTransition, sceneDur, calculateDocumentaryDuration,
  maxBoundaryOffsetSeconds, validateBoundaryUpdate, resolveManualOverlapSeconds,
  resetBrokenBoundaryAdjacency, clampDurationForActionCut, resetActionCutBoundaryOffsets,
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

// ── FT-4: manual J-cut/L-cut boundary offset ─────────────────────────────────
assert.strictEqual(BOUNDARY_SAFETY_MARGIN_SECONDS, 0.2)
console.log('PASS: FT-4 constants defined')

// maxBoundaryOffsetSeconds
assert.strictEqual(maxBoundaryOffsetSeconds(3, 5), 2.8)   // min(3,5) - 0.2
assert.strictEqual(maxBoundaryOffsetSeconds(5, 3), 2.8)   // symmetric — shorter side wins
assert.strictEqual(maxBoundaryOffsetSeconds(0.1, 5), 0)   // would go negative — floored at 0
assert.strictEqual(maxBoundaryOffsetSeconds(undefined, 5), 0) // missing audio_duration treated as 0
console.log('PASS: maxBoundaryOffsetSeconds bounds to the shorter adjacent audio_duration minus the safety margin')

// validateBoundaryUpdate
const outgoing = { scene_id: 'A', audio_duration: 3 }
const next     = { scene_id: 'B', audio_duration: 5 }

errs = validateBoundaryUpdate(outgoing, next, { lcut_offset: 2.8 })
assert.strictEqual(errs.length, 0, 'exact boundary max should be valid')
console.log('PASS: validateBoundaryUpdate accepts an offset exactly at the clamp boundary')

errs = validateBoundaryUpdate(outgoing, next, { lcut_offset: 2.81 })
assert.strictEqual(errs.length, 1)
assert(/lcut_offset must be <= 2.8s/.test(errs[0]), `expected clamp message, got: ${errs[0]}`)
console.log('PASS: validateBoundaryUpdate rejects an offset exceeding the clamp')

errs = validateBoundaryUpdate(outgoing, next, { jcut_offset: -1 })
assert.strictEqual(errs.length, 1)
assert(/must be a number >= 0/.test(errs[0]))
console.log('PASS: validateBoundaryUpdate rejects a negative offset')

errs = validateBoundaryUpdate(outgoing, next, { jcut_offset: 0 })
assert.strictEqual(errs.length, 0, '0.0 must be an accepted, intentional "no bleed" value')
console.log('PASS: validateBoundaryUpdate accepts 0.0 as a valid intentional offset')

errs = validateBoundaryUpdate(outgoing, null, { lcut_offset: 1 })
assert.strictEqual(errs.length, 1)
assert(/last scene/.test(errs[0]))
console.log('PASS: validateBoundaryUpdate rejects an offset on a scene with no outgoing boundary (last scene)')

errs = validateBoundaryUpdate(outgoing, null, { is_manual_offset: false })
assert.strictEqual(errs.length, 0, 'revert must always be valid, even with no next scene')
console.log('PASS: validateBoundaryUpdate always accepts is_manual_offset: false (revert)')

errs = validateBoundaryUpdate(outgoing, next, { jcut_offset: 1, lcut_offset: 10 })
assert.strictEqual(errs.length, 1, 'only the violating field should error')
assert(/lcut_offset/.test(errs[0]))
console.log('PASS: validateBoundaryUpdate reports only the field that actually violates the clamp')

// resolveManualOverlapSeconds — mirrors Documentary.jsx's priority logic exactly
const sceneA_manual = { scene_id: 'A', is_manual_offset: true, boundary_partner_scene_id: 'B', lcut_offset: 1.5 }
const sceneB_plain  = { scene_id: 'B' }
assert.strictEqual(resolveManualOverlapSeconds('l_cut', sceneA_manual, null, sceneB_plain), 1.5)
console.log('PASS: resolveManualOverlapSeconds reads l_cut manual value from the scene itself')

// sceneA_manual is in manual mode (paired with B) but only set lcut_offset, not jcut_offset.
// Once a boundary is manual, an unset field defaults to 0 (an explicit "no bleed"), not to
// the automatic calculation — so this must return 0, not null, and must NOT read lcut_offset.
assert.strictEqual(resolveManualOverlapSeconds('j_cut', sceneB_plain, sceneA_manual, null), 0,
  'j_cut manual value must come from prevScene\'s jcut_offset (unset -> 0), never from lcut_offset')
console.log('PASS: resolveManualOverlapSeconds does not conflate jcut_offset and lcut_offset (unset field under manual mode defaults to 0, not automatic)')

const sceneA_jmanual = { scene_id: 'A', is_manual_offset: true, boundary_partner_scene_id: 'B', jcut_offset: 0.6 }
assert.strictEqual(resolveManualOverlapSeconds('j_cut', sceneB_plain, sceneA_jmanual, null), 0.6)
console.log('PASS: resolveManualOverlapSeconds reads j_cut manual value from prevScene (the outgoing scene of that boundary)')

// Adjacency broken — boundary_partner_scene_id no longer matches the actual next scene
const sceneC = { scene_id: 'C' }
assert.strictEqual(resolveManualOverlapSeconds('l_cut', sceneA_manual, null, sceneC), null,
  'manual value must not apply once the paired next scene no longer matches')
console.log('PASS: resolveManualOverlapSeconds falls back to automatic when adjacency is broken')

assert.strictEqual(resolveManualOverlapSeconds('hard', sceneA_manual, null, sceneB_plain), null)
console.log('PASS: resolveManualOverlapSeconds returns null for hard cuts regardless of manual flags')

// resetBrokenBoundaryAdjacency
const scenesWithIntactAdjacency = [
  { scene_id: 'A', is_manual_offset: true, boundary_partner_scene_id: 'B' },
  { scene_id: 'B' },
]
const stillIntact = resetBrokenBoundaryAdjacency(scenesWithIntactAdjacency)
assert.strictEqual(stillIntact[0].is_manual_offset, true, 'adjacency still matches — must not reset')
console.log('PASS: resetBrokenBoundaryAdjacency leaves an intact adjacency untouched')

const scenesWithBrokenAdjacency = [
  { scene_id: 'A', is_manual_offset: true, boundary_partner_scene_id: 'B' },
  { scene_id: 'C' }, // reorder inserted C between A and B
  { scene_id: 'B' },
]
const afterReset = resetBrokenBoundaryAdjacency(scenesWithBrokenAdjacency)
assert.strictEqual(afterReset[0].is_manual_offset, false, 'A\'s manual offset must reset — B is no longer immediately next')
console.log('PASS: resetBrokenBoundaryAdjacency resets is_manual_offset when a reorder breaks the pairing')

const scenesWithNowLastScene = [
  { scene_id: 'X' },
  { scene_id: 'A', is_manual_offset: true, boundary_partner_scene_id: 'B' }, // A is now the LAST scene — no outgoing boundary at all
]
const afterReset2 = resetBrokenBoundaryAdjacency(scenesWithNowLastScene)
assert.strictEqual(afterReset2[1].is_manual_offset, false, 'A has no next scene at all now — must reset')
console.log('PASS: resetBrokenBoundaryAdjacency resets when the scene became the last scene (no outgoing boundary at all)')

const scenesWithNoManualOffsets = [{ scene_id: 'A' }, { scene_id: 'B' }]
const unchanged = resetBrokenBoundaryAdjacency(scenesWithNoManualOffsets)
assert.deepStrictEqual(unchanged, scenesWithNoManualOffsets, 'scenes with no manual offset are untouched')
console.log('PASS: resetBrokenBoundaryAdjacency is a no-op when nothing is manually overridden')

// ── FT-5: action cut pacing preset ───────────────────────────────────────────
assert.strictEqual(ACTION_CUT_BUFFER_SECONDS, 0.3)
assert.deepStrictEqual(PACING_VALUES, ['standard', 'action', 'montage'])
console.log('PASS: FT-5 constants defined')

// clampDurationForActionCut — the hard floor from FT-1 (audio_duration + 0.8s) must always
// win over the tighter 0.3s action-cut target, per the task's explicit requirement.
// Scene with a generous duration (5s) and short narration (1s): floor = 1.8s, target = 1.3s.
// Floor must win — result must be 1.8s, never 1.3s.
let result = clampDurationForActionCut(5, 1.0)
assert.strictEqual(result, 1.8, `expected the FT-1 hard floor (1.8s) to win over the tighter 0.3s target, got ${result}`)
console.log('PASS: clampDurationForActionCut never goes below the FT-1 hard floor, even though it computes a tighter 0.3s target internally')

// Scene whose duration was already exactly at the floor — must stay there, not shrink further
result = clampDurationForActionCut(1.8, 1.0)
assert.strictEqual(result, 1.8)
console.log('PASS: clampDurationForActionCut leaves a duration already at the floor unchanged')

// Scene with no narration yet (audio_duration missing) — floor is still 0.8s (buffer alone)
result = clampDurationForActionCut(5, undefined)
assert.strictEqual(result, 0.8)
console.log('PASS: clampDurationForActionCut treats a missing audio_duration as 0 for the floor calculation (0.8s buffer alone)')

// Never increases duration, even if current is somehow already below the target
result = clampDurationForActionCut(1.0, 5.0) // current (1.0) is below floor(5.8) - shouldn't happen per FT-1 invariants, but must not blow up or increase past a sane bound
assert.strictEqual(result, 5.8, 'floor still wins even on an already-invalid low current duration')
console.log('PASS: clampDurationForActionCut is dominated by the floor even on an atypical low current duration')

// Never exceeds MAX_SCENE_SECONDS (defensive — action cut always shrinks, but still)
result = clampDurationForActionCut(8, 100)
assert.strictEqual(result, MAX_SCENE_SECONDS)
console.log('PASS: clampDurationForActionCut never exceeds MAX_SCENE_SECONDS')

// resetActionCutBoundaryOffsets
const rangeIntact = [
  { scene_id: 'A', is_manual_offset: true, boundary_partner_scene_id: 'B' },
  { scene_id: 'B' },
  { scene_id: 'C' },
]
// A->B boundary is fully inside the affected range [A, B] — must reset
let afterActionCut = resetActionCutBoundaryOffsets(rangeIntact, ['A', 'B'])
assert.strictEqual(afterActionCut[0].is_manual_offset, false, 'A->B boundary is entirely within the action-cut range — must reset')
console.log('PASS: resetActionCutBoundaryOffsets resets a manual offset when both sides of its boundary are in the range')

// A->B boundary has A in range but B (the partner) NOT in range — edge of the range, left alone
afterActionCut = resetActionCutBoundaryOffsets(rangeIntact, ['A'])
assert.strictEqual(afterActionCut[0].is_manual_offset, true, 'only A is in range — B (its boundary partner) is not — must NOT reset (edge of range, not fully inside it)')
console.log('PASS: resetActionCutBoundaryOffsets leaves a boundary untouched when only one side is in the range (edge of the range)')

const rangeNoManual = [{ scene_id: 'A' }, { scene_id: 'B' }]
assert.deepStrictEqual(resetActionCutBoundaryOffsets(rangeNoManual, ['A', 'B']), rangeNoManual, 'no-op when nothing is manually overridden')
console.log('PASS: resetActionCutBoundaryOffsets is a no-op when nothing is manually overridden')

// ── FT-6: match cut renders via the exact same code path as 'cut' ────────────
assert.deepStrictEqual(VALID_TRANSITIONS, ['dissolve', 'dip_black', 'dip_white', 'cut', 'match'])
console.log('PASS: VALID_TRANSITIONS includes "match"')

assert.deepStrictEqual(
  getTransition({ transition_out: 'match' }, 150),
  getTransition({ transition_out: 'cut' }, 150),
  'match must produce the exact same descriptor as cut — no new transition math'
)
console.log('PASS: getTransition("match") produces an identical descriptor to getTransition("cut") — same code path, not new math')

assert.deepStrictEqual(getTransition({ transition_out: 'match' }, 150), { type: 'cut', frames: CUT_FRAMES })
console.log('PASS: getTransition("match") normalizes to type: "cut" so every downstream consumer checking outT.type === "cut" handles it with zero new code')

// calculateDocumentaryDuration must deduct the same amount for 'match' as for 'cut'
const sceneMatch = { scene_id: 'M', duration_seconds: 5, transition_out: 'match' }
const sceneCut    = { scene_id: 'X', duration_seconds: 5, transition_out: 'cut' }
const sceneEnd    = { scene_id: 'E', duration_seconds: 5, transition_out: 'dissolve' }
const durationWithMatch = calculateDocumentaryDuration([sceneMatch, sceneEnd], 30)
const durationWithCut   = calculateDocumentaryDuration([sceneCut, sceneEnd], 30)
assert.strictEqual(durationWithMatch, durationWithCut, 'a match-cut boundary must deduct exactly the same frames as a cut boundary')
console.log('PASS: calculateDocumentaryDuration treats a match-cut boundary identically to a cut boundary')

// validateSceneUpdate accepts 'match' as a transition_out value (needed so the client can
// PATCH transition_out: "match" when accepting a suggestion, or select it manually)
errs = validateSceneUpdate({ duration_seconds: 5 }, { transition_out: 'match' })
assert.strictEqual(errs.length, 0, 'match must be accepted as a valid transition_out value')
console.log('PASS: validateSceneUpdate accepts transition_out: "match"')

console.log('\nAll frameMath.test.js checks passed.')
