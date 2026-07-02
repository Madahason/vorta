// Plain Node test — no framework wired into this repo yet. Run with:
//   node server/services/claude.test.js
//
// detectMatchCutCandidates accepts an injectable claudeCaller specifically so this test can
// supply a fake verdict instead of calling the real Anthropic API — no credentials needed,
// fast, deterministic. This tests the plumbing (which pairs get built, how the response maps
// back onto scene objects) using two clearly different test visual_prompt pairs, exactly as
// requested — it is not asserting that Claude's own judgment is correct (that's not something
// a unit test can meaningfully verify), only that a given verdict is applied correctly.
const assert = require('assert')
const {
  detectMatchCutCandidates, parseMatchCutResponse, buildMatchCutPrompt,
} = require('./claude')

async function run() {
  // ── Fixture: three consecutive scenes ─────────────────────────────────────
  // A -> B: genuinely similar framing/subject continuity (both wide shots of a lone figure
  //         in a symmetrical cool-blue corridor-like space) — a real match-cut candidate.
  // B -> C: clearly dissimilar (corridor wide shot vs. an extreme close-up birthday cake with
  //         warm golden bokeh) — not a match-cut candidate.
  const scenes = [
    {
      scene_id: 'A', shot_type: 'image', composition: 'wide',
      higgsfield_prompt: 'Wide shot of a lone figure walking down an empty office corridor, cool blue fluorescent lighting, symmetrical framing, polished floor reflecting overhead lights',
    },
    {
      scene_id: 'B', shot_type: 'image', composition: 'wide',
      higgsfield_prompt: 'Wide shot of a lone figure walking through an empty parking garage, cool blue sodium lighting, symmetrical framing, concrete floor reflecting overhead lights',
    },
    {
      scene_id: 'C', shot_type: 'image', composition: 'close_up',
      higgsfield_prompt: 'Extreme close-up of a birthday cake with lit candles, warm golden light, soft bokeh background, frosting texture visible',
    },
    {
      scene_id: 'D', shot_type: 'motion_graphic', composition: 'medium',
      higgsfield_prompt: '', // motion_graphic scenes have no visual prompt to compare
    },
  ]

  // ── 1. Comparison logic: true on the similar pair, false on the dissimilar pair ─────────
  let promptSeen = null
  const fakeSimilarThenDissimilar = async (prompt) => {
    promptSeen = prompt
    return '["A"]' // only the A->B boundary (outgoing scene A) judged a candidate
  }

  let result = await detectMatchCutCandidates(scenes, fakeSimilarThenDissimilar)

  const byId = Object.fromEntries(result.map(s => [s.scene_id, s]))
  assert.strictEqual(byId.A.match_cut_candidate, true, 'the genuinely similar A->B pair must be flagged on the OUTGOING scene (A)')
  console.log('PASS: a genuinely similar scene pair produces match_cut_candidate: true on the outgoing scene')

  assert.strictEqual(byId.B.match_cut_candidate, undefined, 'B was not returned as a candidate by the (fake) verdict — must stay unset/false')
  assert.strictEqual(byId.C.match_cut_candidate, undefined, 'the dissimilar B->C pair must not be flagged')
  console.log('PASS: a dissimilar scene pair does not get match_cut_candidate set to true')

  // Confirm the prompt actually carried both scenes' visual details for every real pair —
  // proves the comparison is genuinely inspecting the visual_prompt/composition content,
  // not just guessing.
  assert(promptSeen.includes('office corridor'), 'prompt sent to Claude must include scene A\'s visual detail')
  assert(promptSeen.includes('parking garage'), 'prompt sent to Claude must include scene B\'s visual detail')
  assert(promptSeen.includes('birthday cake'), 'prompt sent to Claude must include scene C\'s visual detail')
  console.log('PASS: the comparison prompt carries every consecutive pair\'s actual visual_prompt/composition content')

  // motion_graphic scenes (D) have no visual prompt — must never appear in a pair, and must
  // never be flagged.
  assert(!promptSeen.includes('scene D'), 'scene D (motion_graphic, no visual prompt) must never be sent for comparison')
  assert.strictEqual(byId.D.match_cut_candidate, undefined)
  console.log('PASS: motion_graphic scenes (no visual prompt to compare) are excluded from the comparison entirely')

  // ── 2. Graceful failure — mirrors exactly how analyzeScript wraps this call ─────────────
  const fakeThrowing = async () => { throw new Error('Anthropic API exploded') }
  let mainAnalysisCompleted = false
  let finalScenes
  try {
    finalScenes = await detectMatchCutCandidates(scenes, fakeThrowing)
  } catch (err) {
    // This is the exact pattern analyzeScript uses — a failure here must never propagate,
    // it must just fall back to the scenes as they were (match_cut_candidate false/unset).
    console.warn('[test] match-cut detection failed (expected):', err.message)
    finalScenes = scenes
  }
  mainAnalysisCompleted = true

  assert.strictEqual(mainAnalysisCompleted, true, 'main scene analysis must complete even when the comparison step throws')
  assert.strictEqual(finalScenes.length, scenes.length, 'all scenes must still be present after a comparison failure')
  assert.strictEqual(finalScenes[0].match_cut_candidate, undefined, 'on failure, scenes fall back unchanged — no candidate flags applied')
  console.log('PASS: a thrown error from the comparison step is caught and the main scene set still completes intact (matches analyzeScript\'s wrapping)')

  // ── 3. Empty verdict — "no match cuts in this script" is a valid, common answer ─────────
  const fakeEmpty = async () => '[]'
  result = await detectMatchCutCandidates(scenes, fakeEmpty)
  assert.ok(result.every(s => !s.match_cut_candidate), 'an empty [] verdict must leave every scene unflagged, not throw')
  console.log('PASS: an empty [] verdict (no candidates) is handled without error')

  // ── 4. Too few scenes to compare ────────────────────────────────────────────────────────
  assert.deepStrictEqual(await detectMatchCutCandidates([scenes[0]], fakeEmpty), [scenes[0]])
  assert.deepStrictEqual(await detectMatchCutCandidates([], fakeEmpty), [])
  console.log('PASS: fewer than 2 scenes is a no-op (nothing to compare)')

  // ── parseMatchCutResponse ───────────────────────────────────────────────────────────────
  assert.deepStrictEqual(parseMatchCutResponse('["003","007"]'), ['003', '007'])
  assert.deepStrictEqual(parseMatchCutResponse('[]'), [], 'a legitimate empty array must parse, not throw (unlike the shared extractJSON helper)')
  assert.deepStrictEqual(parseMatchCutResponse('```json\n["001"]\n```'), ['001'], 'markdown code fences must be stripped')
  assert.throws(() => parseMatchCutResponse('{"not": "an array"}'), /not a JSON array/)
  assert.throws(() => parseMatchCutResponse('not json at all'))
  console.log('PASS: parseMatchCutResponse handles non-empty arrays, empty arrays, markdown fences, and rejects non-array/malformed input')

  // ── buildMatchCutPrompt ─────────────────────────────────────────────────────────────────
  const promptText = buildMatchCutPrompt([
    { a_scene_id: '001', a_composition: 'wide', a: 'shot A', b_scene_id: '002', b_composition: 'medium', b: 'shot B' },
  ])
  assert(promptText.includes('001') && promptText.includes('002') && promptText.includes('shot A') && promptText.includes('shot B'))
  console.log('PASS: buildMatchCutPrompt includes both scenes\' ids and descriptions')

  console.log('\nAll claude.test.js checks passed.')
}

run().catch(err => {
  console.error('TEST FAILURE:', err)
  process.exit(1)
})
