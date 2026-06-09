const path  = require('path')
const fs    = require('fs')
const https = require('https')
const http  = require('http')
const { moodMap } = require('../config/musicMoods')

const MUSIC_DIR        = path.resolve(__dirname, '../../library/music')
const MUSIC_INDEX_PATH = path.resolve(__dirname, '../../library/musicIndex.json')
const PIXABAY_API      = 'https://pixabay.com/api/music/'

if (!fs.existsSync(MUSIC_DIR)) fs.mkdirSync(MUSIC_DIR, { recursive: true })

// ── helpers ──────────────────────────────────────────────────────────────────

function loadMusicIndex() {
  try { return JSON.parse(fs.readFileSync(MUSIC_INDEX_PATH, 'utf8')) } catch { return {} }
}

function saveMusicIndex(mood, track) {
  const index = loadMusicIndex()
  index[mood] = track
  fs.writeFileSync(MUSIC_INDEX_PATH, JSON.stringify(index, null, 2))
}

function getMoodConfig(mood) {
  if (moodMap[mood]) return moodMap[mood]
  const m            = (mood || '').toLowerCase()
  const tenseWords   = ['tense', 'dark', 'conflict', 'threat', 'danger', 'crisis', 'fear', 'confrontat', 'ominous', 'restrict', 'gravity', 'urgent', 'suspens']
  const triumphWords = ['triumph', 'celebrat', 'success', 'win', 'achiev', 'inspir', 'hope', 'uplift']
  const somberWords  = ['somber', 'sad', 'grief', 'loss', 'fail', 'melanchol', 'mourn']
  const dramaticWords= ['dramatic', 'intense', 'reveal', 'revelation', 'impact', 'revelat']
  if (tenseWords.some(w => m.includes(w)))    return moodMap.tense
  if (triumphWords.some(w => m.includes(w)))  return moodMap.triumphant
  if (somberWords.some(w => m.includes(w)))   return moodMap.somber
  if (dramaticWords.some(w => m.includes(w))) return moodMap.dramatic
  return moodMap.neutral
}

// Uses native https/http — no fetch dependency
function httpGetJson(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const lib = url.protocol === 'https:' ? https : http
    lib.get(urlStr, { headers: { Accept: 'application/json', 'User-Agent': 'Vorta/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGetJson(res.headers.location).then(resolve).catch(reject)
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function httpGetToFile(urlStr, dest) {
  return new Promise((resolve, reject) => {
    const url  = new URL(urlStr)
    const lib  = url.protocol === 'https:' ? https : http
    const file = fs.createWriteStream(dest)

    lib.get(urlStr, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        try { fs.unlinkSync(dest) } catch {}
        return httpGetToFile(res.headers.location, dest).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        try { fs.unlinkSync(dest) } catch {}
        return reject(new Error(`HTTP ${res.statusCode} from ${urlStr}`))
      }
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve(dest)))
      file.on('error', err => { try { fs.unlinkSync(dest) } catch {} reject(err) })
    }).on('error', err => { file.close(); reject(err) })
  })
}

// ── Pixabay ───────────────────────────────────────────────────────────────────

async function searchMusic(query, mood) {
  const apiKey = process.env.PIXABAY_API_KEY
  if (!apiKey) throw new Error('PIXABAY_API_KEY not set in .env')

  const params = new URLSearchParams()
  params.append('key',      apiKey)
  params.append('q',        query)
  params.append('per_page', '10')
  const url = `${PIXABAY_API}?${params.toString()}`
  console.log('[pixabay] requesting:', url.replace(apiKey, 'KEY_HIDDEN'))

  const { statusCode, headers, body } = await httpGetJson(url)
  const contentType = headers['content-type'] || ''

  if (!contentType.includes('application/json') && !body.trimStart().startsWith('{')) {
    console.error('[pixabay] non-JSON response (status', statusCode + '):', body.slice(0, 200))
    throw new Error(`Pixabay returned non-JSON (${statusCode}) — check PIXABAY_API_KEY: ${body.slice(0, 80)}`)
  }

  const data = JSON.parse(body)
  if (data.error) throw new Error(`Pixabay API error: ${data.error}`)
  if (!data.hits)  throw new Error(`Pixabay unexpected response: ${JSON.stringify(data).slice(0, 200)}`)

  console.log('[pixabay] found', data.hits.length, 'tracks for query:', query)
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
  const filename   = `${track.mood}_${track.id}.mp3`
  const outputPath = path.join(MUSIC_DIR, filename)

  if (fs.existsSync(outputPath)) {
    const size = fs.statSync(outputPath).size
    if (size > 10000) return outputPath
    fs.unlinkSync(outputPath)
  }

  const url = track.downloadUrl || track.previewUrl
  if (!url) throw new Error('Track has no downloadable URL')

  console.log(`[music] downloading: ${url}`)
  await httpGetToFile(url, outputPath)

  const size = fs.statSync(outputPath).size
  if (size < 10000) {
    fs.unlinkSync(outputPath)
    throw new Error(`Downloaded file too small: ${size} bytes`)
  }

  console.log(`[music] saved: ${outputPath} (${Math.round(size / 1024)} KB)`)
  return outputPath
}

// ── Cache lookup — checks both Pixabay index and YAL on-disk cache ────────────

function getCachedTrackForMood(mood) {
  const index = loadMusicIndex()
  const track = index[mood]
  if (track?.filename) {
    const fullPath = path.join(MUSIC_DIR, track.filename)
    if (fs.existsSync(fullPath)) return fullPath
  }
  const yalPath = path.join(MUSIC_DIR, `yal_${mood}.mp3`)
  if (fs.existsSync(yalPath) && fs.statSync(yalPath).size > 10000) return yalPath
  return null
}

// ── Two-tier getMusicForMood: Pixabay → YouTube Audio Library ─────────────────

async function getMusicForMood(mood, query) {
  const cached = getCachedTrackForMood(mood)
  if (cached) return cached

  const moodCfg     = getMoodConfig(mood)
  const searchQuery = query || moodCfg.musicQuery

  // Tier 1: Pixabay (if key configured)
  if (process.env.PIXABAY_API_KEY) {
    try {
      const tracks = await searchMusic(searchQuery, mood)
      if (tracks.length) {
        const best     = tracks.sort((a, b) => b.duration - a.duration)[0]
        const filePath = await downloadTrack(best)
        saveMusicIndex(mood, { ...best, filePath, filename: path.basename(filePath) })
        return filePath
      }
    } catch (err) {
      console.warn(`[pixabay] tier-1 failed for "${mood}":`, err.message)
    }
  }

  // Tier 2: YouTube Audio Library via yt-dlp
  try {
    const { getMusicFromYouTubeAudioLibrary } = require('./youtubeAudioLibrary')
    const filePath = await getMusicFromYouTubeAudioLibrary(mood)
    return filePath
  } catch (err) {
    console.warn(`[yal] tier-2 failed for "${mood}":`, err.message)
  }

  throw new Error(`No music source available for mood: ${mood} (Pixabay ${process.env.PIXABAY_API_KEY ? 'failed' : 'key not set'}, yt-dlp fallback also failed)`)
}

module.exports = { searchMusic, downloadTrack, getMusicForMood, loadMusicIndex, getCachedTrackForMood }
