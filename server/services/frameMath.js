// Pure scene-timing/validation math for the Fine-Tune stage.
//
// The transition/frame constants here mirror remotion/src/compositions/Documentary.jsx
// (TRANSITION_FRAMES, DIP_FRAMES, DIP_FADE, MIN_SCENE_FRAMES). Documentary.jsx cannot be
// required directly from the server — it's an ESM/JSX file in a separate Node project with
// Remotion-only dependencies — so this module duplicates the pure constants intentionally.
// Keep both in sync if transition timing changes.
//
// The narration-sync buffer (0.8s) and max scene duration (8s) mirror
// server/routes/voiceover.js (END_BUFFER, MAX_SCENE_SECONDS).

const FPS               = 30
const TRANSITION_FRAMES = 12
const CUT_FRAMES        = 1
const DIP_FRAMES        = 18
const DIP_FADE          = Math.round(DIP_FRAMES / 2) // 9
const DIP_MID           = DIP_FADE + 1                // 10
const MIN_SCENE_FRAMES  = TRANSITION_FRAMES + 1       // 13

const MAX_SCENE_SECONDS        = 8.0
const NARRATION_BUFFER_SECONDS = 0.8

const VALID_TRANSITIONS = ['dissolve', 'dip_black', 'dip_white', 'cut', 'match']
const PACING_VALUES     = ['standard', 'action', 'montage']
const LAYOUT_VALUES     = ['single', 'split_horizontal', 'split_vertical']

function isValidLayout(layout) {
  return LAYOUT_VALUES.includes(layout)
}

function minDurationSeconds(audioDuration) {
  const buffer = Number(audioDuration) > 0 ? Number(audioDuration) : 0
  return parseFloat((buffer + NARRATION_BUFFER_SECONDS).toFixed(2))
}

// Mirrors Documentary.jsx's getTransition() downgrade check: a dip transition needs at
// least DIP_FADE frames on each side (DIP_FADE * 2 total) or it silently falls back to
// dissolve at render time. Fine-Tune blocks the change up front instead of allowing that
// silent downgrade to reach persisted scene data.
function canUseDipTransition(durationSeconds, fps = FPS) {
  const frames = Math.round((durationSeconds || 0) * fps)
  return frames >= DIP_FADE * 2
}

function isValidTransition(type) {
  return VALID_TRANSITIONS.includes(type)
}

// Validates a proposed partial update against the scene's current persisted state.
// Returns an array of error strings — empty array means valid.
function validateSceneUpdate(existingScene, updates) {
  const errors = []
  const effectiveDuration = updates.duration_seconds !== undefined
    ? updates.duration_seconds
    : existingScene.duration_seconds

  if (updates.duration_seconds !== undefined) {
    if (typeof updates.duration_seconds !== 'number' || !isFinite(updates.duration_seconds)) {
      errors.push('duration_seconds must be a number')
    } else {
      const min = minDurationSeconds(existingScene.audio_duration)
      if (updates.duration_seconds < min) {
        errors.push(
          `duration_seconds must be >= ${min}s to preserve the narration-sync buffer ` +
          `(audio_duration ${Number(existingScene.audio_duration || 0).toFixed(2)}s + ${NARRATION_BUFFER_SECONDS}s)`
        )
      } else if (updates.duration_seconds > MAX_SCENE_SECONDS) {
        errors.push(`duration_seconds must be <= ${MAX_SCENE_SECONDS}s`)
      }
    }
  }

  if (updates.transition_out !== undefined) {
    if (!isValidTransition(updates.transition_out)) {
      errors.push(`transition_out must be one of ${VALID_TRANSITIONS.join(', ')}`)
    } else if (
      (updates.transition_out === 'dip_black' || updates.transition_out === 'dip_white') &&
      !canUseDipTransition(effectiveDuration)
    ) {
      errors.push(
        `Scene duration (${effectiveDuration}s) is too short for a dip transition — ` +
        `needs at least ${(DIP_FADE * 2 / FPS).toFixed(2)}s`
      )
    }
  }

  if (updates.audio_mix_override !== undefined && updates.audio_mix_override !== null) {
    const mix = updates.audio_mix_override
    if (typeof mix !== 'object' || Array.isArray(mix)) {
      errors.push('audio_mix_override must be an object or null')
    } else {
      for (const key of ['narration', 'music', 'ambient']) {
        if (mix[key] !== undefined && (typeof mix[key] !== 'number' || mix[key] < 0 || mix[key] > 1)) {
          errors.push(`audio_mix_override.${key} must be a number between 0 and 1`)
        }
      }
    }
  }

  // FT-5: only used by the "revert to generated" path (which restores pacing alongside
  // transition_out/duration_seconds through this same endpoint) — the bulk apply operation
  // itself goes through PATCH /api/scenes/pacing, not here.
  if (updates.pacing !== undefined && !PACING_VALUES.includes(updates.pacing)) {
    errors.push(`pacing must be one of ${PACING_VALUES.join(', ')}`)
  }

  return errors
}

// ── FT-2: duration / frame-overlap math ─────────────────────────────────────
// These three mirror getTransition(), sceneDur(), and calculateDocumentaryDuration()
// in remotion/src/compositions/Documentary.jsx line-for-line, for the same reason the
// constants above are duplicated: that file cannot be required from the server. Used to
// verify that reordering scenes correctly changes the (n-1)-boundary frame-overlap
// deduction, since adjacency (and therefore which transitions sit between which scenes)
// depends on array order.

function getTransition(scene, sceneDurationFrames) {
  let type = scene?.transition_out || 'dissolve'

  if ((type === 'dip_black' || type === 'dip_white') &&
      sceneDurationFrames !== undefined &&
      sceneDurationFrames < DIP_FADE * 2) {
    type = 'dissolve'
  }

  switch (type) {
    case 'cut':
    // FT-6: match cut renders via the exact same 'cut' code path — semantic/suggested
    // only, no new transition math. Mirrors Documentary.jsx's getTransition() exactly.
    case 'match':
      return { type: 'cut', frames: CUT_FRAMES }
    case 'dip_black':
      return { type: 'dip_black', frames: DIP_FADE }
    case 'dip_white':
      return { type: 'dip_white', frames: DIP_FADE }
    case 'dissolve':
    default:
      return { type: 'dissolve', frames: TRANSITION_FRAMES }
  }
}

function sceneDur(scene, fps = FPS) {
  return Math.max(Math.round((scene.duration_seconds || 5) * fps), MIN_SCENE_FRAMES)
}

function calculateDocumentaryDuration(scenes, fps = FPS) {
  if (!scenes?.length) return 30
  const base = scenes.reduce((sum, s) => sum + sceneDur(s, fps), 0)
  let deduction = 0
  for (let i = 0; i < scenes.length - 1; i++) {
    const dur = sceneDur(scenes[i], fps)
    const t   = getTransition(scenes[i], dur)
    deduction += (t.type === 'dip_black' || t.type === 'dip_white')
      ? DIP_FADE + DIP_FADE - DIP_MID
      : t.frames
  }
  return Math.max(base - deduction, 30)
}

// ── FT-4: manual J-cut/L-cut boundary offset ────────────────────────────────
// The manual override lives on the OUTGOING (earlier) scene of a boundary pair:
//   l_cut — this scene's OWN audio bleeding forward into the next scene — is this scene's
//           own outgoing boundary, so the override is read from `scene` itself.
//   j_cut — the NEXT scene's audio bleeding backward into this scene's tail — is actually
//           the PREVIOUS scene's outgoing boundary (audio_cut/j_cut is set on whichever
//           scene's own narration bleeds), so the override is read from `prevScene`.
// `boundary_partner_scene_id` records which next-scene neighbor the offset was calibrated
// against; if a reorder (FT-2) changes that neighbor, the offset no longer has a meaningful
// pairing and must not apply — see resetBrokenBoundaryAdjacency below and the matching
// defensive check in Documentary.jsx.

const BOUNDARY_SAFETY_MARGIN_SECONDS = 0.2

// Bleeding audio further than either adjacent clip's actual narration length would produce
// silence (or worse). max = shorter of the two adjacent audio_durations, minus a small margin.
function maxBoundaryOffsetSeconds(sceneAudioDuration, nextSceneAudioDuration) {
  const bound = Math.min(Number(sceneAudioDuration) || 0, Number(nextSceneAudioDuration) || 0)
    - BOUNDARY_SAFETY_MARGIN_SECONDS
  return Math.max(0, parseFloat(bound.toFixed(2)))
}

// Validates a PATCH .../boundary update. `scene` is the outgoing scene; `nextScene` is its
// current next-in-array neighbor (null if `scene` is the last scene — no outgoing boundary
// exists to configure). Returns an array of error strings — empty means valid.
function validateBoundaryUpdate(scene, nextScene, updates) {
  const errors = []

  // Revert is always valid — no offset bounds apply, and it doesn't need a next scene either
  // (harmless to revert a boundary that no longer has one).
  if (updates.is_manual_offset === false) return errors

  if (!nextScene) {
    errors.push('This scene has no outgoing boundary — it is the last scene in the project')
    return errors
  }

  const maxOffset = maxBoundaryOffsetSeconds(scene.audio_duration, nextScene.audio_duration)

  for (const field of ['jcut_offset', 'lcut_offset']) {
    if (updates[field] === undefined) continue
    const value = updates[field]
    if (typeof value !== 'number' || !isFinite(value) || value < 0) {
      errors.push(`${field} must be a number >= 0`)
    } else if (value > maxOffset) {
      errors.push(
        `${field} must be <= ${maxOffset}s (limited by the shorter adjacent scene's audio ` +
        `duration minus a ${BOUNDARY_SAFETY_MARGIN_SECONDS}s safety margin)`
      )
    }
  }

  return errors
}

// Mirrors the priority logic in Documentary.jsx's narration-track builder exactly (see the
// comment block there). Returns the manual overlap in seconds, or null if no manual override
// applies (fall back to the automatic calculation).
function resolveManualOverlapSeconds(effectiveCut, scene, prevScene, nextScene) {
  if (effectiveCut === 'l_cut' && scene?.is_manual_offset && scene.boundary_partner_scene_id === nextScene?.scene_id) {
    return Number(scene.lcut_offset) || 0
  }
  if (effectiveCut === 'j_cut' && prevScene?.is_manual_offset && prevScene.boundary_partner_scene_id === scene?.scene_id) {
    return Number(prevScene.jcut_offset) || 0
  }
  return null
}

// After a reorder (FT-2), any manual boundary offset whose partner-scene pairing no longer
// matches the actual next-in-array neighbor is stale and must be reset — the offset was
// calibrated for a specific adjacency that no longer exists. Returns a new array (does not
// mutate the input). Used by POST /api/scenes/reorder.
function resetBrokenBoundaryAdjacency(scenesInNewOrder) {
  return scenesInNewOrder.map((scene, index) => {
    if (!scene.is_manual_offset) return scene
    const actualNext = scenesInNewOrder[index + 1] || null
    if (scene.boundary_partner_scene_id === actualNext?.scene_id) return scene
    console.warn(
      `[scenes] scene ${scene.scene_id}: reorder broke its manual boundary offset's adjacency ` +
      `(was paired with ${scene.boundary_partner_scene_id}, now next to ` +
      `${actualNext?.scene_id ?? 'nothing (last scene)'}) — resetting is_manual_offset to false`
    )
    return { ...scene, is_manual_offset: false }
  })
}

// ── FT-5: action cut pacing preset ──────────────────────────────────────────
// Action cut tightens duration toward a smaller buffer (0.3s) than the standard 0.8s
// narration-sync buffer, but must never go below FT-1's existing hard floor
// (minDurationSeconds — audio_duration + 0.8s). Since 0.3s < 0.8s, the floor mathematically
// always wins whenever the scene already had a legal (FT-1-validated) duration — the
// practical effect is "shrink down to the tightest legal duration," which is exactly the
// tighter pacing this preset is for. The 0.3s number is real in the computation; it's just
// subsumed by the floor in the common case, per the task's explicit requirement that the
// hard floor must never be violated "regardless of action-cut clamping."

const ACTION_CUT_BUFFER_SECONDS = 0.3

function clampDurationForActionCut(currentDurationSeconds, audioDuration) {
  const tightTarget = (Number(audioDuration) > 0 ? Number(audioDuration) : 0) + ACTION_CUT_BUFFER_SECONDS
  const floor       = minDurationSeconds(audioDuration) // FT-1's hard floor — always wins if higher
  const clamped     = Math.min(Number(currentDurationSeconds) || 0, tightTarget)
  return Math.min(Math.max(clamped, floor), MAX_SCENE_SECONDS)
}

// Hard cuts don't bleed audio — any manual FT-4 boundary offset entirely WITHIN the
// action-cut range (both the outgoing scene and its actual next-in-array neighbor are in
// the affected set) is reset rather than silently left in place or silently ignored.
// Boundaries at the EDGE of the range (one side outside it) are left untouched — only the
// scene actually being cut hard had its offset reset. Returns a new array.
function resetActionCutBoundaryOffsets(scenesInOrder, affectedSceneIds) {
  const idSet = new Set(affectedSceneIds.map(String))
  return scenesInOrder.map((scene, index) => {
    if (!scene.is_manual_offset) return scene
    if (!idSet.has(String(scene.scene_id))) return scene
    const next = scenesInOrder[index + 1]
    if (!next || !idSet.has(String(next.scene_id))) return scene
    console.warn(
      `[scenes] scene ${scene.scene_id}: action cut applied a hard 'cut' transition within its ` +
      `range — resetting is_manual_offset to false (hard cuts don't bleed audio)`
    )
    return { ...scene, is_manual_offset: false }
  })
}

module.exports = {
  FPS,
  TRANSITION_FRAMES,
  CUT_FRAMES,
  DIP_FRAMES,
  DIP_FADE,
  DIP_MID,
  MIN_SCENE_FRAMES,
  MAX_SCENE_SECONDS,
  NARRATION_BUFFER_SECONDS,
  BOUNDARY_SAFETY_MARGIN_SECONDS,
  ACTION_CUT_BUFFER_SECONDS,
  VALID_TRANSITIONS,
  PACING_VALUES,
  LAYOUT_VALUES,
  minDurationSeconds,
  canUseDipTransition,
  isValidTransition,
  isValidLayout,
  validateSceneUpdate,
  getTransition,
  sceneDur,
  calculateDocumentaryDuration,
  maxBoundaryOffsetSeconds,
  validateBoundaryUpdate,
  resolveManualOverlapSeconds,
  resetBrokenBoundaryAdjacency,
  clampDurationForActionCut,
  resetActionCutBoundaryOffsets,
}
