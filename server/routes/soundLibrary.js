const express = require('express')
const router  = express.Router()

const { loadIndex, getLibraryStats, removeFromLibrary, searchLibraryByType } = require('../services/soundLibrary')
const {
  prewarmSoundLibrary,
  getSting, getAmbient,
} = require('../services/elevenLabsSound')

// GET /api/sound-library/stats
router.get('/stats', (req, res) => {
  res.json(getLibraryStats())
})

// GET /api/sound-library/all
router.get('/all', (req, res) => {
  res.json(loadIndex().sounds)
})

// GET /api/sound-library/by-type/:type
router.get('/by-type/:type', (req, res) => {
  res.json(searchLibraryByType(req.params.type))
})

// DELETE /api/sound-library/:id
router.delete('/:id', (req, res) => {
  const removed = removeFromLibrary(req.params.id)
  res.json({ success: !!removed, removed })
})

// GET /api/sound-library/prewarm — SSE stream that generates all 29 sounds
router.get('/prewarm', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.flushHeaders()

  const send = (data) => { try { res.write(`data: ${JSON.stringify(data)}\n\n`) } catch {} }
  let done  = 0
  const total = 29 // 6 stings + 12 ambient + 11 overlay

  await prewarmSoundLibrary((event) => {
    if (event.type === 'done' || event.type === 'cached') done++
    send({ ...event, done, total })
  })

  send({ type: 'complete', done, total, message: 'Sound library fully generated' })
  res.end()
})

// POST /api/sound-library/generate-sting/:key
router.post('/generate-sting/:key', async (req, res) => {
  try {
    const sound = await getSting(req.params.key)
    res.json({ success: true, sound })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/sound-library/generate-ambient/:key
router.post('/generate-ambient/:key', async (req, res) => {
  try {
    const sound = await getAmbient(req.params.key)
    res.json({ success: true, sound })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
