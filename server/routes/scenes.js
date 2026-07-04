const express = require('express')
const router  = express.Router()
const path    = require('path')
const fs      = require('fs')
const {
  validateSceneUpdate, validateBoundaryUpdate, resetBrokenBoundaryAdjacency,
  clampDurationForActionCut, resetActionCutBoundaryOffsets, isValidLayout, LAYOUT_VALUES,
  validateCutawayUpdate, resolveChapterMap, montageAudioMixOverride,
  narrationSafeSceneDuration,
} = require('../services/frameMath')
const { PROJECTS_DIR, readScenesFile, writeScenesFile } = require('../services/scenesFile')
const { backupOriginalIfNeeded } = require('../services/imageSwap')
const { backupOriginalVoiceIfNeeded } = require('../services/voiceSwap')
const { preprocessForTTS, validateTTSText } = require('../services/textPreprocessor')
// Required as a module object (not destructured) so tests can monkey-patch generateAudio /
// getAudioDuration — same technique higgsfieldRegenerate.js established for FT-3.
const elevenlabsService = require('../services/elevenlabs')

// PATCH /api/scenes/pacing
// Body: { projectId, scene_ids: [...], pacing: 'action' }
// FT-5 bulk action-cut apply. Must be registered BEFORE PATCH /:sceneId — otherwise Express
// would match "pacing" as a :sceneId value and this route would never be reached (same
// param-collision issue noted in library.js for its /upload vs /:clip_id routes).
// This phase only implements the 'action' preset (montage/standard-via-this-endpoint are
// out of scope — "standard" revert goes through PATCH /:sceneId instead, restoring each
// scene's own Fine-Tune snapshot values).
router.patch('/pacing', (req, res) => {
  const { projectId, scene_ids, pacing } = req.body || {}

  if (!projectId) return res.status(400).json({ error: 'projectId required' })
  if (!Array.isArray(scene_ids) || scene_ids.length === 0) {
    return res.status(400).json({ error: 'scene_ids must be a non-empty array' })
  }
  if (pacing !== 'action') {
    return res.status(400).json({ error: "pacing must be 'action' — this phase only implements the action-cut preset" })
  }

  const file = readScenesFile(projectId)
  if (!file) return res.status(404).json({ error: `No scenes.json found for project ${projectId}` })

  const idSet      = new Set(scene_ids.map(String))
  const currentIds = new Set(file.scenes.map(s => String(s.scene_id)))
  const unknown    = [...idSet].filter(id => !currentIds.has(id))
  if (unknown.length) {
    return res.status(400).json({ error: `Unknown scene_id(s): ${unknown.join(', ')}` })
  }

  let updatedScenes = file.scenes.map(scene => {
    if (!idSet.has(String(scene.scene_id))) return scene
    return {
      ...scene,
      pacing:           'action',
      transition_out:   'cut',
      duration_seconds: clampDurationForActionCut(scene.duration_seconds, scene.audio_duration),
    }
  })

  // Hard cuts don't bleed audio — reset any manual FT-4 boundary offset entirely within
  // this range rather than silently leaving it in place or silently discarding the request.
  updatedScenes = resetActionCutBoundaryOffsets(updatedScenes, [...idSet])

  file.scenes = updatedScenes
  writeScenesFile(file)

  const affected = file.scenes.filter(s => idSet.has(String(s.scene_id)))
  res.json({ scenes: affected })
})

// PATCH /api/scenes/chapter-pacing
// Body: { projectId, chapter, pacing: 'montage', override_non_standard?: boolean }
// FT-9 chapter-scoped montage apply — FT-5's range-apply mechanism at chapter scope instead
// of manual selection. Must be registered BEFORE PATCH /:sceneId (same param-collision issue
// as /pacing above). Only 'montage' is accepted here, mirroring /pacing only accepting
// 'action': reverting to standard goes through PATCH /:sceneId, restoring each scene's own
// Fine-Tune snapshot values (including audio_mix_override).
//
// Chapter membership: persisted scene.chapter when every scene has one; otherwise derived
// from dip_black chapter breaks and BACKFILLED onto all scenes in this same write, so that
// montage's own transition_out: 'cut' (which may erase the dip_black that ended this
// chapter) can never renumber chapters on a later call. See frameMath.resolveChapterMap.
//
// Skip guardrail: a scene whose pacing is already non-standard (an FT-5 per-scene action
// cut, or a previous montage) is an intentional user choice — it is SKIPPED and reported in
// the response's `skipped` array, unless the client sends override_non_standard: true after
// the user explicitly confirms.
router.patch('/chapter-pacing', (req, res) => {
  const { projectId, chapter, pacing, override_non_standard } = req.body || {}

  if (!projectId) return res.status(400).json({ error: 'projectId required' })
  if (pacing !== 'montage') {
    return res.status(400).json({ error: "pacing must be 'montage' — this endpoint only implements the chapter-scoped montage preset (action cut uses PATCH /pacing, revert uses PATCH /:sceneId)" })
  }
  if (!Number.isInteger(chapter) || chapter < 1) {
    return res.status(400).json({ error: 'chapter must be a positive integer' })
  }

  const file = readScenesFile(projectId)
  if (!file) return res.status(404).json({ error: `No scenes.json found for project ${projectId}` })

  const { map: chapterMap, derived } = resolveChapterMap(file.scenes)
  if (derived) {
    // First chapter-scoped operation on a project without persisted chapters — backfill.
    file.scenes = file.scenes.map(s => ({ ...s, chapter: chapterMap[String(s.scene_id)] }))
  }

  const chapterScenes = file.scenes.filter(s => chapterMap[String(s.scene_id)] === chapter)
  if (chapterScenes.length === 0) {
    return res.status(404).json({ error: `Chapter ${chapter} not found in project ${projectId}` })
  }

  const skipped    = []
  const appliedIds = []
  chapterScenes.forEach(s => {
    const scenePacing = s.pacing || 'standard'
    if (scenePacing !== 'standard' && !override_non_standard) {
      skipped.push({ scene_id: String(s.scene_id), pacing: scenePacing })
    } else {
      appliedIds.push(String(s.scene_id))
    }
  })

  const appliedSet = new Set(appliedIds)
  let updatedScenes = file.scenes.map(scene => {
    if (!appliedSet.has(String(scene.scene_id))) return scene
    return {
      ...scene,
      pacing:           'montage',
      transition_out:   'cut',
      // Same clamp as FT-5's action cut — tightens toward the smaller buffer but never
      // below FT-1's hard floor (audio_duration + 0.8s), which always wins mathematically.
      duration_seconds: clampDurationForActionCut(scene.duration_seconds, scene.audio_duration),
      // Music-forward mix ONLY when the user never set a manual override; an existing
      // override comes back from montageAudioMixOverride exactly as stored.
      audio_mix_override: montageAudioMixOverride(scene.audio_mix_override),
    }
  })

  // Montage applies hard cuts, exactly like action cut — reset any manual FT-4 boundary
  // offset entirely within the applied set rather than leaving it pointing at a cut.
  updatedScenes = resetActionCutBoundaryOffsets(updatedScenes, appliedIds)

  file.scenes = updatedScenes
  writeScenesFile(file)

  const affected = file.scenes.filter(s => appliedSet.has(String(s.scene_id)))
  res.json({ scenes: affected, skipped, chapter })
})

// PATCH /api/scenes/:sceneId
// Body: { projectId, duration_seconds?, transition_out?, audio_mix_override?, pacing? }
// audio_mix_override: null clears any existing override (used by "Revert to generated").
// pacing here is only ever used by the FT-5 "revert action cut" path, which restores
// pacing/transition_out/duration_seconds together from the Fine-Tune snapshot in one call —
// the bulk apply operation itself is PATCH /pacing above, not this endpoint.
router.patch('/:sceneId', (req, res) => {
  const { sceneId } = req.params
  const { projectId, duration_seconds, transition_out, audio_mix_override, pacing } = req.body || {}

  if (!projectId) return res.status(400).json({ error: 'projectId required' })

  const updates = {}
  if (duration_seconds   !== undefined) updates.duration_seconds   = duration_seconds
  if (transition_out     !== undefined) updates.transition_out     = transition_out
  if (audio_mix_override !== undefined) updates.audio_mix_override = audio_mix_override
  if (pacing              !== undefined) updates.pacing             = pacing

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided (duration_seconds, transition_out, audio_mix_override, pacing)' })
  }

  const file = readScenesFile(projectId)
  if (!file) return res.status(404).json({ error: `No scenes.json found for project ${projectId}` })

  const idx = file.scenes.findIndex(s => String(s.scene_id) === String(sceneId))
  if (idx === -1) return res.status(404).json({ error: `Scene ${sceneId} not found in project ${projectId}` })

  const existingScene = file.scenes[idx]

  const errors = validateSceneUpdate(existingScene, updates)
  if (errors.length) return res.status(400).json({ error: errors[0], errors })

  const updatedScene = { ...existingScene }
  if (updates.duration_seconds !== undefined) updatedScene.duration_seconds = updates.duration_seconds
  if (updates.transition_out   !== undefined) updatedScene.transition_out   = updates.transition_out
  if (updates.pacing            !== undefined) updatedScene.pacing           = updates.pacing

  if (updates.audio_mix_override !== undefined) {
    if (updates.audio_mix_override === null) {
      delete updatedScene.audio_mix_override
    } else {
      updatedScene.audio_mix_override = {
        ...(existingScene.audio_mix_override || {}),
        ...updates.audio_mix_override,
      }
    }
  }

  file.scenes[idx] = updatedScene
  writeScenesFile(file)

  res.json({ scene: updatedScene })
})

// PATCH /api/scenes/:sceneId/script
// Body: { projectId, script_excerpt }
// Fine-Tune script editing. Validates the new text through the exact same
// preprocess-then-validate gate generateAudio() itself uses (preprocessForTTS →
// validateTTSText), so text accepted here can never fail TTS validation at regeneration
// time. On rejection NOTHING is saved. On success: script_excerpt is updated,
// voice_stale: true marks the narration as out of sync with the text, and the scene's
// pre-edit script is preserved once in original_script_excerpt (backup-once, mirroring
// the scene_{id}_original.mp3 audio backup) so "Revert to generated" can restore the
// state at Fine-Tune entry.
router.patch('/:sceneId/script', (req, res) => {
  const { sceneId } = req.params
  const { projectId, script_excerpt } = req.body || {}

  if (!projectId) return res.status(400).json({ error: 'projectId required' })
  if (typeof script_excerpt !== 'string') {
    return res.status(400).json({ error: 'script_excerpt (string) required' })
  }

  const raw     = script_excerpt.trim()
  const cleaned = preprocessForTTS(raw)
  const { valid, issues } = validateTTSText(cleaned)
  if (!valid) {
    return res.status(400).json({ error: `Script rejected: ${issues.join(', ')}`, issues })
  }

  const file = readScenesFile(projectId)
  if (!file) return res.status(404).json({ error: `No scenes.json found for project ${projectId}` })

  const idx = file.scenes.findIndex(s => String(s.scene_id) === String(sceneId))
  if (idx === -1) return res.status(404).json({ error: `Scene ${sceneId} not found in project ${projectId}` })

  const scene = file.scenes[idx]
  const updatedScene = { ...scene, script_excerpt: raw, voice_stale: true }
  if (updatedScene.original_script_excerpt === undefined) {
    updatedScene.original_script_excerpt = scene.script_excerpt ?? ''
  }

  file.scenes[idx] = updatedScene
  writeScenesFile(file)

  res.json({ scene: updatedScene })
})

// POST /api/scenes/:sceneId/regenerate-voice
// Body: { projectId, voiceId, modelId?, voiceSettings?, useMoodSettings?,
//         usePreprocessing?, normaliseVolume? }
// Regenerates this one scene's narration from its CURRENT stored script_excerpt through
// the exact same pipeline /api/voiceover/generate uses — elevenlabs.generateAudio()
// (preprocess → validate → generateSingleAudio/generateAndConcatenate → addSilencePadding)
// — reused via the service module, never duplicated. The text is always read from the
// project's own scenes.json, never trusted from the request body.
//
// Failure safety (never a broken/partial audio state): generation writes to a TEMP file
// first; only after both generation and duration measurement succeed does the old file get
// backed up (scene_{id}_original.mp3, backup-once) and the temp renamed over the live
// path. Any error → temp deleted, 500 returned, scene untouched on disk (voice_stale stays
// true so the UI keeps showing it needs attention).
//
// Downstream conflict handling: a prior manual FT-1 duration trim or FT-4 boundary offset
// was calibrated against the OLD narration length. duration_seconds is re-synced to the
// fresh audio (narrationSafeSceneDuration — the same formula /api/voiceover/sync-timings
// uses), and is_manual_offset is cleared for THIS scene only. The response reports
// manual_adjustments_reset so the client can surface the warning.
router.post('/:sceneId/regenerate-voice', async (req, res) => {
  const { sceneId } = req.params
  const {
    projectId, voiceId, modelId, voiceSettings,
    useMoodSettings, usePreprocessing, normaliseVolume,
  } = req.body || {}

  if (!projectId) return res.status(400).json({ error: 'projectId required' })
  if (!voiceId)   return res.status(400).json({ error: 'voiceId required' })

  const file = readScenesFile(projectId)
  if (!file) return res.status(404).json({ error: `No scenes.json found for project ${projectId}` })

  const idx = file.scenes.findIndex(s => String(s.scene_id) === String(sceneId))
  if (idx === -1) return res.status(404).json({ error: `Scene ${sceneId} not found in project ${projectId}` })

  const scene = file.scenes[idx]
  const raw   = (scene.script_excerpt || '').trim()

  // Guardrail: validate BEFORE any generation attempt — never send invalid text to
  // ElevenLabs. Same gate as the /script PATCH and generateAudio() itself.
  const cleaned = preprocessForTTS(raw)
  const { valid, issues } = validateTTSText(cleaned)
  if (!valid) {
    return res.status(400).json({ error: `Script is not valid for TTS: ${issues.join(', ')}`, issues })
  }

  const audioDir = path.join(PROJECTS_DIR, projectId, 'audio')
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true })

  // Regeneration overwrites the scene's existing audio location (same filename) so nothing
  // else referencing that URL has to change — FT-3's image-replace precedent.
  const liveFilename = scene.audio_path ? path.basename(scene.audio_path) : `scene_${sceneId}.mp3`
  const liveAbsPath  = path.join(audioDir, liveFilename)
  const tempAbsPath  = path.join(audioDir, `scene_${sceneId}_regen_${Date.now()}.mp3`)

  let audioDuration
  try {
    await elevenlabsService.generateAudio({
      text:             raw,
      voiceId,
      modelId:          modelId || 'eleven_multilingual_v2',
      outputPath:       tempAbsPath,
      voiceSettings:    voiceSettings || {},
      mood:             scene.mood || 'neutral',
      useMoodSettings:  !!useMoodSettings,
      usePreprocessing: !!usePreprocessing,
      normalise:        !!normaliseVolume,
    })
    audioDuration = await elevenlabsService.getAudioDuration(tempAbsPath)
    if (!audioDuration || audioDuration < 0.1) {
      throw new Error('Regenerated audio has no measurable duration — corrupt output')
    }
  } catch (err) {
    try { if (fs.existsSync(tempAbsPath)) fs.unlinkSync(tempAbsPath) } catch { /* best-effort */ }
    console.error(`[regenerate-voice] scene ${sceneId} failed:`, err.message)
    return res.status(500).json({ error: err.message })
  }

  // Success — preserve the true original narration exactly once, then swap the new take in.
  const { backedUp } = backupOriginalVoiceIfNeeded(audioDir, sceneId, scene.audio_path)
  fs.renameSync(tempAbsPath, liveAbsPath)

  // Generation can take a while — re-read scenes.json fresh in case another Fine-Tune edit
  // landed meanwhile (FT-3's higgsfieldRegenerate precedent), and only touch this scene.
  const freshFile = readScenesFile(projectId)
  const freshIdx  = freshFile.scenes.findIndex(s => String(s.scene_id) === String(sceneId))
  const freshScene = freshFile.scenes[freshIdx]

  // Detect pre-existing manual adjustments that the new narration length invalidates:
  // an FT-4 manual boundary offset, or an FT-1 duration that no longer equals the value
  // derived from the OLD audio (i.e. the user had trimmed it away from the synced default).
  const hadManualOffset = freshScene.is_manual_offset === true
  const oldDerived      = Number(freshScene.audio_duration) > 0
    ? narrationSafeSceneDuration(freshScene.audio_duration)
    : null
  const hadManualTrim = oldDerived !== null &&
    freshScene.duration_seconds !== undefined &&
    Math.abs(freshScene.duration_seconds - oldDerived) > 0.05

  const updatedScene = {
    ...freshScene,
    audio_path:       `/projects/${projectId}/audio/${liveFilename}`,
    audio_duration:   audioDuration,
    // Same per-scene duration sync formula as /api/voiceover/sync-timings.
    duration_seconds: narrationSafeSceneDuration(audioDuration),
    voice_stale:      false,
  }
  if (hadManualOffset) updatedScene.is_manual_offset = false

  freshFile.scenes[freshIdx] = updatedScene
  writeScenesFile(freshFile)

  res.json({
    scene: updatedScene,
    manual_adjustments_reset: hadManualOffset || hadManualTrim,
    backed_up: backedUp,
  })
})

// POST /api/scenes/:sceneId/revert-voice
// Body: { projectId }
// "Revert to generated" for the script-editing feature: restores BOTH script_excerpt
// (from original_script_excerpt, stored by the first /script edit) and the narration audio
// (from the scene_{id}_original.mp3 backup, created by the first regeneration) to their
// state at Fine-Tune entry, re-syncs audio_duration/duration_seconds from the restored
// file, and clears voice_stale. The backup file itself is kept — it is still the true
// original if the user edits again after reverting.
router.post('/:sceneId/revert-voice', async (req, res) => {
  const { sceneId } = req.params
  const { projectId } = req.body || {}

  if (!projectId) return res.status(400).json({ error: 'projectId required' })

  const file = readScenesFile(projectId)
  if (!file) return res.status(404).json({ error: `No scenes.json found for project ${projectId}` })

  const idx = file.scenes.findIndex(s => String(s.scene_id) === String(sceneId))
  if (idx === -1) return res.status(404).json({ error: `Scene ${sceneId} not found in project ${projectId}` })

  const scene      = file.scenes[idx]
  const audioDir   = path.join(PROJECTS_DIR, projectId, 'audio')
  const backupPath = path.join(audioDir, `scene_${sceneId}_original.mp3`)

  const hasBackup       = fs.existsSync(backupPath)
  const hasOriginalText = scene.original_script_excerpt !== undefined

  if (!hasBackup && !hasOriginalText) {
    return res.status(400).json({ error: `Nothing to revert — scene ${sceneId}'s script/voice was never edited` })
  }

  const updatedScene = { ...scene, voice_stale: false }

  if (hasOriginalText) {
    updatedScene.script_excerpt = scene.original_script_excerpt
    delete updatedScene.original_script_excerpt
  }

  if (hasBackup) {
    const liveFilename = scene.audio_path ? path.basename(scene.audio_path) : `scene_${sceneId}.mp3`
    const liveAbsPath  = path.join(audioDir, liveFilename)
    fs.copyFileSync(backupPath, liveAbsPath)
    updatedScene.audio_path = `/projects/${projectId}/audio/${liveFilename}`
    const duration = await elevenlabsService.getAudioDuration(liveAbsPath)
    if (duration) {
      updatedScene.audio_duration   = duration
      updatedScene.duration_seconds = narrationSafeSceneDuration(duration)
    }
  }

  file.scenes[idx] = updatedScene
  writeScenesFile(file)

  res.json({ scene: updatedScene })
})

// PATCH /api/scenes/:sceneId/boundary
// Body: { projectId, jcut_offset?, lcut_offset?, is_manual_offset? }
// FT-4 manual J-cut/L-cut audio bleed override for this scene's OUTGOING boundary (its
// pairing with the next scene in the array). is_manual_offset: false reverts to Documentary
// .jsx's automatic calculation. Setting either offset without an explicit is_manual_offset
// implies manual mode. `boundary_partner_scene_id` records which next-scene neighbor this
// was calibrated against, so a later reorder can detect if that pairing is still valid.
router.patch('/:sceneId/boundary', (req, res) => {
  const { sceneId } = req.params
  const { projectId, jcut_offset, lcut_offset, is_manual_offset } = req.body || {}

  if (!projectId) return res.status(400).json({ error: 'projectId required' })

  const updates = {}
  if (jcut_offset      !== undefined) updates.jcut_offset      = jcut_offset
  if (lcut_offset      !== undefined) updates.lcut_offset      = lcut_offset
  if (is_manual_offset !== undefined) updates.is_manual_offset = is_manual_offset

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided (jcut_offset, lcut_offset, is_manual_offset)' })
  }

  const file = readScenesFile(projectId)
  if (!file) return res.status(404).json({ error: `No scenes.json found for project ${projectId}` })

  const idx = file.scenes.findIndex(s => String(s.scene_id) === String(sceneId))
  if (idx === -1) return res.status(404).json({ error: `Scene ${sceneId} not found in project ${projectId}` })

  const scene     = file.scenes[idx]
  const nextScene = file.scenes[idx + 1] || null

  const errors = validateBoundaryUpdate(scene, nextScene, updates)
  if (errors.length) return res.status(400).json({ error: errors[0], errors })

  const updatedScene = { ...scene }

  if (updates.is_manual_offset === false) {
    updatedScene.is_manual_offset = false
  } else {
    if (updates.jcut_offset !== undefined) updatedScene.jcut_offset = updates.jcut_offset
    if (updates.lcut_offset !== undefined) updatedScene.lcut_offset = updates.lcut_offset
    updatedScene.is_manual_offset = updates.is_manual_offset !== undefined ? updates.is_manual_offset : true
    updatedScene.boundary_partner_scene_id = nextScene.scene_id
  }

  file.scenes[idx] = updatedScene
  writeScenesFile(file)

  res.json({ scene: updatedScene })
})

// PATCH /api/scenes/:sceneId/layout
// Body: { projectId, layout, source_scene_id? }
// FT-7 split-screen. Sets layout ('single' | 'split_horizontal' | 'split_vertical').
// When layout is a split value and source_scene_id is provided, copies that scene's
// current image_path file to a new file scoped to THIS scene (never a live reference — later
// changes to the source scene's own image never retroactively affect this secondary panel)
// and sets secondary_image_path/secondary_source_scene_id accordingly. Backs up this scene's
// own existing secondary image first (FT-3's backup-then-overwrite pattern, reused with a
// distinct 'secondary_original' suffix so it never collides with the primary panel's backup).
// Setting layout: 'single' also clears secondary_image_path/secondary_source_scene_id back to
// null — this is also exactly what "Revert to generated" calls, so no separate revert
// endpoint is needed.
router.patch('/:sceneId/layout', (req, res) => {
  const { sceneId } = req.params
  const { projectId, layout, source_scene_id } = req.body || {}

  if (!projectId) return res.status(400).json({ error: 'projectId required' })
  if (layout === undefined) return res.status(400).json({ error: 'layout required' })
  if (!isValidLayout(layout)) {
    return res.status(400).json({ error: `layout must be one of ${LAYOUT_VALUES.join(', ')}` })
  }

  const file = readScenesFile(projectId)
  if (!file) return res.status(404).json({ error: `No scenes.json found for project ${projectId}` })

  const idx = file.scenes.findIndex(s => String(s.scene_id) === String(sceneId))
  if (idx === -1) return res.status(404).json({ error: `Scene ${sceneId} not found in project ${projectId}` })

  const scene = file.scenes[idx]
  const updatedScene = { ...scene, layout }

  if (layout === 'single') {
    // Revert (or any explicit switch back to single) — no secondary panel, clear both fields.
    updatedScene.secondary_image_path = null
    updatedScene.secondary_source_scene_id = null
  } else if (source_scene_id !== undefined) {
    const sourceScene = file.scenes.find(s => String(s.scene_id) === String(source_scene_id))
    if (!sourceScene) {
      return res.status(404).json({ error: `Source scene ${source_scene_id} not found in project ${projectId}` })
    }
    if (!sourceScene.image_path) {
      return res.status(400).json({ error: `Source scene ${source_scene_id} has no image_path to reuse` })
    }

    const assetsDir = path.join(PROJECTS_DIR, projectId, 'assets')
    const sourceAbsPath = path.join(assetsDir, path.basename(sourceScene.image_path))
    if (!fs.existsSync(sourceAbsPath)) {
      return res.status(400).json({ error: `Source scene ${source_scene_id}'s image file is missing from disk` })
    }

    // Back up this scene's own existing secondary image before it gets overwritten.
    backupOriginalIfNeeded(assetsDir, sceneId, scene.secondary_image_path, 'secondary_original')

    const ext = path.extname(sourceAbsPath) || '.png'
    const destFilename = scene.secondary_image_path ? path.basename(scene.secondary_image_path) : `${sceneId}_secondary${ext}`
    const destAbsPath = path.join(assetsDir, destFilename)

    // A genuine copy — not a live reference. Later changes to the source scene's own
    // image_path never retroactively affect this scene's secondary panel.
    fs.copyFileSync(sourceAbsPath, destAbsPath)

    updatedScene.secondary_image_path = `/projects/${projectId}/assets/${destFilename}`
    updatedScene.secondary_source_scene_id = String(source_scene_id)
  }

  file.scenes[idx] = updatedScene
  writeScenesFile(file)

  res.json({ scene: updatedScene })
})

// PATCH /api/scenes/:sceneId/cutaway
// Body: { projectId, insert_at, duration, source_scene_id? }
// FT-8 cutaway insert. insert_at/duration are validated against the scene's own
// duration_seconds — out-of-range values are REJECTED, never silently clamped (both
// insert_at >= 0.5s and insert_at + duration <= duration_seconds - 0.5s must hold, leaving
// at least 0.5s of main visual on each side of the cutaway). Only applies to image scenes —
// the cutaway's image_path only makes sense for a shot type that already has one.
// source_scene_id (reuse mode) copies that scene's image_path file, same non-reference-copy
// pattern as FT-7's /layout — a distinct 'cutaway_original' backup suffix keeps this from
// colliding with the primary panel's backup or FT-7's secondary-panel backup. Regenerate mode
// is a separate endpoint (POST /api/higgsfield/regenerate-cutaway/:sceneId), matching FT-7's
// split between PATCH .../layout (reuse) and POST .../regenerate-secondary (AI generation).
router.patch('/:sceneId/cutaway', (req, res) => {
  const { sceneId } = req.params
  const { projectId, insert_at, duration, source_scene_id } = req.body || {}

  if (!projectId) return res.status(400).json({ error: 'projectId required' })

  const file = readScenesFile(projectId)
  if (!file) return res.status(404).json({ error: `No scenes.json found for project ${projectId}` })

  const idx = file.scenes.findIndex(s => String(s.scene_id) === String(sceneId))
  if (idx === -1) return res.status(404).json({ error: `Scene ${sceneId} not found in project ${projectId}` })

  const scene = file.scenes[idx]
  if (scene.shot_type !== 'image') {
    return res.status(400).json({ error: `Scene ${sceneId} is shot_type "${scene.shot_type}" — cutaway only applies to image scenes` })
  }

  const errors = validateCutawayUpdate(scene, { insert_at, duration })
  if (errors.length) return res.status(400).json({ error: errors[0], errors })

  const existingCutaway = scene.cutaway || { image_path: null, insert_at: null, duration: null }
  const updatedScene = { ...scene, cutaway: { ...existingCutaway, insert_at, duration } }

  if (source_scene_id !== undefined) {
    const sourceScene = file.scenes.find(s => String(s.scene_id) === String(source_scene_id))
    if (!sourceScene) {
      return res.status(404).json({ error: `Source scene ${source_scene_id} not found in project ${projectId}` })
    }
    if (!sourceScene.image_path) {
      return res.status(400).json({ error: `Source scene ${source_scene_id} has no image_path to reuse` })
    }

    const assetsDir = path.join(PROJECTS_DIR, projectId, 'assets')
    const sourceAbsPath = path.join(assetsDir, path.basename(sourceScene.image_path))
    if (!fs.existsSync(sourceAbsPath)) {
      return res.status(400).json({ error: `Source scene ${source_scene_id}'s image file is missing from disk` })
    }

    backupOriginalIfNeeded(assetsDir, sceneId, existingCutaway.image_path, 'cutaway_original')

    const ext = path.extname(sourceAbsPath) || '.png'
    const destFilename = existingCutaway.image_path ? path.basename(existingCutaway.image_path) : `${sceneId}_cutaway${ext}`
    const destAbsPath = path.join(assetsDir, destFilename)

    // A genuine copy — not a live reference, same guarantee as FT-7's reuse mode.
    fs.copyFileSync(sourceAbsPath, destAbsPath)

    updatedScene.cutaway.image_path = `/projects/${projectId}/assets/${destFilename}`
  }

  file.scenes[idx] = updatedScene
  writeScenesFile(file)

  res.json({ scene: updatedScene })
})

// DELETE /api/scenes/:sceneId/cutaway
// Body: { projectId }
// Removes the cutaway — resets the field to its default shape (matches "Revert to
// generated": every scene starts with cutaway: { image_path: null, insert_at: null,
// duration: null }, this restores exactly that, it never leaves a partially-set object).
router.delete('/:sceneId/cutaway', (req, res) => {
  const { sceneId } = req.params
  const { projectId } = req.body || {}

  if (!projectId) return res.status(400).json({ error: 'projectId required' })

  const file = readScenesFile(projectId)
  if (!file) return res.status(404).json({ error: `No scenes.json found for project ${projectId}` })

  const idx = file.scenes.findIndex(s => String(s.scene_id) === String(sceneId))
  if (idx === -1) return res.status(404).json({ error: `Scene ${sceneId} not found in project ${projectId}` })

  const updatedScene = { ...file.scenes[idx], cutaway: { image_path: null, insert_at: null, duration: null } }
  file.scenes[idx] = updatedScene
  writeScenesFile(file)

  res.json({ scene: updatedScene })
})

// POST /api/scenes/reorder
// Body: { projectId, order: [scene_id, ...] }
// `order` must be a permutation of the project's existing scene_id set — same scenes,
// new positions only. scene_id values are never renumbered or reassigned; only the
// array position of each scene object changes, so audio_path/image_path/etc. on each
// scene stay valid after a reorder.
router.post('/reorder', (req, res) => {
  const { projectId, order } = req.body || {}

  if (!projectId) return res.status(400).json({ error: 'projectId required' })
  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ error: 'order must be a non-empty array of scene_id values' })
  }

  const file = readScenesFile(projectId)
  if (!file) return res.status(404).json({ error: `No scenes.json found for project ${projectId}` })

  const currentIds   = file.scenes.map(s => String(s.scene_id))
  const submittedIds = order.map(String)

  const currentSet   = new Set(currentIds)
  const submittedSet = new Set(submittedIds)

  const errors = []
  if (submittedIds.length !== currentIds.length) {
    errors.push(`order has ${submittedIds.length} scene_id(s), project has ${currentIds.length}`)
  }
  if (submittedSet.size !== submittedIds.length) {
    errors.push('order contains duplicate scene_id values')
  }
  const missing = currentIds.filter(id => !submittedSet.has(id))
  const extra   = submittedIds.filter(id => !currentSet.has(id))
  if (missing.length) errors.push(`order is missing scene_id(s): ${missing.join(', ')}`)
  if (extra.length)   errors.push(`order contains unknown scene_id(s): ${extra.join(', ')}`)

  if (errors.length) return res.status(400).json({ error: errors[0], errors })

  const byId = new Map(file.scenes.map(s => [String(s.scene_id), s]))
  const reordered = submittedIds.map(id => byId.get(id))

  // FT-4: a manual boundary offset was calibrated for a specific next-scene neighbor
  // (boundary_partner_scene_id). If this reorder moved scenes such that neighbor is no
  // longer actually next, the offset has no meaningful pairing anymore — reset it.
  file.scenes = resetBrokenBoundaryAdjacency(reordered)

  writeScenesFile(file)

  res.json({ scenes: file.scenes })
})

module.exports = router
