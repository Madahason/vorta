// Plain Node integration test — no framework wired into this repo yet. Run with:
//   node server/routes/voiceRegenerate.test.js
// Requires Node 18+ for global fetch.
//
// Covers the Fine-Tune script-editing feature:
//   PATCH /api/scenes/:sceneId/script
//   POST  /api/scenes/:sceneId/regenerate-voice
//   POST  /api/scenes/:sceneId/revert-voice
//
// Monkey-patch technique (higgsfieldRegenerate.test.js precedent): patches
// elevenlabsService.generateAudio / getAudioDuration on the module-exports object for the
// duration of the test (restored in a finally block), so the happy path runs fast and
// deterministically with zero real ElevenLabs/ffprobe calls. generateAudio's mock writes
// real bytes to the requested outputPath, so the temp-file/backup/rename mechanics are
// exercised against the real filesystem.
const assert  = require('assert')
const fs      = require('fs')
const path    = require('path')
const express = require('express')

const elevenlabsService = require('../services/elevenlabs')
const { narrationSafeSceneDuration } = require('../services/frameMath')

const PROJECTS_DIR = path.resolve(__dirname, '../../projects')
const TEST_PROJECT = '__test_voice_regen__'
const testDir      = path.join(PROJECTS_DIR, TEST_PROJECT)
const audioDir     = path.join(testDir, 'audio')
const scenesPath   = path.join(testDir, 'scenes.json')

const VALID_TEXT_1 = 'Apple does not sell groceries, it sells phones and subscriptions.'
const VALID_TEXT_2 = 'A completely rewritten narration line for this scene, longer than before.'

function setup() {
  fs.mkdirSync(audioDir, { recursive: true })
  const scenes = [
    {
      scene_id: '001', script_excerpt: VALID_TEXT_1, shot_type: 'image',
      duration_seconds: 4.7, audio_duration: 3.5, transition_out: 'dissolve',
      audio_path: `/projects/${TEST_PROJECT}/audio/scene_001.mp3`,
    },
    {
      // FT-1 manual trim (5.5 != derived 4.2) AND FT-4 manual boundary offset — the
      // conflict-reset scene.
      scene_id: '002', script_excerpt: VALID_TEXT_1, shot_type: 'image',
      duration_seconds: 5.5, audio_duration: 3.0, transition_out: 'dissolve',
      audio_path: `/projects/${TEST_PROJECT}/audio/scene_002.mp3`,
      is_manual_offset: true, jcut_offset: 1.0, boundary_partner_scene_id: '003',
    },
    {
      // Never had narration generated — regenerate must create the file with no backup.
      scene_id: '003', script_excerpt: VALID_TEXT_1, shot_type: 'image',
      duration_seconds: 5, transition_out: 'dissolve',
    },
    {
      // Untouched control scene for invalid-PATCH state assertions.
      scene_id: '004', script_excerpt: VALID_TEXT_1, shot_type: 'image',
      duration_seconds: 4.7, audio_duration: 3.5, transition_out: 'dissolve',
      audio_path: `/projects/${TEST_PROJECT}/audio/scene_004.mp3`,
    },
    {
      // Never edited at all — the "nothing to revert" case.
      scene_id: '005', script_excerpt: VALID_TEXT_1, shot_type: 'image',
      duration_seconds: 5, transition_out: 'dissolve',
    },
  ]
  fs.writeFileSync(scenesPath, JSON.stringify(scenes, null, 2))
  fs.writeFileSync(path.join(audioDir, 'scene_001.mp3'), 'ORIGINAL_AUDIO_001')
  fs.writeFileSync(path.join(audioDir, 'scene_002.mp3'), 'ORIGINAL_AUDIO_002')
  fs.writeFileSync(path.join(audioDir, 'scene_004.mp3'), 'ORIGINAL_AUDIO_004')
}

function cleanup() {
  fs.rmSync(testDir, { recursive: true, force: true })
}

const readScenes = () => JSON.parse(fs.readFileSync(scenesPath, 'utf8'))
const sceneOnDisk = (id) => readScenes().find(s => s.scene_id === id)
const audioBytes = (filename) => fs.readFileSync(path.join(audioDir, filename), 'utf8')

async function run() {
  cleanup()
  setup()

  // ── Monkey-patch the ElevenLabs pipeline ────────────────────────────────────
  const realGenerateAudio    = elevenlabsService.generateAudio
  const realGetAudioDuration = elevenlabsService.getAudioDuration

  const generateCalls = []
  const behavior = { fail: false, bytes: 'NEW_TAKE_1', duration: 4.2 }

  elevenlabsService.generateAudio = async (opts) => {
    generateCalls.push(opts)
    if (behavior.fail) throw new Error('ElevenLabs exploded')
    fs.writeFileSync(opts.outputPath, behavior.bytes)
    return opts.outputPath
  }
  elevenlabsService.getAudioDuration = async () => behavior.duration

  const app = express()
  app.use(express.json())
  app.use('/api/scenes', require('./scenes'))
  const server = app.listen(0)
  const base   = `http://localhost:${server.address().port}/api/scenes`

  const patchScript = (sceneId, script_excerpt, projectId = TEST_PROJECT) =>
    fetch(`${base}/${sceneId}/script`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ projectId, script_excerpt }),
    })
  const regenVoice = (sceneId, body = {}) =>
    fetch(`${base}/${sceneId}/regenerate-voice`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ projectId: TEST_PROJECT, voiceId: 'test-voice', ...body }),
    })
  const revertVoice = (sceneId) =>
    fetch(`${base}/${sceneId}/revert-voice`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ projectId: TEST_PROJECT }),
    })

  try {
    // ════ PATCH /:sceneId/script ════════════════════════════════════════════

    // 1. Valid script edit
    let res  = await patchScript('001', VALID_TEXT_2)
    let body = await res.json()
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(body)}`)
    assert.strictEqual(body.scene.script_excerpt, VALID_TEXT_2)
    assert.strictEqual(body.scene.voice_stale, true, 'voice_stale must be set true')
    assert.strictEqual(body.scene.audio_path, `/projects/${TEST_PROJECT}/audio/scene_001.mp3`, 'audio_path must be unchanged by a script edit')
    assert.strictEqual(body.scene.original_script_excerpt, VALID_TEXT_1, 'pre-edit script preserved for revert')
    let onDisk = sceneOnDisk('001')
    assert.strictEqual(onDisk.script_excerpt, VALID_TEXT_2, 'persists to scenes.json')
    assert.strictEqual(onDisk.voice_stale, true)
    assert.strictEqual(audioBytes('scene_001.mp3'), 'ORIGINAL_AUDIO_001', 'audio file untouched by a script edit')
    console.log('PASS: PATCH /script valid text — voice_stale true, audio_path + audio file unchanged, persisted')

    // 2. A second edit must NOT overwrite the preserved original text
    res  = await patchScript('001', VALID_TEXT_2 + ' Even more rewritten now.')
    body = await res.json()
    assert.strictEqual(res.status, 200)
    assert.strictEqual(body.scene.original_script_excerpt, VALID_TEXT_1, 'original_script_excerpt is backup-once — second edit must not overwrite it')
    console.log('PASS: PATCH /script second edit keeps the FIRST original_script_excerpt (backup-once)')

    // 3. Invalid text — rejected, nothing saved
    const scene004Before = JSON.stringify(sceneOnDisk('004'))
    for (const [label, bad] of [['too short', 'Hi.'], ['only punctuation', '!!! ... ???'], ['empty', '   ']]) {
      res  = await patchScript('004', bad)
      body = await res.json()
      assert.strictEqual(res.status, 400, `${label}: expected 400, got ${res.status}`)
      assert(/Script rejected/.test(body.error), `${label}: expected rejection message, got: ${body.error}`)
    }
    assert.strictEqual(JSON.stringify(sceneOnDisk('004')), scene004Before, 'rejected text must not change ANY scene state (no voice_stale, no script change)')
    console.log('PASS: PATCH /script invalid text (short / punctuation-only / empty) — 400, zero state change')

    // 3b. Missing projectId / unknown scene
    res = await patchScript('001', VALID_TEXT_2, null)
    assert.strictEqual(res.status, 400)
    res = await patchScript('999', VALID_TEXT_2)
    assert.strictEqual(res.status, 404)
    console.log('PASS: PATCH /script missing projectId (400) and unknown scene (404)')

    // ════ POST /:sceneId/regenerate-voice — success path ═══════════════════════

    // 4. First regeneration: backup created, audio + durations updated, stale cleared
    behavior.bytes = 'NEW_TAKE_1'; behavior.duration = 4.2
    res  = await regenVoice('001')
    body = await res.json()
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(body)}`)
    assert.strictEqual(body.backed_up, true, 'first regeneration must back up the original')
    assert.strictEqual(audioBytes('scene_001_original.mp3'), 'ORIGINAL_AUDIO_001', 'backup holds the TRUE original bytes')
    assert.strictEqual(audioBytes('scene_001.mp3'), 'NEW_TAKE_1', 'live file replaced with the new take')
    assert.strictEqual(body.scene.audio_duration, 4.2)
    assert.strictEqual(body.scene.duration_seconds, narrationSafeSceneDuration(4.2), `duration re-synced (expected ${narrationSafeSceneDuration(4.2)})`)
    assert.strictEqual(body.scene.voice_stale, false, 'voice_stale cleared on success')
    onDisk = sceneOnDisk('001')
    assert.strictEqual(onDisk.voice_stale, false)
    assert.strictEqual(onDisk.audio_duration, 4.2)
    console.log(`PASS: regenerate-voice success — backup created, audio_duration 4.2, duration_seconds ${narrationSafeSceneDuration(4.2)}, voice_stale false`)

    // The pipeline received the scene's OWN stored text (never client-supplied)
    assert.strictEqual(generateCalls.length, 1)
    assert.strictEqual(generateCalls[0].text, VALID_TEXT_2 + ' Even more rewritten now.', 'generateAudio must receive the stored script_excerpt')
    assert.strictEqual(generateCalls[0].voiceId, 'test-voice')
    console.log('PASS: regenerate-voice reuses generateAudio with the scene\'s own stored script text')

    // 5. Edit again + second regeneration: backup NOT overwritten
    await patchScript('001', VALID_TEXT_2 + ' Third revision of this narration line.')
    behavior.bytes = 'NEW_TAKE_2'; behavior.duration = 5.1
    res  = await regenVoice('001')
    body = await res.json()
    assert.strictEqual(res.status, 200)
    assert.strictEqual(body.backed_up, false, 'second regeneration must not re-back-up')
    assert.strictEqual(audioBytes('scene_001_original.mp3'), 'ORIGINAL_AUDIO_001', 'backup still holds the FIRST original across multiple edits — never overwritten')
    assert.strictEqual(audioBytes('scene_001.mp3'), 'NEW_TAKE_2')
    assert.strictEqual(sceneOnDisk('001').audio_duration, 5.1)
    console.log('PASS: second edit + regeneration — backup created only once, original preserved')

    // 6. A scene that never had narration: file created, no spurious backup
    behavior.bytes = 'FIRST_EVER_TAKE'; behavior.duration = 3.0
    res  = await regenVoice('003')
    body = await res.json()
    assert.strictEqual(res.status, 200)
    assert.strictEqual(body.backed_up, false)
    assert.strictEqual(audioBytes('scene_003.mp3'), 'FIRST_EVER_TAKE')
    assert(!fs.existsSync(path.join(audioDir, 'scene_003_original.mp3')), 'no backup when there was nothing to back up')
    assert.strictEqual(sceneOnDisk('003').audio_path, `/projects/${TEST_PROJECT}/audio/scene_003.mp3`)
    console.log('PASS: regenerate-voice on a scene with no prior narration — file created, no spurious backup')

    // ════ Regeneration failure handling ════════════════════════════════════════

    // 7. ElevenLabs error: prior audio state completely unchanged, voice_stale stays true
    await patchScript('004', VALID_TEXT_2) // sets voice_stale: true
    const scene004PreFail = sceneOnDisk('004')
    assert.strictEqual(scene004PreFail.voice_stale, true)
    behavior.fail = true
    const callsBeforeFail = generateCalls.length
    res  = await regenVoice('004')
    body = await res.json()
    assert.strictEqual(res.status, 500, `expected 500, got ${res.status}`)
    assert(/ElevenLabs exploded/.test(body.error))
    const scene004PostFail = sceneOnDisk('004')
    assert.strictEqual(scene004PostFail.audio_path, scene004PreFail.audio_path, 'audio_path unchanged after failure')
    assert.strictEqual(scene004PostFail.audio_duration, scene004PreFail.audio_duration, 'audio_duration unchanged after failure')
    assert.strictEqual(scene004PostFail.voice_stale, true, 'voice_stale still true — UI keeps showing it needs attention')
    assert.strictEqual(scene004PostFail.duration_seconds, scene004PreFail.duration_seconds, 'duration_seconds unchanged after failure')
    assert.strictEqual(audioBytes('scene_004.mp3'), 'ORIGINAL_AUDIO_004', 'live audio file bytes untouched after failure')
    assert(!fs.existsSync(path.join(audioDir, 'scene_004_original.mp3')), 'no backup created on a failed attempt')
    const tempLeftovers = fs.readdirSync(audioDir).filter(f => f.includes('_regen_'))
    assert.strictEqual(tempLeftovers.length, 0, `no temp files left behind, found: ${tempLeftovers.join(', ')}`)
    assert.strictEqual(generateCalls.length, callsBeforeFail + 1)
    behavior.fail = false
    console.log('PASS: regeneration failure — scene\'s prior audio_path/audio_duration/duration_seconds and file bytes completely unchanged, voice_stale still true, no temp/backup leftovers')

    // 8. Validation runs BEFORE any generation attempt: force-write invalid text directly
    //    into scenes.json (bypassing the PATCH gate), then regenerate
    const rawScenes = readScenes()
    rawScenes.find(s => s.scene_id === '004').script_excerpt = '???'
    fs.writeFileSync(scenesPath, JSON.stringify(rawScenes, null, 2))
    const callsBeforeInvalid = generateCalls.length
    res  = await regenVoice('004')
    body = await res.json()
    assert.strictEqual(res.status, 400, `expected 400, got ${res.status}`)
    assert(/not valid for TTS/.test(body.error))
    assert.strictEqual(generateCalls.length, callsBeforeInvalid, 'generateAudio must NEVER be called with invalid text')
    // restore valid text for later assertions
    const restoreScenes = readScenes()
    restoreScenes.find(s => s.scene_id === '004').script_excerpt = VALID_TEXT_2
    fs.writeFileSync(scenesPath, JSON.stringify(restoreScenes, null, 2))
    console.log('PASS: invalid stored text — 400 with ZERO generation attempts (validation gate before ElevenLabs)')

    // 8b. Missing voiceId / projectId / unknown scene
    res = await fetch(`${base}/001/regenerate-voice`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: TEST_PROJECT }),
    })
    assert.strictEqual(res.status, 400)
    res = await fetch(`${base}/001/regenerate-voice`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voiceId: 'test-voice' }),
    })
    assert.strictEqual(res.status, 400)
    res = await regenVoice('999')
    assert.strictEqual(res.status, 404)
    console.log('PASS: regenerate-voice missing voiceId (400), missing projectId (400), unknown scene (404)')

    // ════ FT-1/FT-4 conflict reset ══════════════════════════════════════════════

    // 9. Scene 002 has is_manual_offset: true AND a manual duration trim (5.5 vs derived 4.2)
    await patchScript('002', VALID_TEXT_2)
    behavior.bytes = 'NEW_TAKE_002'; behavior.duration = 6.0
    res  = await regenVoice('002')
    body = await res.json()
    assert.strictEqual(res.status, 200)
    assert.strictEqual(body.manual_adjustments_reset, true, 'manual FT-1 trim + FT-4 offset must be reported as reset')
    assert.strictEqual(body.scene.is_manual_offset, false, 'FT-4 manual offset cleared')
    assert.strictEqual(body.scene.duration_seconds, narrationSafeSceneDuration(6.0), 'duration reverted to fresh audio + buffer')
    onDisk = sceneOnDisk('002')
    assert.strictEqual(onDisk.is_manual_offset, false)
    assert.strictEqual(onDisk.duration_seconds, narrationSafeSceneDuration(6.0))
    // Scoped to this scene only — 001/003/004 untouched by 002's regeneration
    assert.strictEqual(sceneOnDisk('001').audio_duration, 5.1, 'other scenes untouched')
    console.log('PASS: FT-1/FT-4 conflict reset — is_manual_offset cleared, duration re-synced, manual_adjustments_reset: true, scoped to this scene only')

    // 10. A scene with NO manual adjustments reports manual_adjustments_reset: false
    await patchScript('003', VALID_TEXT_2)
    behavior.duration = 3.4
    res  = await regenVoice('003')
    body = await res.json()
    assert.strictEqual(res.status, 200)
    assert.strictEqual(body.manual_adjustments_reset, false, 'no manual adjustments → no reset warning')
    console.log('PASS: no manual adjustments → manual_adjustments_reset: false (no spurious warning)')

    // ════ Auto vs manual mode sequences (the exact endpoint sequences the client fires) ═══

    // 11. Auto mode = PATCH /script then POST /regenerate-voice in sequence
    behavior.bytes = 'AUTO_MODE_TAKE'; behavior.duration = 2.8
    res = await patchScript('001', 'Auto mode rewrote this scene narration completely today.')
    assert.strictEqual(res.status, 200)
    assert.strictEqual(sceneOnDisk('001').voice_stale, true, 'stale between the two calls')
    res  = await regenVoice('001')
    body = await res.json()
    assert.strictEqual(res.status, 200)
    assert.strictEqual(body.scene.voice_stale, false)
    assert.strictEqual(body.scene.script_excerpt, 'Auto mode rewrote this scene narration completely today.')
    assert.strictEqual(audioBytes('scene_001.mp3'), 'AUTO_MODE_TAKE')
    console.log('PASS: auto-mode sequence (PATCH script → POST regenerate-voice) ends with new text + new audio + voice_stale false')

    // 12. Manual mode = PATCH /script only; audio untouched until the explicit regenerate
    const audio004Before = audioBytes('scene_004.mp3')
    const calls004Before = generateCalls.length
    res = await patchScript('004', 'Manual mode rewrote this scene narration but did not regenerate.')
    assert.strictEqual(res.status, 200)
    onDisk = sceneOnDisk('004')
    assert.strictEqual(onDisk.voice_stale, true, 'manual mode: stale flag shows the out-of-sync badge')
    assert.strictEqual(audioBytes('scene_004.mp3'), audio004Before, 'manual mode: audio untouched by the save')
    assert.strictEqual(generateCalls.length, calls004Before, 'manual mode: no generation fired by the save')
    // ...until the user explicitly clicks Regenerate Voice:
    behavior.bytes = 'MANUAL_MODE_TAKE'; behavior.duration = 3.9
    res  = await regenVoice('004')
    body = await res.json()
    assert.strictEqual(res.status, 200)
    assert.strictEqual(body.scene.voice_stale, false)
    assert.strictEqual(audioBytes('scene_004.mp3'), 'MANUAL_MODE_TAKE')
    console.log('PASS: manual-mode sequence — save alone changes no audio and fires no generation; explicit regenerate then completes it')

    // ════ Revert to generated ═══════════════════════════════════════════════════

    // 13. Revert restores BOTH the entry-time script and the original audio
    res  = await revertVoice('001')
    body = await res.json()
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(body)}`)
    assert.strictEqual(body.scene.script_excerpt, VALID_TEXT_1, 'script restored to Fine-Tune-entry text')
    assert.strictEqual(body.scene.original_script_excerpt, undefined, 'original marker cleared after revert')
    assert.strictEqual(body.scene.voice_stale, false, 'voice_stale cleared by revert')
    assert.strictEqual(audioBytes('scene_001.mp3'), 'ORIGINAL_AUDIO_001', 'live audio restored from the *_original.mp3 backup')
    assert(fs.existsSync(path.join(audioDir, 'scene_001_original.mp3')), 'backup file kept (still the true original for any later edit)')
    assert.strictEqual(body.scene.duration_seconds, narrationSafeSceneDuration(behavior.duration), 'duration re-synced from the restored file')
    console.log('PASS: revert-voice restores script_excerpt AND audio from backup, clears voice_stale, keeps the backup')

    // 14. Nothing to revert → 400 (scene 005 was never edited or regenerated).
    // Note: a scene that HAS been edited stays revertible forever — the *_original.mp3
    // backup is deliberately kept after a revert, so revert is idempotent, never a 400.
    res  = await revertVoice('005')
    body = await res.json()
    assert.strictEqual(res.status, 400, `expected 400, got ${res.status}: ${JSON.stringify(body)}`)
    assert(/Nothing to revert/.test(body.error))
    console.log('PASS: revert-voice on a never-edited scene → 400 (nothing to revert)')

    // 14b. Reverting an already-reverted scene is idempotent (backup kept by design)
    res = await revertVoice('001')
    assert.strictEqual(res.status, 200, 'revert is repeatable — the kept backup still restores the original')
    assert.strictEqual(audioBytes('scene_001.mp3'), 'ORIGINAL_AUDIO_001')
    console.log('PASS: revert-voice is idempotent — kept backup restores the original on repeat calls')

    console.log('\nAll voiceRegenerate.test.js checks passed.')
  } finally {
    elevenlabsService.generateAudio    = realGenerateAudio
    elevenlabsService.getAudioDuration = realGetAudioDuration
    server.close()
    cleanup()
  }
}

run().catch(err => {
  console.error('\nFAIL:', err.message)
  process.exit(1)
})
