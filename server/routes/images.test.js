// Plain Node integration test — no framework wired into this repo yet. Run with:
//   node server/routes/images.test.js
// Requires Node 18+ for global fetch/FormData/Blob.
const assert  = require('assert')
const fs      = require('fs')
const path    = require('path')
const express = require('express')

const PROJECTS_DIR = path.resolve(__dirname, '../../projects')
const TEST_PROJECT = '__test_ft3_images__'
const testDir       = path.join(PROJECTS_DIR, TEST_PROJECT)
const scenesPath    = path.join(testDir, 'scenes.json')
const assetsDir     = path.join(testDir, 'assets')

function setup() {
  fs.mkdirSync(assetsDir, { recursive: true })
  const scenes = [
    { scene_id: '001', script_excerpt: 'has an existing image', shot_type: 'image', duration_seconds: 5, transition_out: 'dissolve', image_path: `/projects/${TEST_PROJECT}/assets/001.png` },
    { scene_id: '002', script_excerpt: 'never generated an image yet', shot_type: 'image', duration_seconds: 5, transition_out: 'dissolve' },
    { scene_id: '003', script_excerpt: 'a motion graphic scene', shot_type: 'motion_graphic', duration_seconds: 5, transition_out: 'dissolve' },
  ]
  fs.writeFileSync(scenesPath, JSON.stringify(scenes, null, 2))
  fs.writeFileSync(path.join(assetsDir, '001.png'), 'ORIGINAL_HIGGSFIELD_BYTES')
}

function cleanup() {
  fs.rmSync(testDir, { recursive: true, force: true })
}

function pngFile(name, contents) {
  return new File([Buffer.from(contents)], name, { type: 'image/png' })
}

async function run() {
  cleanup()
  setup()

  const app = express()
  app.use(express.json())
  app.use('/api/images', require('./images'))
  const server = app.listen(0)
  const port   = server.address().port
  const base   = `http://localhost:${port}/api/images`

  const replace = (sceneId, { file, projectId = TEST_PROJECT } = {}) => {
    const formData = new FormData()
    formData.append('projectId', projectId)
    if (file) formData.append('image', file)
    return fetch(`${base}/${sceneId}/replace`, { method: 'POST', body: formData })
  }

  try {
    // 1. Valid upload replacing an existing image — same filename/location, backup created
    let res  = await replace('001', { file: pngFile('replacement.png', 'REPLACEMENT_BYTES') })
    let body = await res.json()
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(body)}`)
    assert.strictEqual(body.image_path, `/projects/${TEST_PROJECT}/assets/001.png`, 'image_path should stay at the same location')
    console.log('PASS: valid upload returns 200 with the (unchanged) image_path')

    assert.strictEqual(fs.readFileSync(path.join(assetsDir, '001.png'), 'utf8'), 'REPLACEMENT_BYTES', 'the live file must contain the uploaded bytes')
    const backupPath = path.join(assetsDir, 'scene_001_original.jpg')
    assert.ok(fs.existsSync(backupPath), 'backup must be created on first replace')
    assert.strictEqual(fs.readFileSync(backupPath, 'utf8'), 'ORIGINAL_HIGGSFIELD_BYTES', 'backup must contain the pre-upload (true original) bytes')
    console.log('PASS: original Higgsfield image backed up to scene_001_original.jpg before overwrite')

    let onDisk = JSON.parse(fs.readFileSync(scenesPath, 'utf8'))
    assert.strictEqual(onDisk[0].image_path, `/projects/${TEST_PROJECT}/assets/001.png`, 'scenes.json must reflect the (unchanged) image_path')
    console.log('PASS: scenes.json persists image_path after upload')

    // 2. Second upload on the same scene — must NOT re-backup (true original preserved)
    res  = await replace('001', { file: pngFile('replacement2.png', 'SECOND_REPLACEMENT_BYTES') })
    body = await res.json()
    assert.strictEqual(res.status, 200)
    assert.strictEqual(fs.readFileSync(path.join(assetsDir, '001.png'), 'utf8'), 'SECOND_REPLACEMENT_BYTES')
    assert.strictEqual(fs.readFileSync(backupPath, 'utf8'), 'ORIGINAL_HIGGSFIELD_BYTES', 'true original must still be intact after a second swap')
    console.log('PASS: a second swap overwrites the live file but never touches the existing backup')

    // 3. Scene with no prior image — a new filename is derived from scene_id + upload extension
    res  = await replace('002', { file: pngFile('first-ever.png', 'FIRST_EVER_BYTES') })
    body = await res.json()
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(body)}`)
    assert.strictEqual(body.image_path, `/projects/${TEST_PROJECT}/assets/002.png`)
    assert.ok(fs.existsSync(path.join(assetsDir, '002.png')))
    assert.ok(!fs.existsSync(path.join(assetsDir, 'scene_002_original.jpg')), 'no backup expected — there was nothing to back up')
    console.log('PASS: first-ever image for a scene gets a new filename and no spurious backup')

    // 4. Unsupported file type — rejected
    const badFile = new File([Buffer.from('not an image')], 'note.txt', { type: 'text/plain' })
    res = await replace('001', { file: badFile })
    assert.strictEqual(res.status, 400)
    console.log('PASS: non-image file type is rejected (400)')

    // 5. No file attached — rejected
    res = await replace('001', {})
    body = await res.json()
    assert.strictEqual(res.status, 400)
    assert(/image file required/.test(body.error))
    console.log('PASS: missing file is rejected (400)')

    // 6. Missing projectId — rejected
    const formData = new FormData()
    formData.append('image', pngFile('x.png', 'x'))
    res = await fetch(`${base}/001/replace`, { method: 'POST', body: formData })
    assert.strictEqual(res.status, 400)
    console.log('PASS: missing projectId is rejected (400)')

    // 7. Unknown scene — 404
    res = await replace('999', { file: pngFile('x.png', 'x') })
    assert.strictEqual(res.status, 404)
    console.log('PASS: unknown scene_id returns 404')

    // 8. Unknown project — 404
    res = await replace('001', { file: pngFile('x.png', 'x'), projectId: '__no_such_project__' })
    assert.strictEqual(res.status, 404)
    console.log('PASS: unknown projectId returns 404')

    // ── Schema validity ──────────────────────────────────────────────────────
    onDisk = JSON.parse(fs.readFileSync(scenesPath, 'utf8'))
    for (const scene of onDisk) {
      assert.ok(scene.scene_id && scene.script_excerpt && scene.shot_type, 'required fields intact')
    }
    assert.strictEqual(onDisk[2].image_path, undefined, 'the untouched motion_graphic scene must be unaffected')
    console.log('PASS: schema valid on all scenes; untouched scenes unaffected')

    console.log('\nAll images.test.js checks passed.')
  } finally {
    server.close()
    cleanup()
  }
}

run().catch(err => {
  console.error('TEST FAILURE:', err)
  cleanup()
  process.exit(1)
})
