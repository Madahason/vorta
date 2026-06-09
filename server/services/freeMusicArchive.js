const https = require('https')
const http  = require('http')
const fs    = require('fs')
const path  = require('path')

const MUSIC_DIR        = path.resolve(__dirname, '../../library/music')
const MUSIC_INDEX_PATH = path.resolve(__dirname, '../../library/musicIndex.json')
const FMA_API          = 'https://freemusicarchive.org/api/get/tracks.json'

if (!fs.existsSync(MUSIC_DIR)) fs.mkdirSync(MUSIC_DIR, { recursive: true })

// Mood → FMA genre/tag mapping
const MOOD_TO_TAGS = {
  tense:          ['instrumental', 'dark', 'ambient'],
  triumphant:     ['instrumental', 'epic', 'orchestral'],
  somber:         ['instrumental', 'sad', 'piano'],
  neutral:        ['instrumental', 'ambient', 'background'],
  dramatic:       ['instrumental', 'dramatic', 'cinematic'],
  reflective:     ['instrumental', 'ambient', 'reflective'],
  anticipatory:   ['instrumental', 'suspense', 'building'],
  institutional:  ['instrumental', 'corporate', 'ambient'],
  intimate:       ['instrumental', 'soft', 'acoustic'],
  default:        ['instrumental', 'ambient'],
}

// ── low-level https helpers ───────────────────────────────────────────────────

function fetchJSON(urlStr) {
  return new Promise((resolve, reject) => {
    const lib = urlStr.startsWith('https') ? https : http
    lib.get(urlStr, { headers: { 'User-Agent': 'Vorta/1.0', Accept: 'application/json' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location).then(resolve).catch(reject)
      }
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        const trimmed = data.trim()
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
          return reject(new Error(`Non-JSON response (${res.statusCode}): ${data.slice(0, 100)}`))
        }
        try { resolve(JSON.parse(data)) } catch (e) { reject(new Error(`JSON parse: ${e.message}`)) }
      })
      res.on('error', reject)
    }).on('error', reject)
  })
}

function httpGetToFile(urlStr, dest) {
  return new Promise((resolve, reject) => {
    const lib  = urlStr.startsWith('https') ? https : http
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
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve(dest)))
      file.on('error', err => { try { fs.unlinkSync(dest) } catch {} reject(err) })
    }).on('error', err => { file.close(); reject(err) })
  })
}

// ── index helpers ─────────────────────────────────────────────────────────────

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
  if (track?.filename) {
    const fullPath = path.join(MUSIC_DIR, track.filename)
    if (fs.existsSync(fullPath)) return fullPath
  }
  // Also check YAL on-disk cache
  const yalPath = path.join(MUSIC_DIR, `yal_${mood}.mp3`)
  if (fs.existsSync(yalPath) && fs.statSync(yalPath).size > 10000) return yalPath
  return null
}

// ── mood normaliser ───────────────────────────────────────────────────────────

function normaliseMood(mood) {
  const known = ['tense', 'triumphant', 'somber', 'neutral', 'dramatic', 'reflective', 'anticipatory', 'institutional', 'intimate']
  if (known.includes(mood)) return mood
  const m = (mood || '').toLowerCase()
  if (['dark', 'tense', 'ominous', 'threat', 'danger', 'confrontat', 'restrict', 'gravity', 'crisis', 'urgent', 'suspens'].some(w => m.includes(w))) return 'tense'
  if (['triumph', 'celebrat', 'success', 'inspir', 'hope', 'uplift', 'win'].some(w => m.includes(w)))                                                  return 'triumphant'
  if (['sad', 'grief', 'loss', 'fail', 'melanchol', 'somber', 'mourn'].some(w => m.includes(w)))                                                        return 'somber'
  if (['reveal', 'dramatic', 'intense', 'impact'].some(w => m.includes(w)))                                                                             return 'dramatic'
  if (['reflect', 'thought', 'contempl'].some(w => m.includes(w)))                                                                                      return 'reflective'
  if (['intimate', 'personal', 'quiet'].some(w => m.includes(w)))                                                                                       return 'intimate'
  return 'neutral'
}

// ── FMA search ────────────────────────────────────────────────────────────────

async function searchFMA(mood, limit = 10) {
  const tags = MOOD_TO_TAGS[mood] || MOOD_TO_TAGS.default
  const params = new URLSearchParams({
    api_key: 'FreePublicApiKey',  // FMA public demo key (no registration needed)
    limit:   String(limit),
    page:    '1',
  })
  const url = `${FMA_API}?${params.toString()}`
  console.log('[fma] searching mood:', mood, '| tags:', tags.join(', '))

  try {
    const data   = await fetchJSON(url)
    const tracks = (data.dataset || [])
      .filter(t => t.track_file && parseInt(t.track_duration_in_seconds) > 60)
      .slice(0, limit)
      .map(t => ({
        id:          t.track_id,
        title:       t.track_title,
        artist:      t.artist_name,
        duration:    parseInt(t.track_duration_in_seconds),
        downloadUrl: t.track_file,
        mood,
        source:      'fma',
      }))
    console.log(`[fma] found ${tracks.length} usable tracks`)
    return tracks
  } catch (err) {
    console.warn('[fma] API failed:', err.message)
    return []
  }
}

// ── FMA download ──────────────────────────────────────────────────────────────

async function downloadFMATrack(track, outputPath) {
  console.log(`[fma] downloading: ${track.title} by ${track.artist}`)
  await httpGetToFile(track.downloadUrl, outputPath)

  const size = fs.statSync(outputPath).size
  if (size < 10000) {
    fs.unlinkSync(outputPath)
    throw new Error(`Downloaded file too small: ${size} bytes`)
  }

  console.log(`[fma] saved: ${outputPath} (${Math.round(size / 1024)} KB)`)
  return outputPath
}

// ── Two-tier getMusicForMood: FMA → YouTube Audio Library ─────────────────────

async function getMusicForMood(mood) {
  const normMood = normaliseMood(mood)

  const cached = getCachedTrackForMood(normMood)
  if (cached) {
    console.log(`[music] using cached track for mood: ${normMood}`)
    return cached
  }

  // Tier 1: Free Music Archive (no key required)
  try {
    const tracks = await searchFMA(normMood)
    if (tracks.length) {
      const best     = tracks.sort((a, b) => b.duration - a.duration)[0]
      const filename = `${normMood}_fma_${best.id}.mp3`
      const outPath  = path.join(MUSIC_DIR, filename)
      await downloadFMATrack(best, outPath)
      saveMusicIndex(normMood, { ...best, filename })
      console.log(`[music] FMA success for mood: ${normMood}`)
      return outPath
    }
  } catch (err) {
    console.warn(`[music] FMA failed for "${normMood}": ${err.message}`)
  }

  // Tier 2: YouTube Audio Library via yt-dlp
  try {
    const { getMusicFromYouTubeAudioLibrary } = require('./youtubeAudioLibrary')
    const filePath = await getMusicFromYouTubeAudioLibrary(normMood)
    saveMusicIndex(normMood, { filePath, filename: path.basename(filePath), source: 'yal' })
    console.log(`[music] YouTube Audio Library success for mood: ${normMood}`)
    return filePath
  } catch (err) {
    console.warn(`[music] YouTube Audio Library failed for "${normMood}": ${err.message}`)
  }

  throw new Error(`All music sources failed for mood: ${normMood}`)
}

module.exports = { getMusicForMood, searchFMA, normaliseMood, loadMusicIndex, getCachedTrackForMood }
