const https = require('https')
const fs    = require('fs')
const path  = require('path')

const STINGS_DIR = path.resolve(__dirname, '../../library/stings')
if (!fs.existsSync(STINGS_DIR)) fs.mkdirSync(STINGS_DIR, { recursive: true })

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

const STING_QUERIES = {
  low_drone:    { query: 'cinematic low drone bass sting short',     duration_min: 1,   duration_max: 5 },
  rise_sting:   { query: 'cinematic rise reveal sting short',        duration_min: 1,   duration_max: 4 },
  neutral_sting:{ query: 'subtle transition whoosh sting short',     duration_min: 0.5, duration_max: 3 },
  impact_sting: { query: 'cinematic impact hit dramatic short',      duration_min: 0.5, duration_max: 3 },
  soft_fade:    { query: 'soft fade gentle piano sting short',       duration_min: 1,   duration_max: 4 },
  whoosh:       { query: 'cinematic whoosh transition fast short',   duration_min: 0.3, duration_max: 2 },
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

module.exports = { searchFreesound, downloadSound, STING_QUERIES, downloadSting }
