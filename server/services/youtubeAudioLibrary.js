const { promisify } = require('util')
const { exec }      = require('child_process')
const path          = require('path')
const fs            = require('fs')

const execAsync = promisify(exec)
const MUSIC_DIR = path.resolve(__dirname, '../../library/music')

if (!fs.existsSync(MUSIC_DIR)) fs.mkdirSync(MUSIC_DIR, { recursive: true })

// YouTube Audio Library channel — CC-licensed instrumental music
const YAL_CHANNEL = 'https://www.youtube.com/channel/UCK8sQmJBp8GCxrOtXWBpyEA'

const MOOD_QUERIES = {
  tense:          'cinematic tension dark thriller music',
  triumphant:     'cinematic epic triumph orchestral music',
  somber:         'cinematic sad emotional piano music',
  neutral:        'cinematic documentary background subtle music',
  dramatic:       'cinematic dramatic intense orchestral',
  reflective:     'cinematic reflective thoughtful ambient music',
  anticipatory:   'cinematic building suspense music',
  institutional:  'cinematic corporate serious documentary music',
  intimate:       'cinematic soft acoustic piano gentle',
  confrontational:'cinematic dark conflict dramatic music',
  revelation:     'cinematic reveal discovery orchestral',
  revelatory:     'cinematic reveal discovery orchestral',
  ominous:        'cinematic dark ominous suspense horror',
  gravity:        'cinematic weight serious dramatic music',
  urgent:         'cinematic urgent fast paced action',
  suspenseful:    'cinematic suspense thriller dark music',
  hopeful:        'cinematic hopeful uplifting piano music',
  melancholic:    'cinematic sad melancholic emotional music',
  inspirational:  'cinematic inspirational uplifting epic',
  celebratory:    'cinematic celebration triumph epic music',
  analytical:     'cinematic documentary neutral background',
  comparative:    'cinematic documentary neutral background',
  default:        'cinematic background music documentary instrumental',
}

// Shell-quote a string
function q(s) { return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` }

async function searchYouTubeAudioLibrary(mood, maxResults = 5) {
  const query = MOOD_QUERIES[mood] || MOOD_QUERIES.default

  // Search YouTube for free-to-use background music
  const searchQuery = `ytsearch${maxResults}:${query} Creative Commons background music`
  const cmd = [
    'yt-dlp',
    q(searchQuery),
    '--print', q('%(id)s|||%(title)s|||%(duration)s|||%(webpage_url)s'),
    '--no-download',
    '--quiet',
  ].join(' ')

  try {
    const { stdout } = await execAsync(cmd, { timeout: 30_000 })
    return stdout.trim().split('\n')
      .filter(Boolean)
      .map(line => {
        const [id, title, duration, url] = line.split('|||')
        return {
          id,
          title:    title || `Track ${id}`,
          duration: parseInt(duration) || 180,
          url:      url || `https://www.youtube.com/watch?v=${id}`,
          mood,
        }
      })
  } catch (err) {
    console.warn('[yal] search failed:', err.message)
    return []
  }
}

async function downloadYouTubeAudioTrack(track, outputPath) {
  // Strip extension so yt-dlp can append the correct one
  const outputTemplate = outputPath.replace(/\.mp3$/, '.%(ext)s')

  const cmd = [
    'yt-dlp',
    q(track.url),
    '--extract-audio',
    '--audio-format',  'mp3',
    '--audio-quality', '128K',
    '-o',              q(outputTemplate),
    '--no-playlist',
    '--quiet',
  ].join(' ')

  await execAsync(cmd, { timeout: 120_000 })

  // yt-dlp writes <name>.mp3 but template extension might differ — find the file
  if (!fs.existsSync(outputPath)) {
    const dir   = path.dirname(outputPath)
    const base  = path.basename(outputPath, '.mp3')
    const found = fs.readdirSync(dir).find(f => f.startsWith(base))
    if (found) fs.renameSync(path.join(dir, found), outputPath)
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Download completed but file not found: ${outputPath}`)
  }

  const size = fs.statSync(outputPath).size
  if (size < 10000) {
    fs.unlinkSync(outputPath)
    throw new Error(`Downloaded file too small: ${size} bytes`)
  }

  console.log(`[yal] downloaded: ${track.title} (${Math.round(size / 1024)} KB)`)
  return outputPath
}

async function getMusicFromYouTubeAudioLibrary(mood) {
  const cachedPath = path.join(MUSIC_DIR, `yal_${mood}.mp3`)
  if (fs.existsSync(cachedPath) && fs.statSync(cachedPath).size > 10000) {
    console.log(`[yal] using cached track for mood: ${mood}`)
    return cachedPath
  }

  console.log(`[yal] searching YouTube for mood: ${mood}`)
  const results = await searchYouTubeAudioLibrary(mood, 5)

  if (!results.length) throw new Error(`No YouTube results for mood: ${mood}`)

  // Prefer longer tracks — better for looping under narration
  const best = results.sort((a, b) => b.duration - a.duration)[0]
  console.log(`[yal] downloading: ${best.title}`)

  await downloadYouTubeAudioTrack(best, cachedPath)
  return cachedPath
}

module.exports = { getMusicFromYouTubeAudioLibrary, searchYouTubeAudioLibrary }
