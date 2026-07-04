// Plain Node test — no framework wired into this repo. Run with:
//   node server/services/overlaySingleCall.test.js
//
// Verifies the consolidated analysis pipeline: ONE Claude call to /api/analyze must produce
// scene breakdown + overlays + match_cut_candidate together. We intercept the module loader so
// claude.js's `require('@anthropic-ai/sdk')` resolves to a fake client that (a) records every
// messages.create() call and (b) returns a canned scenes array. No API key or network needed.

const assert = require('assert')
const Module = require('module')

// ── Canned model response: covers the three cases we care about ───────────────
//   - an image scene with a suggested overlay + match_cut_candidate true
//   - a motion_graphic scene that (wrongly) carries an overlay — must be stripped
//   - a real_footage scene with an overlay whose status is already "accepted"
const FIXTURE_SCENES = [
  {
    scene_id: '001', shot_type: 'image', mood: 'intimate', composition: 'wide',
    script_excerpt: 'It began not in a boardroom, but in a garage in Cupertino, California.',
    higgsfield_prompt: 'Wide establishing shot of a cluttered residential garage in Cupertino California 1976',
    subject_anchors: ['Cupertino California', '1976'],
    motion: { type: 'drift_right', intensity: 'subtle' },
    overlays: [
      { type: 'date_stamp', template: 'minimal_pill', text: { line1: 'Cupertino · 1976' }, timing: { appearAt: 0.5 }, confidence: 0.9, reason: 'Establishes time and place', status: 'suggested' },
    ],
    match_cut_candidate: true,
    transition_out: 'dissolve', grade: 'warm_amber', clip_search_tags: [], duration_seconds: 6,
  },
  {
    scene_id: '002', shot_type: 'motion_graphic', mood: 'neutral',
    script_excerpt: 'By 2018 Apple had become the first company worth one trillion dollars.',
    motion_graphic_type: 'AnimatedCounter',
    // A model mistake: overlay on a motion_graphic scene. postProcess must strip it.
    overlays: [
      { type: 'stat_callout', template: 'big_number', text: { line1: '$1T', line2: 'Market Cap · 2018' }, timing: { appearAt: 0.6 }, confidence: 0.95, reason: 'Milestone', status: 'suggested' },
    ],
    match_cut_candidate: false,
    transition_out: 'cut', clip_search_tags: [], duration_seconds: 5,
  },
  {
    scene_id: '003', shot_type: 'real_footage', mood: 'institutional',
    script_excerpt: 'Tim Cook testified before the United States Senate in September of 2020.',
    higgsfield_prompt: 'Tim Cook seated at a witness table before the US Senate 2020',
    subject_anchors: ['Tim Cook', 'US Senate', '2020'],
    overlays: [
      { type: 'lower_third', template: 'minimal_line', text: { line1: 'Tim Cook', line2: 'CEO · Apple' }, timing: { appearAt: 0.7 }, confidence: 0.92, reason: 'First mention', status: 'accepted' },
    ],
    match_cut_candidate: false,
    transition_out: 'dissolve', clip_search_tags: ['senate', 'hearing'], duration_seconds: 6,
  },
]

// ── Fake @anthropic-ai/sdk ────────────────────────────────────────────────────
const CALLS = []
class FakeAnthropic {
  constructor() {
    this.messages = {
      create: async (params) => {
        CALLS.push(params)
        return { content: [{ type: 'text', text: JSON.stringify(FIXTURE_SCENES) }], stop_reason: 'end_turn' }
      },
    }
  }
}

// Intercept the module loader BEFORE requiring claude.js so its internal
// `require('@anthropic-ai/sdk')` returns our fake.
const origLoad = Module._load
Module._load = function (request, ...rest) {
  if (request === '@anthropic-ai/sdk') return FakeAnthropic
  return origLoad.call(this, request, ...rest)
}

const { analyzeScript } = require('./claude')

async function run() {
  const script =
    'It began not in a boardroom, but in a garage. By 2018 Apple was worth one trillion dollars. ' +
    'Tim Cook testified before the United States Senate in September 2020.'

  const scenes = await analyzeScript({
    script,
    metadata: { title: 'Apple', niche: 'Business' },
    defaults: { overlayTemplates: { date_stamp: 'minimal_pill', lower_third: 'minimal_line' } },
  })

  // ── 1. EXACTLY ONE Claude call — no separate overlay or match-cut request ───
  assert.strictEqual(CALLS.length, 1, `expected exactly 1 Claude call, got ${CALLS.length}`)
  console.log('PASS: analyzeScript makes exactly ONE Claude API call (scenes + overlays + match-cut combined)')

  // ── 2. Overlays present, with ids + normalised status ───────────────────────
  const s1 = scenes.find(s => s.scene_id === '001')
  assert.ok(s1, 'scene 001 exists')
  assert.strictEqual(s1.overlays.length, 1, 'image scene keeps its overlay')
  assert.ok(s1.overlays[0].id, 'overlay got a generated id')
  assert.strictEqual(s1.overlays[0].status, 'suggested', 'suggested status preserved')
  assert.strictEqual(s1.overlays[0].type, 'date_stamp')
  console.log('PASS: image-scene overlay retained with generated id + status "suggested"')

  // ── 3. match_cut_candidate flags come straight from the single response ─────
  assert.strictEqual(s1.match_cut_candidate, true, 'match_cut_candidate true carried through')
  const s2 = scenes.find(s => s.scene_id === '002')
  assert.strictEqual(s2.match_cut_candidate, false, 'match_cut_candidate false carried through')
  console.log('PASS: match_cut_candidate flags populated by the single analysis call')

  // ── 4. motion_graphic exclusion enforced ────────────────────────────────────
  assert.deepStrictEqual(s2.overlays, [], 'motion_graphic overlay stripped by postProcess')
  console.log('PASS: motion_graphic scene has overlays stripped (exclusion rule enforced)')

  // ── 5. real_footage overlay retained; "accepted" status kept as-is ──────────
  const s3 = scenes.find(s => s.scene_id === '003')
  assert.strictEqual(s3.overlays.length, 1, 'real_footage scene keeps its overlay')
  assert.strictEqual(s3.overlays[0].status, 'accepted', 'already-accepted status untouched')
  assert.ok(s3.overlays[0].id, 'real_footage overlay got an id')
  console.log('PASS: real_footage overlay retained; pre-accepted status preserved')

  // ── 6. Every scene exposes both fields (nothing left undefined) ─────────────
  for (const s of scenes) {
    assert.ok(Array.isArray(s.overlays), `scene ${s.scene_id} has overlays array`)
    assert.strictEqual(typeof s.match_cut_candidate, 'boolean', `scene ${s.scene_id} has boolean match_cut_candidate`)
  }
  console.log('PASS: all scenes expose overlays[] and boolean match_cut_candidate')

  Module._load = origLoad
  console.log('\nALL OVERLAY SINGLE-CALL TESTS PASSED')
}

run().catch(err => { console.error('TEST FAILED:', err); process.exit(1) })
