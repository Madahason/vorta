const express = require('express')
const router  = express.Router()
const {
  validateSceneUpdate, validateBoundaryUpdate, resetBrokenBoundaryAdjacency,
} = require('../services/frameMath')
const { readScenesFile, writeScenesFile } = require('../services/scenesFile')

// PATCH /api/scenes/:sceneId
// Body: { projectId, duration_seconds?, transition_out?, audio_mix_override? }
// audio_mix_override: null clears any existing override (used by "Revert to generated").
router.patch('/:sceneId', (req, res) => {
  const { sceneId } = req.params
  const { projectId, duration_seconds, transition_out, audio_mix_override } = req.body || {}

  if (!projectId) return res.status(400).json({ error: 'projectId required' })

  const updates = {}
  if (duration_seconds   !== undefined) updates.duration_seconds   = duration_seconds
  if (transition_out     !== undefined) updates.transition_out     = transition_out
  if (audio_mix_override !== undefined) updates.audio_mix_override = audio_mix_override

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided (duration_seconds, transition_out, audio_mix_override)' })
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
