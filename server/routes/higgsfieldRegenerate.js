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

module.exports = router
