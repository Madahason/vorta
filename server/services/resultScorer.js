const Anthropic = require('@anthropic-ai/sdk')

async function scoreResults(results, subject, sceneContext = null) {
  if (!results.length) return results

  const prompt = `You are evaluating search results to find the best documentary footage.

Subject needed: "${subject}"
${sceneContext ? `Scene context: "${sceneContext}"` : ''}

Rate each result 1-10 for how likely it contains real documentary-quality footage of the subject.

Scoring rules:
- 9-10: Real speech, interview, conference, testimony, keynote — actual footage of subject
- 7-8: Documentary or news report that likely contains real footage
- 5-6: Could contain footage but uncertain from title alone
- 3-4: Commentary, reaction, or analysis video — unlikely to have good footage
- 1-2: Compilation, montage, clickbait, or clearly unrelated

Results to score:
${results.map((r, i) => `${i + 1}. "${r.title}" (${r.duration || 0}s) - Source: ${r.channel || r.source || 'unknown'}`).join('\n')}

Return ONLY a JSON array of numbers in order: [8, 3, 9, 5, 7]`

  try {
    const client = new Anthropic()
    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system:     'You are a documentary research assistant. Return only valid JSON.',
      messages:   [{ role: 'user', content: prompt }],
    })
    const raw    = msg.content[0].text.trim()
    const scores = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, ''))
    if (!Array.isArray(scores)) throw new Error('scores not an array')
    return results
      .map((r, i) => ({ ...r, relevanceScore: typeof scores[i] === 'number' ? scores[i] : 5 }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
  } catch (err) {
    console.warn('[resultScorer] scoring failed, returning unsorted:', err.message)
    return results.map(r => ({ ...r, relevanceScore: 5 }))
  }
}

module.exports = { scoreResults }
