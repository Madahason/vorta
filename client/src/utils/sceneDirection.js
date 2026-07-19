// DD-4: shared constants + pure helpers for the Scene Inspector (Direction tab, locking,
// scene actions). Mirrors the enums defined server-side in services/claude.js so badges and
// dropdowns stay in sync with what analysis can actually produce.

export const SCENE_TYPES = [
  'cinematic_establishing', 'character_introduction', 'cinematic_reconstruction',
  'archival_footage', 'archival_photograph', 'headline_sequence',
  'primary_document', 'map_animation', 'timeline', 'data_visualisation',
  'process_diagram', 'comparison_graphic', 'environmental_broll',
  'kinetic_typography', 'symbolic_image', 'reveal_payoff', 'pattern_interrupt',
  'transitional', 'breathing_scene', 'closing_image',
]

const MOTION_GRAPHIC_SCENE_TYPES = new Set([
  'data_visualisation', 'timeline', 'map_animation', 'process_diagram',
  'comparison_graphic', 'kinetic_typography',
])

// Mirrors server/services/claude.js sceneTypeToShotType — used so changing the Direction
// tab's scene_type dropdown updates the card's shot_type badge immediately, client-side,
// without a round trip.
export function sceneTypeToShotType(sceneType) {
  if (!SCENE_TYPES.includes(sceneType)) return null
  if (MOTION_GRAPHIC_SCENE_TYPES.has(sceneType)) return 'motion_graphic'
  if (sceneType === 'archival_footage') return 'real_footage'
  return 'image'
}

export const ASSET_METHODS = [
  'ai_image', 'motion_graphic', 'stock_footage', 'archival_footage',
  'primary_document', 'photograph', 'screenshot', 'hybrid',
]

export const RETENTION_VALUES = [
  'curiosity', 'orientation', 'proof', 'escalation', 'contrast', 'surprise',
  'emotional_connection', 'pattern_interrupt', 'explanation', 'payoff',
  'breathing_room', 'transition',
]

// Suggested grouping from the brief, mapped to colour tokens.
const WARM   = { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  text: '#fca5a5' }
const BLUE   = { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', text: '#93c5fd' }
const AMBER  = { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', text: '#fcd34d' }
const MUTED  = { bg: 'rgba(255,255,255,0.06)',border: 'rgba(255,255,255,0.14)', text: 'rgba(255,255,255,0.55)' }

export const RETENTION_COLORS = {
  curiosity: WARM, surprise: WARM, pattern_interrupt: WARM,
  proof: BLUE, explanation: BLUE, orientation: BLUE,
  escalation: AMBER, payoff: AMBER, contrast: AMBER,
  emotional_connection: MUTED, breathing_room: MUTED, transition: MUTED,
}

export const COMPLEXITY_COLORS = {
  simple:   { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)',  text: '#86efac' },
  moderate: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', text: '#fcd34d' },
  advanced: { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  text: '#fca5a5' },
}

export const RISK_FLAGS = [
  'historical_accuracy', 'generation_inconsistency', 'requires_licensed_footage',
  'requires_reliable_data', 'misleading_reconstruction', 'difficult_text_rendering',
  'character_continuity', 'copyright_sensitive', 'high_compositing_complexity',
]

const RISK_FLAG_LABELS = {
  historical_accuracy:          'Historical accuracy risk',
  generation_inconsistency:     'Generation inconsistency risk',
  requires_licensed_footage:    'Requires licensed footage',
  requires_reliable_data:       'Requires reliable data',
  misleading_reconstruction:    'Reconstruction — may read as real footage',
  difficult_text_rendering:     'Difficult text rendering',
  character_continuity:         'Character continuity risk',
  copyright_sensitive:          'Copyright sensitive',
  high_compositing_complexity:  'High compositing complexity',
}

export function humanizeRiskFlag(flag) {
  return RISK_FLAG_LABELS[flag] || flag.replace(/_/g, ' ')
}

export function humanizeLabel(value) {
  return String(value || '').replace(/_/g, ' ')
}

// A scene "has direction data" when DD-3 populated it — the tab bar (and every DD-4
// surface) stays hidden entirely otherwise, so a pre-DD-3 scene renders unchanged.
export function hasDirectionData(scene) {
  return !!(scene?.scene_type || scene?.purpose?.narrative || scene?.asset_strategy?.method)
}

// ─── Scene id stability ──────────────────────────────────────────────────────
// Never renumber existing scenes — audio_path/image_path and Remotion sequence keys are
// tied to scene_id. New ids are always max-numeric-id + 1, zero-padded to 3 digits (falls
// back to 4+ digits only past 999 scenes, which numeric padStart handles natively).
export function nextSceneId(scenes) {
  const max = (scenes || []).reduce((m, s) => {
    const n = parseInt(s.scene_id, 10)
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return String(max + 1).padStart(3, '0')
}

// ─── DD-4 Step 5: version history ────────────────────────────────────────────
// Capped at the last 3 entries; restoring pushes the current value back in so the
// restore itself is reversible. Kept in the scene object (and therefore localStorage) —
// no new backend storage.
const HISTORY_CAP = 3

export function pushFieldHistory(scene, field, previousValue) {
  const history = { ...(scene.field_history || {}) }
  const entries = [...(history[field] || []), { value: previousValue, at: new Date().toISOString() }]
  history[field] = entries.slice(-HISTORY_CAP)
  return history
}

// ─── DD-4 Step 3: locked scenes survive re-analysis ──────────────────────────
// The single most important behaviour in this phase. Fresh analysis produces an entirely
// new scene array; for every scene the user locked, the OLD object is kept wholesale and
// the new one discarded, matched by scene_id. If a locked scene's id doesn't happen to
// reappear in the new array (analysis produced a different scene count), it is spliced
// back in at its original relative position rather than silently dropped — locking must
// never lose a scene, not just leave it unedited.
export function mergeAnalysisPreservingLocks(oldScenes, newScenes) {
  const lockedScenes = (oldScenes || []).filter(s => s.locked)
  if (!lockedScenes.length) return newScenes

  const lockedById = new Map(lockedScenes.map(s => [s.scene_id, s]))
  const merged = newScenes.map(s => lockedById.has(s.scene_id) ? lockedById.get(s.scene_id) : s)

  const mergedIds = new Set(merged.map(s => s.scene_id))
  const missing = lockedScenes.filter(s => !mergedIds.has(s.scene_id))
  missing.forEach(lockedScene => {
    const originalIndex = oldScenes.findIndex(s => s.scene_id === lockedScene.scene_id)
    merged.splice(Math.min(Math.max(originalIndex, 0), merged.length), 0, lockedScene)
  })

  return merged
}

// ─── Step 6: scene actions ────────────────────────────────────────────────────

export function duplicateScene(scenes, sceneId) {
  const idx = scenes.findIndex(s => s.scene_id === sceneId)
  if (idx === -1) return scenes
  const source = scenes[idx]
  const clone = {
    ...source,
    scene_id:       nextSceneId(scenes),
    audio_path:     null,
    audio_duration: null,
    image_path:     null,
    locked:         false,
    field_history:  {},
    asset_found:    false,
  }
  const next = [...scenes]
  next.splice(idx + 1, 0, clone)
  return next
}

// caretIndex is a character offset into script_excerpt. Duration splits proportionally
// by word count on each side (not by character count, since narration timing tracks words).
export function splitScene(scenes, sceneId, caretIndex) {
  const idx = scenes.findIndex(s => s.scene_id === sceneId)
  if (idx === -1) return scenes
  const source = scenes[idx]
  const text = source.script_excerpt || ''
  const clamped = Math.max(1, Math.min(caretIndex, text.length - 1))

  let left  = text.slice(0, clamped).trim()
  let right = text.slice(clamped).trim()
  if (!left || !right) return scenes // refuse a split that produces an empty half

  const leftWords  = left.split(/\s+/).filter(Boolean).length
  const rightWords = right.split(/\s+/).filter(Boolean).length
  const totalWords = leftWords + rightWords || 1
  const totalDuration = source.duration_seconds || 0
  const leftDuration  = parseFloat((totalDuration * (leftWords / totalWords)).toFixed(2))
  const rightDuration = parseFloat((totalDuration - leftDuration).toFixed(2))

  const base = {
    ...source,
    audio_path: null, audio_duration: null, image_path: null,
    locked: false, field_history: {}, asset_found: false,
  }
  const firstId  = source.scene_id
  const secondId = nextSceneId(scenes)

  const sceneA = { ...base, scene_id: firstId,  script_excerpt: left,  duration_seconds: leftDuration }
  const sceneB = { ...base, scene_id: secondId, script_excerpt: right, duration_seconds: rightDuration }

  const next = [...scenes]
  next.splice(idx, 1, sceneA, sceneB)
  return next
}

export function mergeSceneWithNext(scenes, sceneId) {
  const idx = scenes.findIndex(s => s.scene_id === sceneId)
  if (idx === -1 || idx === scenes.length - 1) return scenes
  const a = scenes[idx]
  const b = scenes[idx + 1]
  if (a.locked || b.locked) return scenes

  const merged = {
    ...a, // keeps the first scene's classification fields (act, scene_type, mood, etc.)
    script_excerpt:   `${a.script_excerpt || ''} ${b.script_excerpt || ''}`.trim().replace(/\s+/g, ' '),
    duration_seconds: (a.duration_seconds || 0) + (b.duration_seconds || 0),
    continuity_refs:  [...new Set([...(a.continuity_refs || []), ...(b.continuity_refs || [])])],
    risk_flags:       [...new Set([...(a.risk_flags || []), ...(b.risk_flags || [])])],
    audio_path: null, audio_duration: null, image_path: null,
    field_history: {}, asset_found: false,
  }

  const next = [...scenes]
  next.splice(idx, 2, merged)
  return next
}

export function deleteScene(scenes, sceneId) {
  return scenes.filter(s => s.scene_id !== sceneId)
}
