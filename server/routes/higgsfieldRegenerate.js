const express = require('express')
const router  = express.Router()
const path    = require('path')
const fs      = require('fs')

// Referenced via the module object (not destructured) so tests can monkey-patch
// generateImage/enhancePrompt/downloadImage for a fast, deterministic run without calling
// the real Higgsfield CLI or Claude API — see server/routes/higgsfieldRegenerate.test.js.
const higgsfieldService = require('../services/higgsfield')
const promptEnhancer    = require('../services/promptEnhancer')
const imageDownloadSvc  = require('../services/imageDownload')

const { PROJECTS_DIR, readScenesFile, writeScenesFile } = require('../services/scenesFile')
const { backupOriginalIfNeeded } = require('../services/imageSwap')

// POST /api/higgsfield/regenerate/:sceneId
// Body: { projectId }
// Thin wrapper around the exact same generation pipeline server/routes/generate.js's
// processScene() uses (enhancePrompt -> generateImage -> downloadImage) — reused, not
// duplicated — scoped to exactly one scene. The prompt is always read from the project's
// own scenes.json, never trusted from the request body, so this regenerates from the same
// prompt Fine-Tune is showing and cannot be pointed at a different scene's prompt. No other
// scene's progress/state is touched.
router.post('/regenerate/:sceneId', async (req, res) => {
  const { sceneId } = req.params
  const { projectId } = req.body || {}

  if (!projectId) return res.status(400).json({ error: 'projectId required' })

  const file = readScenesFile(projectId)
  if (!file) return res.status(404).json({ error: `No scenes.json found for project ${projectId}` })

  const idx = file.scenes.findIndex(s => String(s.scene_id) === String(sceneId))
  if (idx === -1) return res.status(404).json({ error: `Scene ${sceneId} not found in project ${projectId}` })

  const scene = file.scenes[idx]
  if (scene.shot_type !== 'image') {
    return res.status(400).json({ error: `Scene ${sceneId} is shot_type "${scene.shot_type}" — regeneration only applies to image scenes` })
  }
  if (!scene.higgsfield_prompt) {
    return res.status(400).json({ error: `Scene ${sceneId} has no higgsfield_prompt to regenerate from` })
  }

  const assetsDir = path.join(PROJECTS_DIR, projectId, 'assets')
  fs.mkdirSync(assetsDir, { recursive: true })

  try {
    const promptToUse = await promptEnhancer.enhancePrompt(scene, false)
    const outputUrl    = await higgsfieldService.generateImage(promptToUse)

    backupOriginalIfNeeded(assetsDir, sceneId, scene.image_path)

    const ext          = path.extname(new URL(outputUrl).pathname) || '.png'
    const filename      = scene.image_path ? path.basename(scene.image_path) : `${sceneId}${ext}`
    const destAbsPath   = path.join(assetsDir, filename)

    await imageDownloadSvc.downloadImage(outputUrl, destAbsPath)

    const image_path = `/projects/${projectId}/assets/${filename}`

    // Re-read fresh right before the final write — generation can take minutes, and another
    // Fine-Tune edit (duration/transition/reorder/mix) may have landed on scenes.json since
    // we first read it. Only this scene's image_path is touched either way.
    const fresh = readScenesFile(projectId)
    if (!fresh) return res.status(404).json({ error: `Project ${projectId} scenes.json disappeared during regeneration` })
    const freshIdx = fresh.scenes.findIndex(s => String(s.scene_id) === String(sceneId))
    if (freshIdx === -1) return res.status(404).json({ error: `Scene ${sceneId} no longer exists in project ${projectId}` })

    fresh.scenes[freshIdx] = { ...fresh.scenes[freshIdx], image_path }
    writeScenesFile(fresh)

    res.json({ image_path })
  } catch (err) {
    console.error(`[higgsfield-regenerate] scene ${sceneId} failed:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/higgsfield/regenerate-secondary/:sceneId
// Body: { projectId, prompt }
// FT-7 split-screen secondary panel generation. Same pipeline and reuse as /regenerate above
// (enhancePrompt -> generateImage -> downloadImage), but the prompt is a fresh, user-supplied
// one for the second panel — not the scene's own higgsfield_prompt — wrapped in a minimal
// scene-like object so it goes through the same style-lock/enhancement treatment. Only ever
// touches secondary_image_path on this one scene; clears secondary_source_scene_id since the
// result is no longer derived from any other scene's image. Same backup-then-overwrite safety
// as the primary panel, using the 'secondary_original' suffix so the two backups never collide.
router.post('/regenerate-secondary/:sceneId', async (req, res) => {
  const { sceneId } = req.params
  const { projectId, prompt } = req.body || {}

  if (!projectId) return res.status(400).json({ error: 'projectId required' })
  if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'prompt required' })

  const file = readScenesFile(projectId)
  if (!file) return res.status(404).json({ error: `No scenes.json found for project ${projectId}` })

  const idx = file.scenes.findIndex(s => String(s.scene_id) === String(sceneId))
  if (idx === -1) return res.status(404).json({ error: `Scene ${sceneId} not found in project ${projectId}` })

  const scene = file.scenes[idx]
  if (scene.shot_type !== 'image') {
    return res.status(400).json({ error: `Scene ${sceneId} is shot_type "${scene.shot_type}" — split-screen only applies to image scenes` })
  }

  const assetsDir = path.join(PROJECTS_DIR, projectId, 'assets')
  fs.mkdirSync(assetsDir, { recursive: true })

  try {
    const promptScene = { scene_id: sceneId, higgsfield_prompt: prompt.trim(), subject_anchors: [], composition: scene.composition || 'medium' }
    const promptToUse = await promptEnhancer.enhancePrompt(promptScene, false)
    const outputUrl    = await higgsfieldService.generateImage(promptToUse)

    backupOriginalIfNeeded(assetsDir, sceneId, scene.secondary_image_path, 'secondary_original')

    const ext        = path.extname(new URL(outputUrl).pathname) || '.png'
    const filename    = scene.secondary_image_path ? path.basename(scene.secondary_image_path) : `${sceneId}_secondary${ext}`
    const destAbsPath = path.join(assetsDir, filename)

    await imageDownloadSvc.downloadImage(outputUrl, destAbsPath)

    const secondary_image_path = `/projects/${projectId}/assets/${filename}`

    // Re-read fresh right before the final write — same reasoning as /regenerate above.
    const fresh = readScenesFile(projectId)
    if (!fresh) return res.status(404).json({ error: `Project ${projectId} scenes.json disappeared during regeneration` })
    const freshIdx = fresh.scenes.findIndex(s => String(s.scene_id) === String(sceneId))
    if (freshIdx === -1) return res.status(404).json({ error: `Scene ${sceneId} no longer exists in project ${projectId}` })

    fresh.scenes[freshIdx] = {
      ...fresh.scenes[freshIdx],
      secondary_image_path,
      secondary_source_scene_id: null, // no longer derived from any other scene's image
    }
    writeScenesFile(fresh)

    res.json({ secondary_image_path })
  } catch (err) {
    console.error(`[higgsfield-regenerate-secondary] scene ${sceneId} failed:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
