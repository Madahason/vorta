const path = require('path')
const fs   = require('fs')

const MUSIC_DIR        = path.resolve(__dirname, '../../library/music')
const MUSIC_INDEX_PATH = path.resolve(__dirname, '../../library/musicIndex.json')
const PIXABAY_API      = 'https://pixabay.com/api/music/'

if (!fs.existsSync(MUSIC_DIR)) fs.mkdirSync(MUSIC_DIR, { recursive: true })

function loadMusicIndex() {
  try { return JSON.parse(fs.readFileSync(MUSIC_INDEX_PATH, 'utf8')) } catch { return {} }
}

function saveMusicIndex(mood, track) {
  const index = loadMusicIndex()
  index[mood] = track
  fs.writeFileSync(MUSIC_INDEX_PATH, JSON.stringify(index, null, 2))
}

function getCachedTrackForMood(mood) {
  const index = loadMusicIndex()
  const track = index[mood]
  if (!track?.filename) return null
  const fullPath = path.join(MUSIC_DIR, track.filename)
  return fs.existsSync(fullPath) ? fullPath : null
}

async function searchMusic(query, mood) {
  const apiKey = process.env.PIXABAY_API_KEY
  if (!apiKey) throw new Error('PIXABAY_API_KEY not set in .env')

  // Build URL with key as first param — Pixabay rejects malformed requests with HTML
  const params = new URLSearchParams()
  params.append('key',      apiKey)
  params.append('q',        query)
  params.append('per_page', '10')

  const url = `${PIXABAY_API}?${params.toString()}`
  console.log('[pixabay] requesting:', url.replace(apiKey, 'KEY_HIDDEN'))

  const nodeFetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args))
  let response
  try {
    response = await nodeFetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Vorta/1.0' } })
  } catch {
    // node-fetch not available — fall back to native fetch (Node 18+)
    response = await fetch(url, { headers: { Accept: 'application/json' } })
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await response.text()
    console.error('[pixabay] non-JSON response (status', response.status + '):', text.slice(0, 200))
    throw new Error(`Pixabay returned non-JSON (${response.status}) — check PIXABAY_API_KEY: ${text.slice(0, 80)}`)
  }

  const data = await response.json()

  if (data.error) throw new Error(`Pixabay API error: ${data.error}`)
  if (!data.hits)  throw new Error(`Pixabay unexpected response: ${JSON.stringify(data).slice(0, 200)}`)

  console.log('[pixabay] found', data.hits.length, 'tracks for query:', query)

  if (!data.hits.length) return []

  return data.hits.map(track => ({
    id:          track.id,
    title:       track.tags || `Track ${track.id}`,
    duration:    track.duration,
    previewUrl:  track.previewURL,
    downloadUrl: track.previewURL,
    mood,
    source:      'pixabay',
  }))
}

async function downloadTrack(track) {
  const filename    = `${track.mood}_${track.id}.mp3`
  const outputPath  = path.join(MUSIC_DIR, filename)

  if (fs.existsSync(outputPath)) {
    const size = fs.statSync(outputPath).size
    if (size > 10000) return outputPath
    // Corrupted/empty file from a previous failed download — delete and retry
    fs.unlinkSync(outputPath)
  }

  const url = track.downloadUrl || track.previewUrl
  if (!url) throw new Error('Track has no downloadable URL')

  console.log(`[music] downloading: ${url}`)
  const nodeFetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args))
  let response
  try {
    response = await nodeFetch(url)
  } catch {
    response = await fetch(url)
  }
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`)

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length < 10000) {
    throw new Error(`Downloaded file too small: ${buffer.length} bytes — likely not a valid audio file`)
  }

  fs.writeFileSync(outputPath, buffer)
  console.log(`[music] saved: ${outputPath} (${(buffer.length / 1024).toFixed(0)} KB)`)
  return outputPath
}

async function getMusicForMood(mood, query) {
  const cached = getCachedTrackForMood(mood)
  if (cached) return cached

  const tracks = await searchMusic(query, mood)
  if (!tracks.length) return null

  // Pick the longest track available — better for looping under narration
  const best     = tracks.sort((a, b) => b.duration - a.duration)[0]
  const filePath = await downloadTrack(best)

  saveMusicIndex(mood, {
    ...best,
    filePath,
    filename: path.basename(filePath),
  })

  return filePath
}

module.exports = { searchMusic, downloadTrack, getMusicForMood, loadMusicIndex, getCachedTrackForMood }
