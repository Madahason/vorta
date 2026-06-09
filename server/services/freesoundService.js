const https = require('https')
const fs    = require('fs')
const path  = require('path')

const AMBIENT_DIR = path.resolve(__dirname, '../../library/ambient')
const STINGS_DIR  = path.resolve(__dirname, '../../library/stings')

;[AMBIENT_DIR, STINGS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
})

function getApiKey() {
  const key = process.env.FREESOUND_API_KEY
  if (!key) throw new Error('FREESOUND_API_KEY not set in .env — get free key at freesound.org/apiv2/apply')
  return key
}

function fetchJSON(urlStr) {
  return new Promise((resolve, reject) => {
    https.get(urlStr, { headers: { Authorization: `Token ${getApiKey()}`, Accept: 'application/json' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location).then(resolve).catch(reject)
      }
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(new Error(`JSON parse: ${e.message} — raw: ${data.slice(0, 100)}`)) }
      })
      res.on('error', reject)
    }).on('error', reject)
  })
}

function downloadFile(urlStr, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const req  = https.get(urlStr, { headers: { Authorization: `Token ${getApiKey()}` } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        try { fs.unlinkSync(dest) } catch {}
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        try { fs.unlinkSync(dest) } catch {}
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      res.pipe(file)
      file.on('finish', () => {
        file.close()
        const size = fs.statSync(dest).size
        if (size < 1000) {
          fs.unlinkSync(dest)
          return reject(new Error(`File too small: ${size} bytes`))
        }
        console.log(`[freesound] saved: ${path.basename(dest)} (${Math.round(size / 1024)} KB)`)
        resolve(dest)
      })
      file.on('error', err => { try { fs.unlinkSync(dest) } catch {} reject(err) })
    })
    req.on('error', err => { file.close(); reject(err) })
  })
}

// ── Search ────────────────────────────────────────────────────────────────────

async function searchFreesound({ query, duration_min = 5, duration_max = 60, filter = 'license:"Creative Commons 0"', limit = 10 }) {
  const params = new URLSearchParams({
    query,
    filter:    `${filter} duration:[${duration_min} TO ${duration_max}]`,
    fields:    'id,name,duration,previews,license,tags',
    page_size: String(limit),
    sort:      'rating_desc',
  })
  const url = `https://freesound.org/apiv2/search/text/?${params.toString()}`
  console.log('[freesound] searching:', query)

  const data = await fetchJSON(url)
  if (!data.results) throw new Error(`Freesound API error: ${JSON.stringify(data).slice(0, 200)}`)

  console.log(`[freesound] ${data.results.length} results for: ${query}`)
  return data.results.map(s => ({
    id:         s.id,
    name:       s.name,
    duration:   s.duration,
    previewUrl: s.previews?.['preview-hq-mp3'] || s.previews?.['preview-lq-mp3'],
    license:    s.license,
    tags:       s.tags || [],
  }))
}

async function downloadFreesound(sound, outputPath) {
  if (!sound.previewUrl) throw new Error(`No preview URL for sound: ${sound.name}`)
  return downloadFile(sound.previewUrl, outputPath)
}

// ── Ambient queries ───────────────────────────────────────────────────────────

const AMBIENT_QUERIES = {
  trading_floor:    { query: 'stock exchange trading floor crowd',           duration_min: 10, duration_max: 60 },
  office_ambient:   { query: 'office ambient background keyboard typing',    duration_min: 10, duration_max: 60 },
  city_traffic:     { query: 'city traffic street urban ambience',           duration_min: 10, duration_max: 60 },
  data_center_hum:  { query: 'server room data center hum fan',              duration_min: 10, duration_max: 60 },
  courtroom_silence:{ query: 'quiet indoor room ambience minimal',           duration_min: 10, duration_max: 60 },
  factory_floor:    { query: 'factory machinery industrial ambient',         duration_min: 10, duration_max: 60 },
  crowd_murmur:     { query: 'crowd murmur indoor people talking background',duration_min: 10, duration_max: 60 },
  government_hall:  { query: 'large hall echo footsteps interior',           duration_min: 10, duration_max: 60 },
  tension_drone:    { query: 'cinematic tension drone dark ambient',         duration_min: 10, duration_max: 60 },
  soft_ambient:     { query: 'soft ambient neutral background subtle',       duration_min: 10, duration_max: 60 },
  press_room:       { query: 'press conference room crowd camera',           duration_min: 10, duration_max: 60 },
  airport_ambient:  { query: 'airport terminal busy crowd announcement',     duration_min: 10, duration_max: 60 },
  industrial_hum:   { query: 'industrial machinery hum energy plant',        duration_min: 10, duration_max: 60 },
}

// ── Sting queries ─────────────────────────────────────────────────────────────

const STING_QUERIES = {
  low_drone:    { query: 'cinematic low drone bass sting',         duration_min: 1, duration_max: 4 },
  rise_sting:   { query: 'cinematic rise reveal orchestral sting', duration_min: 1, duration_max: 3 },
  neutral_sting:{ query: 'subtle transition sting neutral whoosh', duration_min: 0.5, duration_max: 2 },
  impact_sting: { query: 'cinematic impact hit dramatic sting',    duration_min: 0.5, duration_max: 2 },
  soft_fade:    { query: 'soft fade piano gentle transition',      duration_min: 1, duration_max: 4 },
  whoosh:       { query: 'cinematic whoosh transition fast',       duration_min: 0.3, duration_max: 2 },
}

// ── Download ambient via Freesound API ────────────────────────────────────────

async function downloadAmbientFile(key) {
  // All ambient filenames follow the pattern: ${key}.mp3
  const filename   = `${key}.mp3`
  const outputPath = path.join(AMBIENT_DIR, filename)

  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
    console.log(`[freesound] ambient already cached: ${key}`)
    return outputPath
  }

  const qCfg   = AMBIENT_QUERIES[key] || { query: key.replace(/_/g, ' ') + ' ambient', duration_min: 10, duration_max: 60 }
  const sounds = await searchFreesound(qCfg)
  if (!sounds.length) throw new Error(`No Freesound results for ambient: ${key}`)

  const best = sounds.sort((a, b) => b.duration - a.duration)[0]
  await downloadFreesound(best, outputPath)
  return outputPath
}

// ── Download a sting via Freesound API ────────────────────────────────────────

async function downloadSting(key) {
  const transitionStings = require('../config/transitionStings')
  const sting = transitionStings[key]
  if (!sting) throw new Error(`Unknown sting key: ${key}`)

  const outputPath = path.join(STINGS_DIR, sting.filename)
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
    console.log(`[freesound] sting already cached: ${key}`)
    return outputPath
  }

  const qCfg  = STING_QUERIES[key] || { query: key.replace(/_/g, ' ') + ' sting', duration_min: 0.5, duration_max: 4 }
  const sounds = await searchFreesound(qCfg)
  if (!sounds.length) throw new Error(`No Freesound results for sting: ${key}`)

  const best = sounds[0]
  await downloadFreesound(best, outputPath)
  return outputPath
}

module.exports = {
  searchFreesound, downloadFreesound,
  downloadAmbientFile, downloadSting,
  AMBIENT_QUERIES, STING_QUERIES,
}
