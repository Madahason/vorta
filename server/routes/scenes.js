const express = require('express')
const router  = express.Router()
const path    = require('path')
const fs      = require('fs')
const {
  validateSceneUpdate, validateBoundaryUpdate, resetBrokenBoundaryAdjacency,
  clampDurationForActionCut, resetActionCutBoundaryOffsets, isValidLayout, LAYOUT_VALUES,
} = require('../services/frameMath')
const { PROJECTS_DIR, readScenesFile, writeScenesFile } = require('../services/scenesFile')
const { backupOriginalIfNeeded } = require('../services/imageSwap')

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
