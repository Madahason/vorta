const crypto    = require('crypto')
const Anthropic = require('@anthropic-ai/sdk')
const clipStore = require('./clipStore')
const youtubeCC       = require('./sources/youtubeCC')
const youtubeFairUse  = require('./sources/youtubeFairUse')
const internetArchive = require('./sources/internetArchive')
const cspan           = require('./sources/cspan')
const { searchTED }   = require('./sources/ted')
const { buildFootageQuery } = require('./sources/searchUtils')
const { scoreResults }      = require('./resultScorer')

const SOURCE_PRIORITY = [
  'internet_archive',
  'cspan',
  'ted',
  'youtube_cc',
  'youtube_fair_use',
]

// In-memory job state: seedId -> { logs: [], clients: Set }
const seedJobs = new Map()

function broadcast(seedId, event) {
  const job = seedJobs.get(seedId)
  if (!job) return
  const data = `data: ${JSON.stringify(event)}\n\n`
  for (const res of job.clients) {
    try { res.write(data) } catch { /* client disconnected */ }
  }
  job.logs.push(event)
}

function addClient(seedId, res) {
  if (!seedJobs.has(seedId)) return false
  seedJobs.get(seedId).clients.add(res)
  // Replay past events so the client catches up
  for (const ev of seedJobs.get(seedId).logs) {
    res.write(`data: ${JSON.stringify(ev)}\n\n`)
  }
  return true
}

function removeClient(seedId, res) {
  seedJobs.get(seedId)?.clients.delete(res)
}

async function extractEntities(title, niche) {
  const client = new Anthropic()
  const msg    = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages:   [{
      role:    'user',
      content: `Documentary project title: "${title}". Niche: "${niche}".
Extract 6 specific named entities (real people, companies, events, places, legislation) that would have
documentary B-roll footage. Return a JSON array of strings only. No explanation.
Example: ["Steve Jobs","Apple Inc","Macworld 2007","Cupertino California","iPod launch","Silicon Valley"]`,
    }],
  })
  const raw = msg.content[0].text.trim()
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
  return JSON.parse(clean)
}

// Search all sources in parallel and return combined results scored + priority-sorted
async function searchAllSources(entity, maxPerSource = 3) {
  const personQuery   = buildFootageQuery(entity, 'person')
  const defaultQuery  = buildFootageQuery(entity)

  const searches = await Promise.allSettled([
    internetArchive.search(personQuery,  maxPerSource),
    cspan.search(defaultQuery,           maxPerSource),
    searchTED(entity,                    maxPerSource),
    youtubeCC.search(personQuery,        maxPerSource),
    youtubeFairUse.search(personQuery,   maxPerSource),
  ])

  const [archiveRes, cspanRes, tedRes, ccRes, fuRes] = searches.map(r =>
    r.status === 'fulfilled' ? r.value : []
  )

  const labeled = [
    ...archiveRes.map(r => ({ ...r, _source: 'internet_archive' })),
    ...cspanRes.map(r =>   ({ ...r, _source: 'cspan'            })),
    ...tedRes.map(r =>     ({ ...r, _source: 'ted'              })),
    ...ccRes.map(r =>      ({ ...r, _source: 'youtube_cc'       })),
    ...fuRes.map(r =>      ({ ...r, _source: 'youtube_fair_use' })),
  ]

  // Score all combined results, then sort by priority + relevance score
  const scored = await scoreResults(labeled, entity)

  return scored.sort((a, b) => {
    const ap = SOURCE_PRIORITY.indexOf(a._source)
    const bp = SOURCE_PRIORITY.indexOf(b._source)
    const ai = ap === -1 ? 99 : ap
    const bi = bp === -1 ? 99 : bp
    if (ai !== bi) return ai - bi
    return (b.relevanceScore || 5) - (a.relevanceScore || 5)
  })
}

async function seedProjectClips(seedId, { title, niche, projectId, maxClips = 15 }) {
  const clipsAdded = []

  try {
    broadcast(seedId, { type: 'seed_status', status: 'extracting_entities', message: 'Extracting key entities from project…' })

    const entities = await extractEntities(title || 'Documentary', niche || 'General')
    const limited  = entities.slice(0, 6)

    broadcast(seedId, { type: 'seed_status', status: 'searching', entities: limited })

    for (const entity of limited) {
      if (clipsAdded.length >= maxClips) break

      broadcast(seedId, { type: 'seed_progress', entity, source: 'search', status: 'searching' })

      const candidates = await searchAllSources(entity, 3)

      for (const candidate of candidates) {
        if (clipsAdded.length >= maxClips) break

        // Skip if we already have clips matching this tag
        const tags  = entity.toLowerCase().split(/\s+/).filter(w => w.length > 3)
        if (tags.some(t => clipStore.hasTag(t))) {
          console.log(`[seeder] skipping "${entity}" — tag already in library`)
          continue
        }

        broadcast(seedId, { type: 'seed_progress', entity, source: candidate._source, status: 'downloading', title: candidate.title })

        try {
          let clip = null
          const commonArgs = {
            url:       candidate.url,
            tags:      [entity.toLowerCase(), ...(candidate._source === 'cspan' ? ['government', 'politics'] : [])],
            mood:      'neutral',
            category:  niche?.toLowerCase() || 'general',
            projectId: projectId || null,
            title:     candidate.title,
          }

          if (candidate._source === 'internet_archive') {
            clip = await internetArchive.download({ identifier: candidate.id, ...commonArgs })
          } else if (candidate._source === 'cspan') {
            clip = await cspan.download({ ...commonArgs, startSec: 25, endSec: 33 })
          } else if (candidate._source === 'youtube_cc') {
            clip = await youtubeCC.download({ ...commonArgs, startSec: 25, endSec: 33 })
          } else if (candidate._source === 'ted') {
            // TED videos are on YouTube — use CC downloader
            clip = await youtubeCC.download({ ...commonArgs, startSec: 25, endSec: 33 })
            if (clip) clip.source = 'ted'
          } else if (candidate._source === 'youtube_fair_use') {
            clip = await youtubeFairUse.download({ ...commonArgs, startSec: 25, endSec: 33 })
          }

          if (clip) {
            clipsAdded.push(clip)
            broadcast(seedId, { type: 'seed_progress', entity, source: candidate._source, status: 'done', clip })
            break // one clip per entity is enough
          }
        } catch (err) {
          console.error(`[seeder] failed to download "${candidate.title}":`, err.message)
          broadcast(seedId, { type: 'seed_progress', entity, source: candidate._source, status: 'error', error: err.message })
        }
      }
    }
  } catch (err) {
    console.error('[seeder] fatal error:', err.message)
    broadcast(seedId, { type: 'seed_error', error: err.message })
  }

  broadcast(seedId, { type: 'seed_complete', clipsAdded: clipsAdded.length })
}

function startSeed({ title, niche, projectId, maxClips = 15 }) {
  const seedId = crypto.randomUUID()
  seedJobs.set(seedId, { logs: [], clients: new Set() })

  // Fire and forget — don't await
  seedProjectClips(seedId, { title, niche, projectId, maxClips }).catch(err => {
    console.error('[seeder] unhandled error in seedProjectClips:', err)
  })

  return seedId
}

module.exports = { startSeed, addClient, removeClient, seedJobs }
