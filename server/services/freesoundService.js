const https = require('https')
const fs    = require('fs')
const path  = require('path')

const AMBIENT_DIR = path.resolve(__dirname, '../../library/ambient')
const STINGS_DIR  = path.resolve(__dirname, '../../library/stings')

;[AMBIENT_DIR, STINGS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
})

function getKey() {
  if (!process.env.FREESOUND_API_KEY) throw new Error('FREESOUND_API_KEY not set')
  return process.env.FREESOUND_API_KEY
}

async function searchFreesound({ query, duration_min = 5, duration_max = 120, limit = 10 }) {
  const key    = getKey()
  const params = new URLSearchParams({
    query,
    filter:    `duration:[${duration_min} TO ${duration_max}] license:"Creative Commons 0"`,
    fields:    'id,name,duration,previews',
    page_size: String(limit),
    sort:      'rating_desc',
  })
  const url = `https://freesound.org/apiv2/search/text/?${params.toString()}`
  console.log('[freesound] searching:', query.slice(0, 60))

  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Authorization: `Token ${key}`, Accept: 'application/json' } }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          const parsed  = JSON.parse(data)
          const results = (parsed.results || [])
            .filter(s => s.previews?.['preview-hq-mp3'])
            .map(s => ({ id: s.id, name: s.name, duration: s.duration, previewUrl: s.previews['preview-hq-mp3'] }))
          console.log(`[freesound] ${results.length} results for: ${query.slice(0, 40)}`)
          resolve(results)
        } catch (e) {
          reject(new Error(`Parse error: ${e.message} — ${data.slice(0, 100)}`))
        }
      })
    }).on('error', reject)
  })
}

function downloadSound(previewUrl, outputPath) {
  const key = getKey()
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath)

    const request = (url) => {
      https.get(url, { headers: { Authorization: `Token ${key}` } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return request(res.headers.location)
        }
        if (res.statusCode !== 200) {
          file.close()
          try { fs.unlinkSync(outputPath) } catch {}
          return reject(new Error(`HTTP ${res.statusCode}`))
        }
        res.pipe(file)
        file.on('finish', () => {
          file.close()
          const size = fs.statSync(outputPath).size
          if (size < 1000) {
            fs.unlinkSync(outputPath)
            return reject(new Error(`File too small: ${size} bytes`))
          }
          console.log(`[freesound] saved: ${path.basename(outputPath)} (${Math.round(size / 1024)} KB)`)
          resolve(outputPath)
        })
        file.on('error', err => { try { fs.unlinkSync(outputPath) } catch {} reject(err) })
      }).on('error', err => { file.close(); reject(err) })
    }

    request(previewUrl)
  })
}

// ── Ambient ───────────────────────────────────────────────────────────────────

const AMBIENT_QUERIES = {
  trading_floor:    { query: 'stock exchange trading floor crowd noise',   duration_min: 10, duration_max: 120 },
  office_ambient:   { query: 'office ambient background quiet keyboard',   duration_min: 10, duration_max: 120 },
  city_traffic:     { query: 'city street traffic urban ambience',         duration_min: 10, duration_max: 120 },
  data_center_hum:  { query: 'server room data center fan hum',            duration_min: 10, duration_max: 120 },
  courtroom_silence:{ query: 'quiet indoor room ambience minimal',         duration_min: 10, duration_max: 120 },
  factory_floor:    { query: 'factory machinery industrial ambient loop',  duration_min: 10, duration_max: 120 },
  crowd_murmur:     { query: 'crowd murmur indoor people talking',         duration_min: 10, duration_max: 120 },
  government_hall:  { query: 'large hall echo interior ambience',          duration_min: 10, duration_max: 120 },
  tension_drone:    { query: 'dark ambient drone tension cinematic',       duration_min: 10, duration_max: 120 },
  soft_ambient:     { query: 'soft neutral background ambient subtle',     duration_min: 10, duration_max: 120 },
  press_room:       { query: 'press conference room crowd cameras',        duration_min: 10, duration_max: 120 },
  airport_ambient:  { query: 'airport terminal busy crowd',                duration_min: 10, duration_max: 120 },
  industrial_hum:   { query: 'industrial machinery hum energy plant',      duration_min: 10, duration_max: 120 },
}

// ── Stings ────────────────────────────────────────────────────────────────────

const STING_QUERIES = {
  low_drone:    { query: 'cinematic low drone bass sting short',     duration_min: 1,   duration_max: 5 },
  rise_sting:   { query: 'cinematic rise reveal sting short',        duration_min: 1,   duration_max: 4 },
  neutral_sting:{ query: 'subtle transition whoosh sting short',     duration_min: 0.5, duration_max: 3 },
  impact_sting: { query: 'cinematic impact hit dramatic short',      duration_min: 0.5, duration_max: 3 },
  soft_fade:    { query: 'soft fade gentle piano sting short',       duration_min: 1,   duration_max: 4 },
  whoosh:       { query: 'cinematic whoosh transition fast short',   duration_min: 0.3, duration_max: 2 },
}

async function downloadAmbientFile(key) {
  // Lazy-require avoids circular dependency at module load time
  const { AMBIENT_CATALOG } = require('./ambientLibrary')
  const ambient = AMBIENT_CATALOG[key]
  if (!ambient) throw new Error(`Unknown ambient key: ${key}`)

  const outputPath = path.join(AMBIENT_DIR, ambient.filename)
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
    console.log(`[freesound] ambient cached: ${key}`)
    return outputPath
  }

  const config  = AMBIENT_QUERIES[key] || { query: `${key.replace(/_/g, ' ')} ambient`, duration_min: 10, duration_max: 120 }
  const results = await searchFreesound(config)
  if (!results.length) throw new Error(`No Freesound results for ambient: ${key}`)

  const best = results.sort((a, b) => b.duration - a.duration)[0]
  await downloadSound(best.previewUrl, outputPath)
  return outputPath
}

async function downloadSting(key) {
  const transitionStings = require('../config/transitionStings')
  const sting = transitionStings[key]
  if (!sting) throw new Error(`Unknown sting key: ${key}`)

  const outputPath = path.join(STINGS_DIR, sting.filename)
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
    console.log(`[freesound] sting cached: ${key}`)
    return outputPath
  }

  const config  = STING_QUERIES[key] || { query: `${key.replace(/_/g, ' ')} sting`, duration_min: 0.5, duration_max: 4 }
  const results = await searchFreesound(config)
  if (!results.length) throw new Error(`No Freesound results for sting: ${key}`)

  await downloadSound(results[0].previewUrl, outputPath)
  return outputPath
}

module.exports = { searchFreesound, downloadAmbientFile, downloadSting, AMBIENT_QUERIES, STING_QUERIES }
