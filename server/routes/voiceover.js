const express = require('express')
const router  = express.Router()
const path    = require('path')
const fs      = require('fs')
const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js')
const { getVoices, generateAudio, getAudioDuration } = require('../services/elevenlabs')
const { insertPauseMarkers, expandNumbers }           = require('../services/voiceoverPreprocessor')
const { narrationSafeSceneDuration, MAX_SCENE_SECONDS } = require('../services/frameMath')
const { readScenesFile, writeScenesFile }             = require('../services/scenesFile')

const PROJECTS_DIR = path.resolve(__dirname, '../../projects')

// GET /api/voiceover/status
// Verify API key and return character credits
router.get('/status', async (req, res) => {
  try {
    if (!process.env.ELEVENLABS_API_KEY) {
      return res.json({ connected: false, error: 'ELEVENLABS_API_KEY not set in .env' })
    }
    const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })

    let planInfo = {
      plan:               'unknown',
      charactersUsed:     0,
      charactersLimit:    999999,
      charactersRemaining: 999999,
    }

    try {
      // SDK shape has changed across versions — try every known path
      let subscription = null
      if (typeof client.user?.getSubscription === 'function') {
        subscription = await client.user.getSubscription()
      } else if (typeof client.user?.subscription?.get === 'function') {
        subscription = await client.user.subscription.get()
      }

      if (subscription) {
        const used  = subscription.characterCount  ?? subscription.character_count  ?? 0
        const limit = subscription.characterLimit  ?? subscription.character_limit  ?? 999999
        planInfo = {
          plan:                subscription.tier || subscription.plan || 'active',
          charactersUsed:      used,
          charactersLimit:     limit,
          charactersRemaining: Math.max(0, limit - used),
        }
      }
    } catch (subErr) {
      // Subscription details unavailable — still verify connectivity via voices ping
      console.warn('[voiceover] subscription details unavailable:', subErr.message)
      try { await client.voices.getAll() } catch (voiceErr) {
        throw voiceErr // voices ping also failed — real auth error
      }
    }

    res.json({ connected: true, ...planInfo })
  } catch (err) {
    res.json({ connected: false, error: err.message })
  }
})

// GET /api/voiceover/voices
router.get('/voices', async (req, res) => {
  try {
    const voices = await getVoices()
    res.json(voices)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/voiceover/generate
// Body: { projectId, scenes, voiceId, modelId, mode: 'full'|'scene', sceneId?,
//         voiceSettings?, useMoodSettings?, usePreprocessing?, normaliseVolume? }
// SSE stream of scene_done / scene_error / done events
router.post('/generate', async (req, res) => {
  const {
    projectId, scenes, voiceId, modelId,
    mode = 'full', sceneId, voiceSettings,
    useMoodSettings  = false,
    usePreprocessing = false,
    normaliseVolume  = false,
  } = req.body

  if (!voiceId)    return res.status(400).json({ error: 'voiceId required' })
  if (!projectId)  return res.status(400).json({ error: 'projectId required' })
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return res.status(400).json({ error: 'scenes must be a non-empty array' })
  }

  const audioDir = path.join(PROJECTS_DIR, projectId, 'audio')
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true })

  res.setHeader('Content-Type',  'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection',    'keep-alive')
  res.flushHeaders()

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  try {
    const scenesToProcess = mode === 'scene'
      ? scenes.filter(s => s.scene_id === sceneId)
      : scenes

    const results = []

    for (const scene of scenesToProcess) {
      if (!scene.script_excerpt?.trim()) continue

      send({ type: 'generating', scene_id: scene.scene_id, message: `Generating audio for scene ${scene.scene_id}…` })

      const outputPath = path.join(audioDir, `scene_${scene.scene_id}.mp3`)

      try {
        await generateAudio({
          text:            scene.script_excerpt,
          voiceId,
          modelId:         modelId || 'eleven_multilingual_v2',
          outputPath,
          voiceSettings:   voiceSettings || {},
          mood:            scene.mood || 'neutral',
          useMoodSettings,
          usePreprocessing,
          normalise:       normaliseVolume,
        })

        const audioDuration = await getAudioDuration(outputPath)
        // Shared formula (frameMath.narrationSafeSceneDuration): audio + 0.4s crossfade
        // delay + 0.8s end buffer, capped at the 8s style target only when the cap still
        // clears the narration floor — the narration itself is never truncated.
        const sceneDuration = audioDuration
          ? narrationSafeSceneDuration(audioDuration)
          : (scene.duration_seconds || 5)
        console.log(`[voiceover] scene ${scene.scene_id}: audio=${audioDuration}s scene=${sceneDuration}s (includes crossfade + end buffer)`)
        const audio_path = `/projects/${projectId}/audio/scene_${scene.scene_id}.mp3`

        const absolutePath = path.resolve(outputPath)
        const fileExists   = fs.existsSync(absolutePath)
        const fileSize     = fileExists ? fs.statSync(absolutePath).size : 0
        console.log('[voiceover] scene done:', scene.scene_id)
        console.log('[voiceover] audio saved at:', absolutePath)
        console.log('[voiceover] file exists:', fileExists, 'size:', fileSize, 'bytes')
        console.log('[voiceover] audio_path sent to client:', audio_path)

        results.push({ scene_id: scene.scene_id, audio_path, audio_duration: audioDuration, scene_duration: sceneDuration, status: 'done' })

        send({ type: 'scene_done', scene_id: scene.scene_id, audio_path, audio_duration: audioDuration, scene_duration: sceneDuration })

      } catch (err) {
        send({ type: 'scene_error', scene_id: scene.scene_id, error: err.message })
        console.error(`[voiceover] scene ${scene.scene_id} failed:`, err.message)
      }
    }

    send({ type: 'done', results })
    res.end()

  } catch (err) {
    send({ type: 'error', message: err.message })
    res.end()
  }
})

// POST /api/voiceover/repad
// Re-applies silence padding to existing audio files without re-generating from ElevenLabs.
// Use when padding defaults have changed (e.g. increasing startMs to fix cutoff words).
router.post('/repad', async (req, res) => {
  const { scenes, projectId } = req.body
  if (!Array.isArray(scenes) || !projectId) {
    return res.status(400).json({ error: 'scenes array and projectId required' })
  }

  const { exec } = require('child_process')
  const { promisify } = require('util')
  const execAsync = promisify(exec)

  res.setHeader('Content-Type',  'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection',    'keep-alive')
  res.flushHeaders()

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  const START_MS  = 500
  const END_MS    = 800
  const END_SECS  = END_MS / 1000

  const updatedScenes = []
  let repadded = 0

  for (const scene of scenes) {
    const audioPath = path.resolve(PROJECTS_DIR, projectId, 'audio', `scene_${scene.scene_id}.mp3`)

    if (!fs.existsSync(audioPath)) {
      updatedScenes.push(scene)
      continue
    }

    const tempPath = audioPath.replace('.mp3', `_repad_${Date.now()}.mp3`)

    try {
      const cmd = `ffmpeg -i "${audioPath}" -af "adelay=${START_MS}|${START_MS},apad=pad_dur=${END_SECS}" -c:a libmp3lame -q:a 2 "${tempPath}" -y -loglevel quiet`
      await execAsync(cmd, { timeout: 30000 })

      if (!fs.existsSync(tempPath) || fs.statSync(tempPath).size < 10000) {
        throw new Error('Repadded file missing or too small')
      }

      fs.renameSync(tempPath, audioPath)
      repadded++

      const { stdout } = await execAsync(
        `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`
      )
      const newDuration = parseFloat(stdout.trim())
      // VOICEOVER-CUTOFF FIX: repad used audio + 0.4 (crossfade only) — below even the FT-1
      // narration floor (audio + 0.8). Same shared formula as sync-timings now.
      const newSceneDuration = isNaN(newDuration)
        ? scene.duration_seconds
        : narrationSafeSceneDuration(newDuration)

      updatedScenes.push({ ...scene, audio_duration: newDuration, duration_seconds: newSceneDuration })
      send({ type: 'done', scene_id: scene.scene_id, duration: newDuration })
    } catch (err) {
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath) } catch {}
      updatedScenes.push(scene)
      send({ type: 'error', scene_id: scene.scene_id, message: err.message })
      console.warn(`[repad] scene ${scene.scene_id} failed:`, err.message)
    }
  }

  console.log(`[repad] complete — ${repadded} / ${scenes.length} files updated`)
  send({ type: 'complete', repadded, updatedScenes })
  res.end()
})

// POST /api/voiceover/add-pauses
// Body: { scenes: [{ scene_id, script_excerpt, mood? }] }
// Returns: { scenes: [{ scene_id, processed_text }] }
// Runs expandNumbers + insertPauseMarkers locally (no AI cost, instant).
router.post('/add-pauses', (req, res) => {
  const { scenes } = req.body
  if (!Array.isArray(scenes)) {
    return res.status(400).json({ error: 'scenes array required' })
  }

  const processed = scenes.map(scene => ({
    scene_id:       scene.scene_id,
    processed_text: insertPauseMarkers(expandNumbers(scene.script_excerpt || '')),
  }))

  res.json({ scenes: processed })
})

// POST /api/voiceover/preview
// Body: { voiceId, text? }
router.post('/preview', async (req, res) => {
  const { voiceId, text = 'In the beginning, there was nothing. Then, everything changed.' } = req.body

  if (!voiceId) return res.status(400).json({ error: 'voiceId required' })

  const outputPath = path.join(PROJECTS_DIR, `voice_preview_${voiceId}.mp3`)

  try {
    if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true })
    await generateAudio({ text, voiceId, outputPath })
    res.json({ preview_url: `/projects/voice_preview_${voiceId}.mp3` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/voiceover/sync-timings
// Re-measures audio durations from disk and returns updated scene objects.
// Called automatically after Generate All completes and by the Sync Timings button.
//
// VOICEOVER-CUTOFF FIX (root cause of "narration ends abruptly mid-sentence"): this
// endpoint used to hard-cap duration_seconds at 8.0 even when the narration itself was
// longer (up to 14.2s in real projects) — Documentary.jsx force-fades narration to zero at
// the scene window's end, so every capped scene had its speech cut. The duration formula
// now lives in frameMath.narrationSafeSceneDuration: audio + 0.4 + 0.8, capped at the 8s
// style target ONLY when that still clears the narration floor (audio + 0.8s). Scenes that
// exceed the style target are still reported via durationWarnings — the real remedy remains
// splitting the script excerpt — but their narration is never structurally truncated.
router.post('/sync-timings', async (req, res) => {
  const { scenes, projectId } = req.body
  if (!Array.isArray(scenes) || !projectId) {
    return res.status(400).json({ error: 'scenes array and projectId required' })
  }

  const durationWarnings = []

  const updatedScenes = await Promise.all(scenes.map(async (scene) => {
    const audioPath = path.resolve(PROJECTS_DIR, projectId, 'audio', `scene_${scene.scene_id}.mp3`)
    if (!fs.existsSync(audioPath)) return scene
    const duration = await getAudioDuration(audioPath)
    if (!duration) return scene
    const sceneDuration = narrationSafeSceneDuration(duration)

    if (sceneDuration > MAX_SCENE_SECONDS) {
      console.warn(`[voiceover] scene ${scene.scene_id} narration is ${duration.toFixed(1)}s → scene set to ${sceneDuration}s (exceeds the ${MAX_SCENE_SECONDS}s style target — narration is never truncated). Script excerpt may need splitting.`)
      durationWarnings.push({ scene_id: scene.scene_id, audio_duration: parseFloat(duration.toFixed(2)), duration_seconds: sceneDuration, exceeds_style_target: MAX_SCENE_SECONDS })
    }

    return {
      ...scene,
      audio_path:       `/projects/${projectId}/audio/scene_${scene.scene_id}.mp3`,
      audio_duration:   duration,
      duration_seconds: sceneDuration,
    }
  }))

  const synced = updatedScenes.filter(s => s.audio_duration).length
  console.log(`[voiceover] sync-timings — synced ${synced} / ${scenes.length} scenes`)
  if (durationWarnings.length > 0) {
    console.warn(`[voiceover] ${durationWarnings.length} scene(s) exceed the ${MAX_SCENE_SECONDS}s style target — narration preserved, consider splitting those excerpts`)
  }

  // VOICEOVER-CUTOFF FIX part 2: persist audio metadata into the project's scenes.json.
  // sync-timings previously returned updatedScenes to the client only — no project on disk
  // had audio_path/audio_duration on ANY scene (verified 0/8 projects), so every
  // server-side narration floor (FT-1 duration validation, FT-5 action-cut and FT-9
  // montage clamps) ran with audio_duration = undefined and degenerated to a 0.8s floor —
  // an action cut would shrink a fully-narrated scene to 0.8 seconds. The merge is
  // best-effort: a project that hasn't generated visuals yet has no scenes.json (it's
  // created by generate.js), and the client state is persisted there on that later write.
  try {
    const file = readScenesFile(projectId)
    if (file) {
      const byId = new Map(updatedScenes.filter(s => s.audio_duration).map(s => [String(s.scene_id), s]))
      let merged = 0
      file.scenes = file.scenes.map(s => {
        const u = byId.get(String(s.scene_id))
        if (!u) return s
        merged++
        return { ...s, audio_path: u.audio_path, audio_duration: u.audio_duration, duration_seconds: u.duration_seconds }
      })
      if (merged > 0) {
        writeScenesFile(file)
        console.log(`[voiceover] sync-timings — persisted audio metadata for ${merged} scene(s) to scenes.json`)
      }
    }
  } catch (err) {
    console.warn('[voiceover] sync-timings — could not persist audio metadata to scenes.json (non-fatal):', err.message)
  }

  res.json({ success: true, updatedScenes, durationWarnings })
})

module.exports = router
