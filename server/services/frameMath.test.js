// Plain Node test — no framework wired into this repo yet. Run with:
//   node server/services/frameMath.test.js
const assert = require('assert')
const {
  FPS, DIP_FADE, DIP_MID, MIN_SCENE_FRAMES, TRANSITION_FRAMES, CUT_FRAMES,
  MAX_SCENE_SECONDS, NARRATION_BUFFER_SECONDS, BOUNDARY_SAFETY_MARGIN_SECONDS,
  ACTION_CUT_BUFFER_SECONDS, PACING_VALUES, VALID_TRANSITIONS, LAYOUT_VALUES,
  CUTAWAY_EDGE_BUFFER_SECONDS,
  minDurationSeconds, maxDurationSeconds, narrationSafeSceneDuration,
  canUseDipTransition, isValidTransition, validateSceneUpdate,
  getTransition, sceneDur, calculateDocumentaryDuration,
  maxBoundaryOffsetSeconds, validateBoundaryUpdate, resolveManualOverlapSeconds,
  resetBrokenBoundaryAdjacency, clampDurationForActionCut, resetActionCutBoundaryOffsets,
  validateCutawayUpdate,
  MONTAGE_MUSIC_LEVEL, DEFAULT_AUDIO_MIX, deriveChapters, resolveChapterMap, montageAudioMixOverride,
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

// Voiceover-cutoff fix: the narration floor beats the 8s style cap. The old assertion here
// (`clampDurationForActionCut(8, 100) === MAX_SCENE_SECONDS`) enshrined the truncation bug:
// capping a 100s narration's scene at 8s cuts 92s of speech. Floor wins now.
result = clampDurationForActionCut(8, 100)
assert.strictEqual(result, 100.8, 'narration floor (audio + 0.8) must beat the 8s style cap — capping would truncate speech')
console.log('PASS: clampDurationForActionCut lets the narration floor beat the 8s cap (voiceover-cutoff fix)')

// The style cap still holds whenever the narration actually fits inside it
result = clampDurationForActionCut(20, 5)
assert.ok(result <= MAX_SCENE_SECONDS, 'short-narration scenes stay within the style cap')
assert.ok(result <= maxDurationSeconds(5), 'result never exceeds the per-scene ceiling')
console.log('PASS: clampDurationForActionCut never exceeds the per-scene ceiling (8s when narration fits)')

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

// ── FT-7: split-screen must not affect duration/frame-overlap math at all ────
// layout/secondary_image_path/secondary_source_scene_id are never read by sceneDur,
// getTransition, computeSceneStartFrames, or calculateDocumentaryDuration — this proves it
// end to end rather than just by inspection, exactly as the task requires.
assert.deepStrictEqual(LAYOUT_VALUES, ['single', 'split_horizontal', 'split_vertical'])
console.log('PASS: LAYOUT_VALUES defined')

const sceneSingle = { scene_id: 'A', duration_seconds: 5, transition_out: 'dissolve', layout: 'single' }
const sceneSplitH  = {
  scene_id: 'A', duration_seconds: 5, transition_out: 'dissolve',
  layout: 'split_horizontal', secondary_image_path: '/projects/x/assets/A_secondary.png', secondary_source_scene_id: 'B',
}
const sceneSplitV = { ...sceneSplitH, layout: 'split_vertical' }
const sceneTail   = { scene_id: 'Z', duration_seconds: 5, transition_out: 'cut' }

const durationSingle    = calculateDocumentaryDuration([sceneSingle, sceneTail], 30)
const durationSplitH    = calculateDocumentaryDuration([sceneSplitH, sceneTail], 30)
const durationSplitV    = calculateDocumentaryDuration([sceneSplitV, sceneTail], 30)
assert.strictEqual(durationSplitH, durationSingle, 'applying a split_horizontal layout must not change calculateDocumentaryDuration at all')
assert.strictEqual(durationSplitV, durationSingle, 'applying a split_vertical layout must not change calculateDocumentaryDuration at all')
console.log('PASS: calculateDocumentaryDuration is byte-for-byte identical before/after applying either split layout')

assert.deepStrictEqual(getTransition(sceneSplitH, 150), getTransition(sceneSingle, 150), 'the transition descriptor itself must be identical regardless of layout')
console.log('PASS: getTransition ignores layout/secondary_image_path entirely — same descriptor either way')

// ── FT-8: cutaway insert ──────────────────────────────────────────────────────
assert.strictEqual(CUTAWAY_EDGE_BUFFER_SECONDS, 0.5)
console.log('PASS: CUTAWAY_EDGE_BUFFER_SECONDS defined')

const cutawayScene = { scene_id: 'A', duration_seconds: 5 } // valid window: [0.5, 4.5]

// Valid range
errs = validateCutawayUpdate(cutawayScene, { insert_at: 2, duration: 1 })
assert.strictEqual(errs.length, 0, '2s insert_at + 1s duration on a 5s scene must be valid (ends at 3s, well within [0.5, 4.5])')
console.log('PASS: validateCutawayUpdate accepts a valid range')

// Exactly at the edges — must be accepted (0.5 and 4.5 are inclusive boundaries)
errs = validateCutawayUpdate(cutawayScene, { insert_at: 0.5, duration: 4.0 }) // ends at exactly 4.5
assert.strictEqual(errs.length, 0, 'insert_at exactly at the 0.5s floor, ending exactly at the 4.5s ceiling, must be valid')
console.log('PASS: validateCutawayUpdate accepts a range exactly at both edge buffers')

// insert_at too close to scene start
errs = validateCutawayUpdate(cutawayScene, { insert_at: 0.2, duration: 1 })
assert.strictEqual(errs.length, 1)
assert(/at least 0.5s of main visual before/.test(errs[0]), `expected a "before" buffer error, got: ${errs[0]}`)
console.log('PASS: validateCutawayUpdate rejects insert_at too close to the scene start')

// insert_at + duration too close to scene end
errs = validateCutawayUpdate(cutawayScene, { insert_at: 4, duration: 0.8 }) // ends at 4.8, > 4.5 ceiling
assert.strictEqual(errs.length, 1)
assert(/at least 0.5s of main visual after/.test(errs[0]), `expected an "after" buffer error, got: ${errs[0]}`)
console.log('PASS: validateCutawayUpdate rejects a range that runs too close to the scene end')

// insert_at + duration exceeding the scene's total duration entirely
errs = validateCutawayUpdate(cutawayScene, { insert_at: 4, duration: 5 }) // ends at 9s, scene is only 5s
assert.strictEqual(errs.length, 1)
assert(/at least 0.5s of main visual after/.test(errs[0]))
console.log('PASS: validateCutawayUpdate rejects insert_at + duration exceeding scene duration entirely')

// Missing/invalid primitives — rejected outright, not silently defaulted
errs = validateCutawayUpdate(cutawayScene, { insert_at: 2 }) // duration missing
assert.strictEqual(errs.length, 1)
assert(/duration is required/.test(errs[0]))
console.log('PASS: validateCutawayUpdate rejects a missing duration')

errs = validateCutawayUpdate(cutawayScene, { insert_at: -1, duration: 1 })
assert.strictEqual(errs.length, 1)
assert(/insert_at must be a number >= 0/.test(errs[0]))
console.log('PASS: validateCutawayUpdate rejects a negative insert_at')

errs = validateCutawayUpdate(cutawayScene, { insert_at: 2, duration: 0 })
assert.strictEqual(errs.length, 1)
assert(/duration must be a positive number/.test(errs[0]))
console.log('PASS: validateCutawayUpdate rejects a zero/non-positive duration')

// ── Scene duration and frame-overlap math completely unaffected by a cutaway ────
// This is the most important FT-8 test per the task — proves cutaway is purely a render-time
// per-frame image swap with zero effect on any timing function, byte-for-byte, not "probably
// no effect."
const sceneNoCutaway = { scene_id: 'A', duration_seconds: 5, transition_out: 'dissolve' }
const sceneWithCutaway = {
  ...sceneNoCutaway,
  cutaway: { image_path: '/projects/x/assets/A_cutaway.png', insert_at: 2, duration: 1 },
}
const tailScene = { scene_id: 'Z', duration_seconds: 5, transition_out: 'cut' }

const durationNoCutaway   = calculateDocumentaryDuration([sceneNoCutaway, tailScene], 30)
const durationWithCutaway = calculateDocumentaryDuration([sceneWithCutaway, tailScene], 30)
assert.strictEqual(durationWithCutaway, durationNoCutaway, 'adding a cutaway must not change calculateDocumentaryDuration at all')
console.log('PASS: calculateDocumentaryDuration is byte-for-byte identical before/after adding a cutaway')

assert.deepStrictEqual(
  getTransition(sceneWithCutaway, 150), getTransition(sceneNoCutaway, 150),
  'the transition descriptor must be identical regardless of cutaway — cutaway is not read by getTransition at all'
)
console.log('PASS: getTransition ignores the cutaway field entirely — same descriptor either way')

assert.strictEqual(sceneDur(sceneWithCutaway, 30), sceneDur(sceneNoCutaway, 30), 'sceneDur (the scene\'s own frame count) must be identical regardless of cutaway')
console.log('PASS: sceneDur ignores the cutaway field entirely')

// ── FT-9: montage pacing flag (chapter-scoped) ───────────────────────────────
assert.strictEqual(MONTAGE_MUSIC_LEVEL, 0.22)
assert.deepStrictEqual(DEFAULT_AUDIO_MIX, { narration: 1.0, music: 0.12, ambient: 0.06 },
  'DEFAULT_AUDIO_MIX must mirror DEFAULT_MIX in client/src/pages/wizard/FineTuneStep.jsx')
console.log('PASS: FT-9 constants defined (MONTAGE_MUSIC_LEVEL, DEFAULT_AUDIO_MIX mirroring the client)')

// deriveChapters — dip_black is the chapter break (claude.js's own transition definition)
let chMap = deriveChapters([
  { scene_id: '001', transition_out: 'dissolve' },
  { scene_id: '002', transition_out: 'dip_black' }, // ends chapter 1
  { scene_id: '003', transition_out: 'cut' },
  { scene_id: '004', transition_out: 'dip_black' }, // ends chapter 2
  { scene_id: '005', transition_out: 'dissolve' },
])
assert.deepStrictEqual(chMap, { '001': 1, '002': 1, '003': 2, '004': 2, '005': 3 })
console.log('PASS: deriveChapters splits chapters after each dip_black boundary')

chMap = deriveChapters([
  { scene_id: '001', transition_out: 'dissolve' },
  { scene_id: '002', transition_out: 'cut' },
])
assert.deepStrictEqual(chMap, { '001': 1, '002': 1 }, 'no dip_black -> everything is chapter 1')
console.log('PASS: deriveChapters puts everything in chapter 1 when there is no dip_black')

chMap = deriveChapters([
  { scene_id: '001', transition_out: 'dissolve' },
  { scene_id: '002', transition_out: 'dip_black' }, // LAST scene — ends the video, not a chapter
])
assert.deepStrictEqual(chMap, { '001': 1, '002': 1 }, 'a dip_black on the final scene must not open a phantom empty chapter')
console.log('PASS: deriveChapters ignores a dip_black on the final scene (no phantom chapter)')

// resolveChapterMap — persisted chapter wins once every scene has one, else derive
let resolved = resolveChapterMap([
  { scene_id: '001', transition_out: 'cut', chapter: 1 },
  // Persisted chapters say this is still chapter 1 even though a derivation would split
  // here — exactly the case where montage turned a chapter-ending dip_black into a cut.
  { scene_id: '002', transition_out: 'dip_black', chapter: 2 },
  { scene_id: '003', transition_out: 'cut', chapter: 2 },
])
assert.strictEqual(resolved.derived, false)
assert.deepStrictEqual(resolved.map, { '001': 1, '002': 2, '003': 2 })
console.log('PASS: resolveChapterMap uses persisted scene.chapter when every scene has one')

resolved = resolveChapterMap([
  { scene_id: '001', transition_out: 'dip_black', chapter: 1 },
  { scene_id: '002', transition_out: 'cut' }, // no chapter — partial data, must fall back
])
assert.strictEqual(resolved.derived, true)
assert.deepStrictEqual(resolved.map, { '001': 1, '002': 2 })
console.log('PASS: resolveChapterMap falls back to derivation when any scene lacks a chapter (all-or-nothing)')

// montageAudioMixOverride — music-forward bump ONLY when no manual override exists
assert.deepStrictEqual(
  montageAudioMixOverride(null),
  { narration: 1.0, music: 0.22, ambient: 0.06 },
  'no existing override -> music bumped 0.12 -> 0.22, narration/ambient at existing defaults'
)
assert.deepStrictEqual(montageAudioMixOverride(undefined), { narration: 1.0, music: 0.22, ambient: 0.06 })
console.log('PASS: montageAudioMixOverride bumps music toward 0.22 when no manual override exists')

const manualMix = { narration: 0.9, music: 0.5, ambient: 0.0 }
assert.strictEqual(montageAudioMixOverride(manualMix), manualMix,
  'an existing manual override must come back untouched — the exact same object, not a merged copy')
console.log('PASS: montageAudioMixOverride returns an existing manual override exactly as stored, untouched')

// Duration floor under montage clamping — montage reuses clampDurationForActionCut, so the
// FT-1 hard floor (audio_duration + 0.8s) holds by the exact same math FT-5 already proved.
assert.strictEqual(clampDurationForActionCut(5, 1.0), 1.8, 'montage clamp (same function as FT-5) must respect the audio_duration + 0.8s floor')
assert.strictEqual(clampDurationForActionCut(1.8, 1.0), 1.8, 'a duration already at the floor is unchanged under montage clamping')
console.log('PASS: duration floor respected under montage clamping — same clamp function and floor as FT-5')

// ── Voiceover cutoff fix: scene durations must always fit their narration ──────
// Root cause record (see PLAN.md session entry): sync-timings hard-capped
// duration_seconds at 8.0s while narrations ran up to 14.2s — Documentary force-fades
// narration to zero at the scene window's end, cutting speech mid-sentence on 30/65
// scenes of the newest real project. The fix: the narration floor beats the style cap
// everywhere a duration is computed or validated.

assert.strictEqual(maxDurationSeconds(3.5), 8, 'short narration → per-scene max is the 8s style cap, unchanged')
assert.strictEqual(maxDurationSeconds(undefined), 8, 'no narration → 8s cap, unchanged')
assert.strictEqual(maxDurationSeconds(7.2), 8, 'audio 7.2 → floor exactly 8 → cap unchanged')
assert.strictEqual(maxDurationSeconds(10.03), 10.83, 'long narration → ceiling is the narration floor, not 8')
console.log('PASS: maxDurationSeconds — 8s style cap yields to the narration floor only when narration is longer')

assert.strictEqual(narrationSafeSceneDuration(5), 6.2, 'audio 5 → audio + 0.4 crossfade + 0.8 buffer')
assert.strictEqual(narrationSafeSceneDuration(6.8), 8, 'audio 6.8 → ideal exactly 8, at the cap')
assert.strictEqual(narrationSafeSceneDuration(7.0), 8, 'audio 7.0 → ideal 8.2 capped to 8 (floor 7.8 still fits)')
assert.strictEqual(narrationSafeSceneDuration(7.5), 8.3, 'audio 7.5 → cap would violate the floor → floor + nothing extra')
assert.strictEqual(narrationSafeSceneDuration(13.74), 14.54, 'audio 13.74 (real scene 010) → 14.54, never 8')
console.log('PASS: narrationSafeSceneDuration — never below the narration floor, capped at 8 only when narration fits')

// THE invariant (task's automated-test requirement): for every possible narration length,
// the rendered narration window — sceneDur minus the worst-case incoming transition delay
// (dissolve, 12 frames), exactly Documentary.jsx's math — must fit the full audio.
{
  const audios = [0.3, 8.202449, 10.030204, 13.740408, 14.21]
  for (let a = 0.5; a <= 15; a += 0.07) audios.push(+a.toFixed(4))
  let checked = 0
  for (const audio of audios) {
    const d = narrationSafeSceneDuration(audio)
    const windowFrames = sceneDur({ duration_seconds: d }, 30) - TRANSITION_FRAMES
    const audioFrames = Math.round(audio * 30)
    assert.ok(windowFrames >= audioFrames,
      `audio ${audio}s → duration ${d}s → window ${windowFrames}fr must fit audio ${audioFrames}fr`)
    // And the produced duration must be legal under FT-1 validation (floor AND ceiling) —
    // pre-fix, audio > 7.2s produced scenes that were impossible to edit or revert.
    const errs = validateSceneUpdate({ audio_duration: audio, duration_seconds: d }, { duration_seconds: d })
    assert.strictEqual(errs.length, 0, `synced duration for audio ${audio}s must validate cleanly, got: ${errs[0]}`)
    checked++
  }
  console.log(`PASS: narration window >= audio_duration for every synced scene duration (${checked} audio lengths, incl. real capped scenes)`)
}

// Long-narration scenes survive an action cut / montage without re-truncation
{
  const d = narrationSafeSceneDuration(13.74) // 14.54
  const clamped = clampDurationForActionCut(d, 13.74)
  assert.strictEqual(clamped, 14.54, 'action cut on a long-narration scene keeps the narration floor, never re-caps to 8')
  console.log('PASS: action cut / montage clamp preserves long narrations (no re-truncation to 8s)')
}

// validateSceneUpdate: long-narration scenes are now editable; normal scenes unchanged
{
  const longScene = { audio_duration: 10.03, duration_seconds: 10.83 }
  assert.strictEqual(validateSceneUpdate(longScene, { duration_seconds: 10.83 }).length, 0, 'duration at the narration floor accepted even though > 8')
  assert.ok(validateSceneUpdate(longScene, { duration_seconds: 11.5 }).length > 0, 'still rejects beyond the per-scene ceiling')
  const normalScene = { audio_duration: 3.5, duration_seconds: 5 }
  assert.ok(validateSceneUpdate(normalScene, { duration_seconds: 8.5 }).length > 0, 'normal scenes still rejected above 8s — style cap unchanged')
  console.log('PASS: validateSceneUpdate — long-narration scenes editable up to their floor; 8s cap unchanged otherwise')
}

console.log('\nAll frameMath.test.js checks passed.')
