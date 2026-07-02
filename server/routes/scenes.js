const express = require('express')
const router  = express.Router()
const path    = require('path')
const fs      = require('fs')
const { validateSceneUpdate } = require('../services/frameMath')

const PROJECTS_DIR = path.resolve(__dirname, '../../projects')

// scenes.json is written as a flat array by generate.js, but render.js overwrites the same
// path with a wrapped { scenes, imagePaths, selectedClips, audio, audioSpecs } object once a
// render has run. Handle both shapes so this endpoint keeps working after either write.
function readScenesFile(projectId) {
  const scenesPath = path.join(PROJECTS_DIR, projectId, 'scenes.json')
  if (!fs.existsSync(scenesPath)) return null
  const raw = JSON.parse(fs.readFileSync(scenesPath, 'utf8'))
  const isWrapped = !Array.isArray(raw)
  const scenes = isWrapped ? (raw.scenes || []) : raw
  return { scenesPath, raw, isWrapped, scenes }
}

function writeScenesFile({ scenesPath, raw, isWrapped, scenes }) {
  const out = isWrapped ? { ...raw, scenes } : scenes
  fs.writeFileSync(scenesPath, JSON.stringify(out, null, 2))
}

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

module.exports = router
