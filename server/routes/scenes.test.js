// Plain Node integration test — no framework wired into this repo yet. Run with:
//   node server/routes/scenes.test.js
// Requires Node 18+ for global fetch.
const assert  = require('assert')
const fs      = require('fs')
const path    = require('path')
const express = require('express')

const PROJECTS_DIR = path.resolve(__dirname, '../../projects')
const TEST_PROJECT = '__test_ft1_scenes__'
const testDir       = path.join(PROJECTS_DIR, TEST_PROJECT)
const scenesPath    = path.join(testDir, 'scenes.json')

function setup() {
  fs.mkdirSync(testDir, { recursive: true })
  const scenes = [
    {
      scene_id: '001', script_excerpt: 'Test scene one', shot_type: 'image',
      duration_seconds: 5, audio_duration: 3.5, transition_out: 'dissolve',
    },
    {
      // No audio yet, and starts short enough to exercise the dip-transition clamp
      // without needing to also change duration_seconds in the same request.
      scene_id: '002', script_excerpt: 'Test scene two', shot_type: 'image',
      duration_seconds: 0.5, transition_out: 'dissolve',
    },
  ]
  fs.writeFileSync(scenesPath, JSON.stringify(scenes, null, 2))
}

function cleanup() {
  fs.rmSync(testDir, { recursive: true, force: true })
}

async function run() {
  cleanup()
  setup()

  const app = express()
  app.use(express.json())
  app.use('/api/scenes', require('./scenes'))
  const server = app.listen(0)
  const port   = server.address().port
  const base   = `http://localhost:${port}/api/scenes`

  const patch = (sceneId, body) => fetch(`${base}/${sceneId}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ projectId: TEST_PROJECT, ...body }),
  })

  try {
    // 1. Valid update (duration + transition together)
    let res  = await patch('001', { duration_seconds: 6, transition_out: 'cut' })
    let body = await res.json()
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(body)}`)
    assert.strictEqual(body.scene.duration_seconds, 6)
    assert.strictEqual(body.scene.transition_out, 'cut')
    console.log('PASS: valid update returns 200 with updated scene')

    let onDisk = JSON.parse(fs.readFileSync(scenesPath, 'utf8'))
    assert.strictEqual(onDisk[0].duration_seconds, 6, 'change should persist to scenes.json')
    assert.strictEqual(onDisk[0].transition_out, 'cut')
    console.log('PASS: valid update persists to project scenes.json')

    // 2. Invalid duration below the narration-sync buffer (audio_duration 3.5 + 0.8 = 4.3 min)
    res  = await patch('001', { duration_seconds: 4.0 })
    body = await res.json()
    assert.strictEqual(res.status, 400, `expected 400, got ${res.status}`)
    assert(/narration-sync buffer/.test(body.error), `expected buffer error, got: ${body.error}`)
    console.log('PASS: rejects duration below narration-sync buffer (400)')

    onDisk = JSON.parse(fs.readFileSync(scenesPath, 'utf8'))
    assert.strictEqual(onDisk[0].duration_seconds, 6, 'rejected update must not be persisted')
    console.log('PASS: rejected duration update was not persisted')

    // 2b. Invalid duration above the 8s max
    res  = await patch('001', { duration_seconds: 9 })
    body = await res.json()
    assert.strictEqual(res.status, 400)
    assert(/<= 8/.test(body.error), `expected max-duration error, got: ${body.error}`)
    console.log('PASS: rejects duration above 8s max (400)')

    // 3. Invalid dip transition on a scene too short for it (scene 002 is 0.5s on disk = 15 frames < 18 required)
    res  = await patch('002', { transition_out: 'dip_black' })
    body = await res.json()
    assert.strictEqual(res.status, 400, `expected 400, got ${res.status}`)
    assert(/dip transition/.test(body.error), `expected dip-transition error, got: ${body.error}`)
    console.log('PASS: rejects dip transition on too-short scene (400)')

    onDisk = JSON.parse(fs.readFileSync(scenesPath, 'utf8'))
    assert.strictEqual(onDisk[1].transition_out, 'dissolve', 'rejected transition must not be persisted')
    console.log('PASS: rejected dip transition was not persisted')

    // 4. Lengthen scene 002, then the same dip transition should succeed
    res  = await patch('002', { duration_seconds: 2 })
    assert.strictEqual(res.status, 200)
    res  = await patch('002', { transition_out: 'dip_black' })
    body = await res.json()
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(body)}`)
    assert.strictEqual(body.scene.transition_out, 'dip_black')
    console.log('PASS: accepts dip transition once scene is long enough')

    // 5. audio_mix_override round-trips and stays fully optional
    res  = await patch('001', { audio_mix_override: { narration: 1.0, music: 0.12, ambient: 0.06 } })
    body = await res.json()
    assert.strictEqual(res.status, 200)
    assert.deepStrictEqual(body.scene.audio_mix_override, { narration: 1.0, music: 0.12, ambient: 0.06 })
    console.log('PASS: audio_mix_override round-trips')

    onDisk = JSON.parse(fs.readFileSync(scenesPath, 'utf8'))
    assert.strictEqual(onDisk[1].audio_mix_override, undefined, 'scene 002 must have no audio_mix_override unless explicitly set')
    console.log('PASS: audio_mix_override stays absent on scenes that never set it (optional field)')

    // 5b. Out-of-range audio_mix_override value rejected
    res  = await patch('001', { audio_mix_override: { narration: 1.5 } })
    body = await res.json()
    assert.strictEqual(res.status, 400)
    assert(/audio_mix_override\.narration/.test(body.error))
    console.log('PASS: rejects out-of-range audio_mix_override value (400)')

    // 6. Revert via null clears the field entirely (used by "Revert to generated")
    res  = await patch('001', { audio_mix_override: null })
    body = await res.json()
    assert.strictEqual(res.status, 200)
    assert.strictEqual(body.scene.audio_mix_override, undefined, 'audio_mix_override should be removed, not stored as null')
    console.log('PASS: audio_mix_override: null removes the override entirely')

    // 7. Unknown scene -> 404
    res = await patch('999', { duration_seconds: 5 })
    assert.strictEqual(res.status, 404)
    console.log('PASS: unknown scene_id returns 404')

    // 8. Unknown project -> 404
    res = await fetch(`${base}/001`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: '__no_such_project__', duration_seconds: 5 }),
    })
    assert.strictEqual(res.status, 404)
    console.log('PASS: unknown projectId returns 404')

    // 9. Missing projectId -> 400
    res = await fetch(`${base}/001`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration_seconds: 5 }),
    })
    assert.strictEqual(res.status, 400)
    console.log('PASS: missing projectId returns 400')

    // 10. No updatable fields -> 400
    res = await fetch(`${base}/001`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: TEST_PROJECT }),
    })
    assert.strictEqual(res.status, 400)
    console.log('PASS: empty update body returns 400')

    // ── Schema validity after every operation above ──────────────────────────
    onDisk = JSON.parse(fs.readFileSync(scenesPath, 'utf8'))
    for (const scene of onDisk) {
      assert.ok(scene.scene_id, 'scene_id missing')
      assert.ok(scene.script_excerpt, 'script_excerpt missing')
      assert.ok(scene.shot_type, 'shot_type missing')
      assert.ok(typeof scene.duration_seconds === 'number', 'duration_seconds missing/invalid')
      assert.ok(['dissolve', 'dip_black', 'dip_white', 'cut'].includes(scene.transition_out), 'transition_out invalid')
    }
    assert.strictEqual(onDisk[1].audio_mix_override, undefined, 'scene 002 audio_mix_override still optional at end of run')
    console.log('PASS: schema valid on all scenes after every Fine-Tune operation (required fields intact, audio_mix_override optional)')

    console.log('\nAll scenes.test.js checks passed.')
  } finally {
    server.close()
    cleanup()
  }
}

// render.js overwrites the same scenes.json path with a wrapped
// { scenes, imagePaths, selectedClips, audio, audioSpecs } object after a render runs.
// This endpoint must keep working — and must not drop the sibling keys — against that shape too.
async function runWrappedShapeTest() {
  cleanup()
  fs.mkdirSync(testDir, { recursive: true })
  const wrapped = {
    scenes: [{ scene_id: '001', script_excerpt: 'wrapped scene', shot_type: 'image', duration_seconds: 5, transition_out: 'dissolve' }],
    imagePaths: { '001': '/projects/x/assets/001.png' },
    selectedClips: {},
    audio: null,
    audioSpecs: [],
  }
  fs.writeFileSync(scenesPath, JSON.stringify(wrapped, null, 2))

  const app = express()
  app.use(express.json())
  app.use('/api/scenes', require('./scenes'))
  const server = app.listen(0)
  const port   = server.address().port
  const base   = `http://localhost:${port}/api/scenes`

  try {
    const res  = await fetch(`${base}/001`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: TEST_PROJECT, duration_seconds: 6 }),
    })
    const body = await res.json()
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(body)}`)
    assert.strictEqual(body.scene.duration_seconds, 6)

    const onDisk = JSON.parse(fs.readFileSync(scenesPath, 'utf8'))
    assert.ok(!Array.isArray(onDisk), 'wrapped shape must be preserved, not flattened to an array')
    assert.strictEqual(onDisk.scenes[0].duration_seconds, 6, 'scene update must persist inside the wrapped object')
    assert.deepStrictEqual(onDisk.imagePaths, wrapped.imagePaths, 'sibling keys (imagePaths etc.) must survive untouched')
    console.log('PASS: PATCH works against the wrapped scenes.json shape written by render.js and preserves sibling keys')
  } finally {
    server.close()
    cleanup()
  }
}

// FT-2: POST /api/scenes/reorder — array order changes, scene_id values never do.
async function runReorderTests() {
  cleanup()
  fs.mkdirSync(testDir, { recursive: true })
  const scenes = [
    { scene_id: 'A', script_excerpt: 'scene A', shot_type: 'image', duration_seconds: 5, transition_out: 'dissolve', audio_path: '/projects/x/audio/scene_A.mp3', image_path: '/projects/x/assets/A.png' },
    { scene_id: 'B', script_excerpt: 'scene B', shot_type: 'image', duration_seconds: 5, transition_out: 'dip_black', audio_path: '/projects/x/audio/scene_B.mp3', image_path: '/projects/x/assets/B.png' },
    { scene_id: 'D', script_excerpt: 'scene D', shot_type: 'image', duration_seconds: 5, transition_out: 'cut', audio_path: '/projects/x/audio/scene_D.mp3', image_path: '/projects/x/assets/D.png' },
  ]
  fs.writeFileSync(scenesPath, JSON.stringify(scenes, null, 2))

  const app = express()
  app.use(express.json())
  app.use('/api/scenes', require('./scenes'))
  const server = app.listen(0)
  const port   = server.address().port
  const base   = `http://localhost:${port}/api/scenes`

  const reorder = (order) => fetch(`${base}/reorder`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ projectId: TEST_PROJECT, order }),
  })

  try {
    // 1. Valid reorder — confirm persisted order matches submission exactly
    let res  = await reorder(['B', 'D', 'A'])
    let body = await res.json()
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(body)}`)
    assert.deepStrictEqual(body.scenes.map(s => s.scene_id), ['B', 'D', 'A'])
    console.log('PASS: valid reorder returns 200 with the new order')

    let onDisk = JSON.parse(fs.readFileSync(scenesPath, 'utf8'))
    assert.deepStrictEqual(onDisk.map(s => s.scene_id), ['B', 'D', 'A'], 'reordered array must persist to scenes.json')
    console.log('PASS: reorder persists the new array order to disk')

    // scene_id values themselves are untouched, and file references travel with their scene
    const byId = Object.fromEntries(onDisk.map(s => [s.scene_id, s]))
    assert.strictEqual(byId.A.audio_path, '/projects/x/audio/scene_A.mp3')
    assert.strictEqual(byId.B.image_path, '/projects/x/assets/B.png')
    assert.strictEqual(byId.D.transition_out, 'cut')
    console.log('PASS: scene_id values and per-scene file references (audio_path/image_path) are unchanged by reorder — only array position moved')

    // 2. Mismatched scene_id set — missing a scene — rejected, not silently accepted
    res  = await reorder(['B', 'D']) // missing A
    body = await res.json()
    assert.strictEqual(res.status, 400, `expected 400, got ${res.status}`)
    assert(body.errors.some(e => /missing/.test(e)), `expected a "missing" error among: ${JSON.stringify(body.errors)}`)
    console.log('PASS: reorder missing a scene_id is rejected (400)')

    onDisk = JSON.parse(fs.readFileSync(scenesPath, 'utf8'))
    assert.deepStrictEqual(onDisk.map(s => s.scene_id), ['B', 'D', 'A'], 'rejected reorder must not be persisted')
    console.log('PASS: rejected (missing-scene) reorder was not persisted')

    // 2b. Extra/unknown scene_id — rejected
    res  = await reorder(['B', 'D', 'A', 'Z'])
    body = await res.json()
    assert.strictEqual(res.status, 400)
    assert(body.errors.some(e => /unknown scene_id/.test(e)), `expected an "unknown scene_id" error among: ${JSON.stringify(body.errors)}`)
    console.log('PASS: reorder with an unknown scene_id is rejected (400)')

    // 2c. Duplicate scene_id within the submitted order — rejected
    res  = await reorder(['B', 'B', 'D'])
    body = await res.json()
    assert.strictEqual(res.status, 400)
    assert(/duplicate/.test(body.error), `expected "duplicate" error, got: ${body.error}`)
    console.log('PASS: reorder with a duplicate scene_id is rejected (400)')

    onDisk = JSON.parse(fs.readFileSync(scenesPath, 'utf8'))
    assert.deepStrictEqual(onDisk.map(s => s.scene_id), ['B', 'D', 'A'], 'all rejected reorders must leave the persisted order untouched')
    console.log('PASS: no rejected reorder variant mutated the persisted order')

    // 3. Empty / malformed order -> 400
    res = await reorder([])
    assert.strictEqual(res.status, 400)
    res = await fetch(`${base}/reorder`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: TEST_PROJECT }), // order missing entirely
    })
    assert.strictEqual(res.status, 400)
    console.log('PASS: empty/missing order array is rejected (400)')

    // 4. Unknown project -> 404
    res = await fetch(`${base}/reorder`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: '__no_such_project__', order: ['A', 'B', 'D'] }),
    })
    assert.strictEqual(res.status, 404)
    console.log('PASS: reorder against an unknown project returns 404')

    // 5. Revert-style reorder back to original order works too
    res  = await reorder(['A', 'B', 'D'])
    body = await res.json()
    assert.strictEqual(res.status, 200)
    assert.deepStrictEqual(body.scenes.map(s => s.scene_id), ['A', 'B', 'D'])
    console.log('PASS: reordering back to the original order succeeds (exercises the same path "Revert order" uses)')

    console.log('\nAll reorder checks passed.')
  } finally {
    server.close()
    cleanup()
  }
}

// FT-4: PATCH /api/scenes/:sceneId/boundary — manual J-cut/L-cut offset override.
async function runBoundaryTests() {
  cleanup()
  fs.mkdirSync(testDir, { recursive: true })
  const scenes = [
    { scene_id: 'A', script_excerpt: 'scene A', shot_type: 'image', duration_seconds: 5, transition_out: 'dissolve', audio_cut: 'l_cut', audio_duration: 3.0 },
    { scene_id: 'B', script_excerpt: 'scene B', shot_type: 'image', duration_seconds: 5, transition_out: 'dissolve', audio_cut: 'j_cut', audio_duration: 5.0 },
    { scene_id: 'C', script_excerpt: 'scene C (last scene)', shot_type: 'image', duration_seconds: 5, transition_out: 'dissolve', audio_duration: 2.0 },
  ]
  fs.writeFileSync(scenesPath, JSON.stringify(scenes, null, 2))

  const app = express()
  app.use(express.json())
  app.use('/api/scenes', require('./scenes'))
  const server = app.listen(0)
  const port   = server.address().port
  const base   = `http://localhost:${port}/api/scenes`

  const patchBoundary = (sceneId, body) => fetch(`${base}/${sceneId}/boundary`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ projectId: TEST_PROJECT, ...body }),
  })

  try {
    // 1. Valid offset within bounds — A/B: min(3.0, 5.0) - 0.2 = 2.8 max
    let res  = await patchBoundary('A', { lcut_offset: 1.2, jcut_offset: 0.5, is_manual_offset: true })
    let body = await res.json()
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(body)}`)
    assert.strictEqual(body.scene.lcut_offset, 1.2)
    assert.strictEqual(body.scene.jcut_offset, 0.5)
    assert.strictEqual(body.scene.is_manual_offset, true)
    assert.strictEqual(body.scene.boundary_partner_scene_id, 'B', 'must record which next-scene neighbor this was calibrated against')
    console.log('PASS: valid boundary offset within bounds returns 200 and persists all fields')

    let onDisk = JSON.parse(fs.readFileSync(scenesPath, 'utf8'))
    assert.strictEqual(onDisk[0].lcut_offset, 1.2, 'must persist to scenes.json')
    console.log('PASS: boundary offset persists to scenes.json')

    // 2. Offset exceeding the clamp — rejected (not silently clamped or accepted)
    res  = await patchBoundary('A', { lcut_offset: 2.81 })
    body = await res.json()
    assert.strictEqual(res.status, 400, `expected 400, got ${res.status}`)
    assert(/lcut_offset must be <= 2.8s/.test(body.error), `expected clamp error, got: ${body.error}`)
    console.log('PASS: offset exceeding the clamp is rejected (400), not silently overflowed')

    onDisk = JSON.parse(fs.readFileSync(scenesPath, 'utf8'))
    assert.strictEqual(onDisk[0].lcut_offset, 1.2, 'rejected update must not overwrite the previously-persisted value')
    console.log('PASS: rejected offset was not persisted (value from step 1 still intact)')

    // 2b. Negative offset — rejected
    res  = await patchBoundary('A', { jcut_offset: -0.5 })
    assert.strictEqual(res.status, 400)
    console.log('PASS: negative offset is rejected (400)')

    // 2c. Exactly at the clamp boundary — accepted
    res  = await patchBoundary('A', { lcut_offset: 2.8 })
    body = await res.json()
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(body)}`)
    console.log('PASS: offset exactly at the clamp boundary is accepted')

    // 3. 0.0 is a valid, intentional value
    res  = await patchBoundary('A', { lcut_offset: 0, jcut_offset: 0, is_manual_offset: true })
    body = await res.json()
    assert.strictEqual(res.status, 200)
    assert.strictEqual(body.scene.lcut_offset, 0)
    console.log('PASS: 0.0 is accepted as an intentional "no bleed" value, not treated as absent')

    // 4. Revert — is_manual_offset: false always succeeds regardless of stored offset values
    res  = await patchBoundary('A', { is_manual_offset: false })
    body = await res.json()
    assert.strictEqual(res.status, 200)
    assert.strictEqual(body.scene.is_manual_offset, false)
    console.log('PASS: revert (is_manual_offset: false) succeeds and clears manual mode')

    // 5. Last scene has no outgoing boundary — rejected
    res  = await patchBoundary('C', { lcut_offset: 0.5 })
    body = await res.json()
    assert.strictEqual(res.status, 400)
    assert(/last scene/.test(body.error))
    console.log('PASS: setting an offset on the last scene (no outgoing boundary) is rejected (400)')

    // 6. Unknown scene / project / missing projectId
    res = await patchBoundary('999', { lcut_offset: 0.1 })
    assert.strictEqual(res.status, 404)
    res = await fetch(`${base}/A/boundary`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: '__no_such_project__', lcut_offset: 0.1 }),
    })
    assert.strictEqual(res.status, 404)
    res = await fetch(`${base}/A/boundary`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lcut_offset: 0.1 }),
    })
    assert.strictEqual(res.status, 400)
    console.log('PASS: unknown scene_id (404), unknown projectId (404), and missing projectId (400) all handled')

    console.log('\nAll boundary checks passed.')
  } finally {
    server.close()
    cleanup()
  }
}

// FT-4: a reorder that breaks a manual boundary offset's adjacency must reset it, since the
// task explicitly requires "not silently keeping a now-meaningless manual value."
async function runReorderAdjacencyTests() {
  cleanup()
  fs.mkdirSync(testDir, { recursive: true })
  const scenes = [
    { scene_id: 'A', script_excerpt: 'A', shot_type: 'image', duration_seconds: 5, transition_out: 'dissolve', audio_duration: 3.0, is_manual_offset: true, boundary_partner_scene_id: 'B', lcut_offset: 1.0 },
    { scene_id: 'B', script_excerpt: 'B', shot_type: 'image', duration_seconds: 5, transition_out: 'dissolve', audio_duration: 5.0 },
    { scene_id: 'D', script_excerpt: 'D', shot_type: 'image', duration_seconds: 5, transition_out: 'dissolve', audio_duration: 4.0 },
  ]
  fs.writeFileSync(scenesPath, JSON.stringify(scenes, null, 2))

  const app = express()
  app.use(express.json())
  app.use('/api/scenes', require('./scenes'))
  const server = app.listen(0)
  const port   = server.address().port
  const base   = `http://localhost:${port}/api/scenes`

  const reorder = (order) => fetch(`${base}/reorder`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ projectId: TEST_PROJECT, order }),
  })

  try {
    // 1. Reorder that keeps A immediately followed by B — manual offset must survive
    let res  = await reorder(['D', 'A', 'B'])
    let body = await res.json()
    assert.strictEqual(res.status, 200)
    let sceneA = body.scenes.find(s => s.scene_id === 'A')
    assert.strictEqual(sceneA.is_manual_offset, true, 'A is still immediately followed by B — manual offset must survive')
    assert.strictEqual(sceneA.lcut_offset, 1.0)
    console.log('PASS: a reorder that preserves A->B adjacency leaves the manual boundary offset intact')

    // Reset fixture to the original order for a clean second scenario
    fs.writeFileSync(scenesPath, JSON.stringify(scenes, null, 2))

    // 2. Reorder that inserts D between A and B — breaks the adjacency the offset was for
    res  = await reorder(['A', 'D', 'B'])
    body = await res.json()
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(body)}`)
    sceneA = body.scenes.find(s => s.scene_id === 'A')
    assert.strictEqual(sceneA.is_manual_offset, false, 'A->B adjacency broke (D is now between them) — manual offset must reset')
    console.log('PASS: a reorder that breaks A->B adjacency resets is_manual_offset to false (not silently kept)')

    let onDisk = JSON.parse(fs.readFileSync(scenesPath, 'utf8'))
    const persistedA = onDisk.find(s => s.scene_id === 'A')
    assert.strictEqual(persistedA.is_manual_offset, false, 'the reset must be persisted to scenes.json, not just returned in the response')
    console.log('PASS: the reset is persisted to disk')

    // Reset fixture again for the last-scene scenario
    fs.writeFileSync(scenesPath, JSON.stringify(scenes, null, 2))

    // 3. Reorder that makes A the last scene — it has no outgoing boundary anymore at all
    res  = await reorder(['B', 'D', 'A'])
    body = await res.json()
    assert.strictEqual(res.status, 200)
    sceneA = body.scenes.find(s => s.scene_id === 'A')
    assert.strictEqual(sceneA.is_manual_offset, false, 'A became the last scene — no outgoing boundary exists — must reset')
    console.log('PASS: a reorder that makes the scene the last one also resets its manual boundary offset')

    console.log('\nAll reorder-adjacency checks passed.')
  } finally {
    server.close()
    cleanup()
  }
}

run()
  .then(runWrappedShapeTest)
  .then(runReorderTests)
  .then(runBoundaryTests)
  .then(runReorderAdjacencyTests)
  .catch(err => {
    console.error('TEST FAILURE:', err)
    cleanup()
    process.exit(1)
  })
