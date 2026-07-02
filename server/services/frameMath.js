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
const DIP_FRAMES        = 18
const DIP_FADE          = Math.round(DIP_FRAMES / 2) // 9
const MIN_SCENE_FRAMES  = TRANSITION_FRAMES + 1       // 13

const MAX_SCENE_SECONDS        = 8.0
const NARRATION_BUFFER_SECONDS = 0.8

const VALID_TRANSITIONS = ['dissolve', 'dip_black', 'dip_white', 'cut']

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

  return errors
}

module.exports = {
  FPS,
  TRANSITION_FRAMES,
  DIP_FRAMES,
  DIP_FADE,
  MIN_SCENE_FRAMES,
  MAX_SCENE_SECONDS,
  NARRATION_BUFFER_SECONDS,
  VALID_TRANSITIONS,
  minDurationSeconds,
  canUseDipTransition,
  isValidTransition,
  validateSceneUpdate,
}
