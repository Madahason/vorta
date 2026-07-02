const express = require('express')
const router  = express.Router()
const path    = require('path')
const fs      = require('fs')
const multer  = require('multer')
const { PROJECTS_DIR, readScenesFile, writeScenesFile } = require('../services/scenesFile')
const { backupOriginalIfNeeded } = require('../services/imageSwap')

const EXT_BY_MIME = {
  'image/png':  '.png',
  'image/jpeg': '.jpg',
  'image/jpg':  '.jpg',
  'image/webp': '.webp',
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const ok = Object.prototype.hasOwnProperty.call(EXT_BY_MIME, file.mimetype)
    cb(ok ? null : new Error('Only PNG, JPEG, or WEBP images are accepted'), ok)
  },
})

// POST /api/images/:sceneId/replace
// multipart/form-data: { projectId, image: <file> }
// Manual image swap for the Fine-Tune stage. Overwrites the scene's existing image_path
// location (same filename it already used) so nothing else referencing that URL needs to
// change; if the scene never had an image yet, picks a new filename from scene_id + the
// upload's extension, matching generate.js's convention. Backs up whatever was there before
// overwriting — see server/services/imageSwap.js for the once-only backup rule.
router.post('/:sceneId/replace', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message })
    try {
      handleReplace(req, res)
    } catch (e) {
      console.error('[images] replace failed:', e.message)
      res.status(500).json({ error: e.message })
    }
  })
})

function handleReplace(req, res) {
  const { sceneId } = req.params
  const { projectId } = req.body || {}

  if (!projectId) return res.status(400).json({ error: 'projectId required' })
  if (!req.file)  return res.status(400).json({ error: 'image file required (form field "image")' })

  const file = readScenesFile(projectId)
  if (!file) return res.status(404).json({ error: `No scenes.json found for project ${projectId}` })

  const idx = file.scenes.findIndex(s => String(s.scene_id) === String(sceneId))
  if (idx === -1) return res.status(404).json({ error: `Scene ${sceneId} not found in project ${projectId}` })

  const scene     = file.scenes[idx]
  const assetsDir = path.join(PROJECTS_DIR, projectId, 'assets')
  fs.mkdirSync(assetsDir, { recursive: true })

  backupOriginalIfNeeded(assetsDir, sceneId, scene.image_path)

  const ext         = EXT_BY_MIME[req.file.mimetype] || '.jpg'
  const filename    = scene.image_path ? path.basename(scene.image_path) : `${sceneId}${ext}`
  const destAbsPath = path.join(assetsDir, filename)

  fs.writeFileSync(destAbsPath, req.file.buffer)

  const image_path = `/projects/${projectId}/assets/${filename}`
  file.scenes[idx] = { ...scene, image_path }
  writeScenesFile(file)

  res.json({ image_path })
}

module.exports = router
