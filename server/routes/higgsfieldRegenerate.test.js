// Plain Node integration test — no framework wired into this repo yet. Run with:
//   node server/routes/higgsfieldRegenerate.test.js
//
// The happy path needs the real Higgsfield CLI and Claude API, which is inappropriate for an
// automated test (slow, costs money, non-deterministic, needs live credentials). Instead this
// monkey-patches generateImage/enhancePrompt/downloadImage on their module.exports objects —
// higgsfieldRegenerate.js deliberately calls them via `higgsfieldService.generateImage(...)`
// etc. (not destructured) specifically so a test can swap the function out per-call. Every
// patch is restored in a `finally` block so it never leaks into another test file's run.
const assert  = require('assert')
const fs      = require('fs')
const path    = require('path')
const express = require('express')

const PROJECTS_DIR = path.resolve(__dirname, '../../projects')
const TEST_PROJECT = '__test_ft3_regenerate__'
const testDir       = path.join(PROJECTS_DIR, TEST_PROJECT)
const scenesPath    = path.join(testDir, 'scenes.json')
const assetsDir     = path.join(testDir, 'assets')

const higgsfieldService = require('../services/higgsfield')
const promptEnhancer    = require('../services/promptEnhancer')
const imageDownloadSvc  = require('../services/imageDownload')

function setup() {
  fs.mkdirSync(assetsDir, { recursive: true })
  const scenes = [
    { scene_id: '001', script_excerpt: 'a documentary scene', shot_type: 'image', duration_seconds: 5, transition_out: 'dissolve', higgsfield_prompt: 'traders on the floor', image_path: `/projects/${TEST_PROJECT}/assets/001.png` },
    { scene_id: '002', script_excerpt: 'no prompt yet', shot_type: 'image', duration_seconds: 5, transition_out: 'dissolve', higgsfield_prompt: '' },
    { scene_id: '003', script_excerpt: 'a motion graphic scene', shot_type: 'motion_graphic', duration_seconds: 5, transition_out: 'dissolve' },
  ]
  fs.writeFileSync(scenesPath, JSON.stringify(scenes, null, 2))
  fs.writeFileSync(path.join(assetsDir, '001.png'), 'ORIGINAL_HIGGSFIELD_BYTES')
}

function cleanup() {
  fs.rmSync(testDir, { recursive: true, force: true })
}

async function run() {
  cleanup()
  setup()

  const app = express()
  app.use(express.json())
  app.use('/api/higgsfield', require('./higgsfieldRegenerate'))
  const server = app.listen(0)
  const port   = server.address().port
  const base   = `http://localhost:${port}/api/higgsfield`

  const regenerate = (sceneId, body = { projectId: TEST_PROJECT }) => fetch(`${base}/regenerate/${sceneId}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  // Save originals so every patched function is restored even if an assertion throws.
  const originalGenerateImage = higgsfieldService.generateImage
  const originalEnhancePrompt = promptEnhancer.enhancePrompt
  const originalDownloadImage = imageDownloadSvc.downloadImage

  try {
    // ── Validation paths — no fake needed, these never reach the generation pipeline ──
    let res  = await regenerate('001', {}) // missing projectId
    assert.strictEqual(res.status, 400)
    console.log('PASS: missing projectId returns 400')

    res = await regenerate('999') // unknown scene
    assert.strictEqual(res.status, 404)
    console.log('PASS: unknown scene_id returns 404')

    res = await regenerate('001', { projectId: '__no_such_project__' })
    assert.strictEqual(res.status, 404)
    console.log('PASS: unknown projectId returns 404')

    res = await regenerate('003') // motion_graphic, not image
    let body = await res.json()
    assert.strictEqual(res.status, 400)
    assert(/regeneration only applies to image scenes/.test(body.error))
    console.log('PASS: non-image scene rejected (400)')

    res = await regenerate('002') // image scene, empty higgsfield_prompt
    body = await res.json()
    assert.strictEqual(res.status, 400)
    assert(/no higgsfield_prompt/.test(body.error))
    console.log('PASS: image scene with no prompt rejected (400)')

    // ── Happy path — fake the three external calls, verify orchestration + persistence ──
    let promptSeenBy = { enhance: null, generate: null }
    promptEnhancer.enhancePrompt = async (scene) => {
      promptSeenBy.enhance = scene.higgsfield_prompt
      return `${scene.higgsfield_prompt}, enhanced`
    }
    higgsfieldService.generateImage = async (prompt) => {
      promptSeenBy.generate = prompt
      return 'https://fake.higgsfield.test/generated-image.png'
    }
    imageDownloadSvc.downloadImage = async (url, dest) => {
      fs.writeFileSync(dest, `DOWNLOADED_FROM:${url}`)
    }

    res  = await regenerate('001')
    body = await res.json()
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(body)}`)
    assert.strictEqual(body.image_path, `/projects/${TEST_PROJECT}/assets/001.png`, 'same location as before — filename preserved')
    console.log('PASS: happy-path regenerate returns 200 with the (same-location) image_path')

    assert.strictEqual(promptSeenBy.enhance, 'traders on the floor', 'enhancePrompt must receive the scene\'s own prompt from scenes.json, not a client-supplied one')
    assert.strictEqual(promptSeenBy.generate, 'traders on the floor, enhanced', 'generateImage must receive enhancePrompt\'s output')
    console.log('PASS: pipeline reused in order — enhancePrompt(scene) -> generateImage(enhanced) — matching processScene()')

    assert.strictEqual(fs.readFileSync(path.join(assetsDir, '001.png'), 'utf8'), 'DOWNLOADED_FROM:https://fake.higgsfield.test/generated-image.png')
    console.log('PASS: downloadImage wrote the generated URL\'s content to the existing image location')

    const backupPath = path.join(assetsDir, 'scene_001_original.jpg')
    assert.ok(fs.existsSync(backupPath))
    assert.strictEqual(fs.readFileSync(backupPath, 'utf8'), 'ORIGINAL_HIGGSFIELD_BYTES', 'true original backed up before regeneration overwrote it')
    console.log('PASS: original image backed up before the regenerated image overwrote it')

    let onDisk = JSON.parse(fs.readFileSync(scenesPath, 'utf8'))
    assert.strictEqual(onDisk[0].image_path, `/projects/${TEST_PROJECT}/assets/001.png`)
    assert.strictEqual(onDisk[0].higgsfield_prompt, 'traders on the floor', 'regenerate must not mutate the stored prompt, only image_path')
    console.log('PASS: scenes.json persists the regenerated image_path and leaves the prompt untouched')

    // ── Second regenerate must not re-backup (same guarantee as the manual-upload endpoint) ──
    imageDownloadSvc.downloadImage = async (url, dest) => {
      fs.writeFileSync(dest, `SECOND_GENERATION:${url}`)
    }
    res = await regenerate('001')
    assert.strictEqual(res.status, 200)
    assert.strictEqual(fs.readFileSync(backupPath, 'utf8'), 'ORIGINAL_HIGGSFIELD_BYTES', 'true original must survive a second regenerate too')
    console.log('PASS: a second regenerate does not disturb the existing backup')

    // ── Scene 002/003 were never touched by any of the above ──────────────────
    assert.strictEqual(onDisk[1].image_path, undefined, 'scene 002 (rejected — no prompt) must be untouched')
    assert.strictEqual(onDisk[2].image_path, undefined, 'scene 003 (rejected — not an image scene) must be untouched')
    console.log('PASS: only the targeted scene was ever modified — no other scene touched or re-triggered')

    // ── Failure inside generateImage propagates as a clean 500, nothing persisted ──
    higgsfieldService.generateImage = async () => { throw new Error('Higgsfield CLI exploded') }
    res  = await regenerate('001')
    body = await res.json()
    assert.strictEqual(res.status, 500)
    assert(/Higgsfield CLI exploded/.test(body.error))
    console.log('PASS: a generation failure returns a clean 500 with the underlying error message')

    console.log('\nAll higgsfieldRegenerate.test.js checks passed.')
  } finally {
    higgsfieldService.generateImage = originalGenerateImage
    promptEnhancer.enhancePrompt    = originalEnhancePrompt
    imageDownloadSvc.downloadImage  = originalDownloadImage
    server.close()
    cleanup()
  }
}

// FT-7: POST /api/higgsfield/regenerate-secondary/:sceneId — split-screen secondary panel.
async function runSecondaryRegenerateTests() {
  cleanup()
  fs.mkdirSync(assetsDir, { recursive: true })
  const scenes = [
    { scene_id: '001', script_excerpt: 'a documentary scene', shot_type: 'image', duration_seconds: 5, transition_out: 'dissolve', higgsfield_prompt: 'traders on the floor', image_path: `/projects/${TEST_PROJECT}/assets/001.png`, secondary_image_path: `/projects/${TEST_PROJECT}/assets/001_secondary.png`, secondary_source_scene_id: '002' },
    { scene_id: '002', script_excerpt: 'reuse source scene', shot_type: 'image', duration_seconds: 5, transition_out: 'dissolve', higgsfield_prompt: 'a second scene', image_path: `/projects/${TEST_PROJECT}/assets/002.png` },
    { scene_id: '003', script_excerpt: 'a motion graphic scene', shot_type: 'motion_graphic', duration_seconds: 5, transition_out: 'dissolve' },
  ]
  fs.writeFileSync(scenesPath, JSON.stringify(scenes, null, 2))
  fs.writeFileSync(path.join(assetsDir, '001.png'), 'PRIMARY_ORIGINAL_BYTES')
  fs.writeFileSync(path.join(assetsDir, '001_secondary.png'), 'SECONDARY_FROM_REUSE_BYTES') // as if reuse mode set this

  const app = express()
  app.use(express.json())
  app.use('/api/higgsfield', require('./higgsfieldRegenerate'))
  const server = app.listen(0)
  const port   = server.address().port
  const base   = `http://localhost:${port}/api/higgsfield`

  const regenerateSecondary = (sceneId, body) => fetch(`${base}/regenerate-secondary/${sceneId}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  const originalGenerateImage = higgsfieldService.generateImage
  const originalEnhancePrompt = promptEnhancer.enhancePrompt
  const originalDownloadImage = imageDownloadSvc.downloadImage

  try {
    // ── Validation paths ──
    let res  = await regenerateSecondary('001', { prompt: 'a lighthouse at dusk' }) // projectId omitted on purpose
    let body = await res.json()
    assert.strictEqual(res.status, 400)
    console.log('PASS: missing projectId returns 400')

    res = await regenerateSecondary('001', { projectId: TEST_PROJECT })
    body = await res.json()
    assert.strictEqual(res.status, 400)
    assert(/prompt required/.test(body.error))
    console.log('PASS: missing prompt returns 400')

    res = await regenerateSecondary('999', { projectId: TEST_PROJECT, prompt: 'x' })
    assert.strictEqual(res.status, 404)
    console.log('PASS: unknown scene_id returns 404')

    res = await regenerateSecondary('003', { projectId: TEST_PROJECT, prompt: 'x' })
    body = await res.json()
    assert.strictEqual(res.status, 400)
    assert(/split-screen only applies to image scenes/.test(body.error))
    console.log('PASS: non-image scene rejected (400)')

    // ── Happy path ──
    let promptSeenBy = { enhance: null, generate: null }
    promptEnhancer.enhancePrompt = async (scene) => {
      promptSeenBy.enhance = scene.higgsfield_prompt
      return `${scene.higgsfield_prompt}, enhanced`
    }
    higgsfieldService.generateImage = async (prompt) => {
      promptSeenBy.generate = prompt
      return 'https://fake.higgsfield.test/secondary-image.png'
    }
    imageDownloadSvc.downloadImage = async (url, dest) => {
      fs.writeFileSync(dest, `DOWNLOADED_FROM:${url}`)
    }

    res  = await regenerateSecondary('001', { projectId: TEST_PROJECT, prompt: 'a lighthouse at dusk' })
    body = await res.json()
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(body)}`)
    assert.strictEqual(body.secondary_image_path, `/projects/${TEST_PROJECT}/assets/001_secondary.png`, 'same location as before — filename preserved')
    console.log('PASS: happy-path regenerate-secondary returns 200 with the (same-location) secondary_image_path')

    assert.strictEqual(promptSeenBy.enhance, 'a lighthouse at dusk', 'enhancePrompt must receive the fresh user-supplied prompt, not the scene\'s own higgsfield_prompt')
    assert.strictEqual(promptSeenBy.generate, 'a lighthouse at dusk, enhanced')
    console.log('PASS: pipeline reused in order with the USER-SUPPLIED prompt, not the scene\'s own stored prompt')

    assert.strictEqual(fs.readFileSync(path.join(assetsDir, '001_secondary.png'), 'utf8'), 'DOWNLOADED_FROM:https://fake.higgsfield.test/secondary-image.png')
    console.log('PASS: downloadImage wrote the generated content to the secondary panel\'s location')

    // Primary panel completely unaffected
    assert.strictEqual(fs.readFileSync(path.join(assetsDir, '001.png'), 'utf8'), 'PRIMARY_ORIGINAL_BYTES', 'the primary panel image must be completely untouched')
    console.log('PASS: only the secondary panel is affected — the primary panel image is untouched')

    const secondaryBackupPath = path.join(assetsDir, 'scene_001_secondary_original.jpg')
    assert.ok(fs.existsSync(secondaryBackupPath), 'the prior secondary image must be backed up before regeneration overwrote it')
    assert.strictEqual(fs.readFileSync(secondaryBackupPath, 'utf8'), 'SECONDARY_FROM_REUSE_BYTES')
    const primaryBackupPath = path.join(assetsDir, 'scene_001_original.jpg')
    assert.ok(!fs.existsSync(primaryBackupPath), 'the primary panel\'s own backup file must not be created by a secondary-panel regenerate')
    console.log('PASS: the secondary panel backup uses a distinct filename and never collides with (or creates) the primary panel\'s backup')

    let onDisk = JSON.parse(fs.readFileSync(scenesPath, 'utf8'))
    assert.strictEqual(onDisk[0].secondary_image_path, `/projects/${TEST_PROJECT}/assets/001_secondary.png`)
    assert.strictEqual(onDisk[0].secondary_source_scene_id, null, 'a regenerated secondary panel is no longer derived from any other scene\'s image')
    assert.strictEqual(onDisk[0].image_path, `/projects/${TEST_PROJECT}/assets/001.png`, 'primary image_path untouched')
    console.log('PASS: scenes.json persists the new secondary_image_path, clears secondary_source_scene_id, and leaves everything else untouched')

    // Scene 002 (the original reuse source) is completely unaffected by any of the above
    assert.strictEqual(onDisk[1].image_path, `/projects/${TEST_PROJECT}/assets/002.png`)
    console.log('PASS: scene 002 (the prior reuse source) is untouched')

    // ── Failure inside generateImage propagates as a clean 500, nothing persisted ──
    higgsfieldService.generateImage = async () => { throw new Error('Higgsfield CLI exploded') }
    res  = await regenerateSecondary('001', { projectId: TEST_PROJECT, prompt: 'x' })
    body = await res.json()
    assert.strictEqual(res.status, 500)
    assert(/Higgsfield CLI exploded/.test(body.error))
    console.log('PASS: a generation failure returns a clean 500 with the underlying error message')

    console.log('\nAll regenerate-secondary checks passed.')
  } finally {
    higgsfieldService.generateImage = originalGenerateImage
    promptEnhancer.enhancePrompt    = originalEnhancePrompt
    imageDownloadSvc.downloadImage  = originalDownloadImage
    server.close()
    cleanup()
  }
}

run()
  .then(runSecondaryRegenerateTests)
  .catch(err => {
    console.error('TEST FAILURE:', err)
    cleanup()
    process.exit(1)
  })
