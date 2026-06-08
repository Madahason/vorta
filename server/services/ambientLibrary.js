const path       = require('path')
const fs         = require('fs')
const { execAsync } = (() => {
  const { promisify } = require('util')
  const { exec }      = require('child_process')
  return { execAsync: promisify(exec) }
})()

const AMBIENT_DIR = path.resolve(__dirname, '../../library/ambient')
if (!fs.existsSync(AMBIENT_DIR)) fs.mkdirSync(AMBIENT_DIR, { recursive: true })

// Pre-defined ambient loop catalog.
// Files are sourced by the user from Freesound.org (CC0 licensed).
// The AudioPanel download guide shows exact search URLs for each file.
const AMBIENT_CATALOG = {
  trading_floor: {
    filename:    'trading_floor.mp3',
    description: 'Stock exchange trading floor, shouting, ticker sounds',
    freesoundQuery: 'stock exchange trading floor',
    category:    'finance',
    loop:        true,
  },
  office_ambient: {
    filename:    'office_ambient.mp3',
    description: 'Quiet office, keyboard typing, air conditioning hum',
    freesoundQuery: 'office ambient background',
    category:    'business',
    loop:        true,
  },
  city_traffic: {
    filename:    'city_traffic.mp3',
    description: 'City street traffic, distant horns',
    freesoundQuery: 'city traffic street ambient',
    category:    'cities',
    loop:        true,
  },
  data_center_hum: {
    filename:    'data_center_hum.mp3',
    description: 'Server room, fans humming, cooling systems',
    freesoundQuery: 'server room data center hum',
    category:    'tech',
    loop:        true,
  },
  courtroom_silence: {
    filename:    'courtroom_silence.mp3',
    description: 'Quiet courtroom, distant murmur',
    freesoundQuery: 'courtroom indoor silence murmur',
    category:    'legal',
    loop:        true,
  },
  factory_floor: {
    filename:    'factory_floor.mp3',
    description: 'Factory machinery, assembly line sounds',
    freesoundQuery: 'factory machinery industrial ambient',
    category:    'industry',
    loop:        true,
  },
  crowd_murmur: {
    filename:    'crowd_murmur.mp3',
    description: 'Large crowd, distant conversation',
    freesoundQuery: 'crowd murmur ambient indoors',
    category:    'social',
    loop:        true,
  },
  government_hall: {
    filename:    'government_hall.mp3',
    description: 'Large government building, echoing footsteps, murmur',
    freesoundQuery: 'government building hall footsteps murmur',
    category:    'politics',
    loop:        true,
  },
  tension_drone: {
    filename:    'tension_drone.mp3',
    description: 'Low tension drone, cinematic suspense',
    freesoundQuery: 'tension drone cinematic dark ambient',
    category:    'mood',
    loop:        true,
  },
  soft_ambient: {
    filename:    'soft_ambient.mp3',
    description: 'Soft neutral ambient, subtle background texture',
    freesoundQuery: 'soft ambient neutral background texture',
    category:    'mood',
    loop:        true,
  },
  press_room: {
    filename:    'press_room.mp3',
    description: 'Press conference room, camera clicks, murmur',
    freesoundQuery: 'press conference room camera clicks',
    category:    'media',
    loop:        true,
  },
  airport_ambient: {
    filename:    'airport_ambient.mp3',
    description: 'Busy international airport, announcements, crowd',
    freesoundQuery: 'airport terminal ambient announcements',
    category:    'transportation',
    loop:        true,
  },
  industrial_hum: {
    filename:    'industrial_hum.mp3',
    description: 'Industrial machinery hum, energy plant background',
    freesoundQuery: 'industrial hum machinery energy plant',
    category:    'energy',
    loop:        true,
  },
}

function getAmbientForCategory(category) {
  const { categoryAmbientMap } = require('../config/musicMoods')
  const key     = categoryAmbientMap[category] || categoryAmbientMap.default
  return getAmbientByKey(key)
}

function getAmbientForMood(mood) {
  const { moodMap } = require('../config/musicMoods')
  const key = moodMap[mood]?.ambientCategory || 'soft_ambient'
  return getAmbientByKey(key)
}

function getAmbientByKey(key) {
  const ambient = AMBIENT_CATALOG[key]
  if (!ambient) return null
  const filePath = path.join(AMBIENT_DIR, ambient.filename)
  if (!fs.existsSync(filePath)) return null
  return {
    ...ambient,
    filePath,
    url: `/library/ambient/${ambient.filename}`,
  }
}

function listAmbientFiles() {
  return Object.entries(AMBIENT_CATALOG).map(([key, val]) => ({
    key,
    ...val,
    available:  fs.existsSync(path.join(AMBIENT_DIR, val.filename)),
    freesoundUrl: `https://freesound.org/search/?q=${encodeURIComponent(val.freesoundQuery)}&f=license%3A"Creative+Commons+0"&s=downloads+desc`,
  }))
}

// Freesound CC0 search queries per ambient key for yt-dlp download
const FREESOUND_QUERIES = {
  trading_floor:    'stock exchange trading floor ambience',
  office_ambient:   'office ambient background quiet',
  city_traffic:     'city street traffic ambient',
  data_center_hum:  'server room data center hum',
  courtroom_silence:'courtroom interior silence',
  factory_floor:    'factory machinery industrial ambient',
  crowd_murmur:     'crowd murmur indoor ambient',
  government_hall:  'large hall ambience echo',
  tension_drone:    'cinematic tension drone dark',
  soft_ambient:     'soft ambient neutral background',
  press_room:       'press conference room ambient',
  airport_ambient:  'airport terminal ambient',
  industrial_hum:   'industrial hum machinery',
}

// Download a single ambient file using yt-dlp from Freesound
// Trims to 30s with ffmpeg for compact looping files
async function downloadAmbientFile(key) {
  const ambient = AMBIENT_CATALOG[key]
  if (!ambient) throw new Error(`Unknown ambient key: ${key}`)

  const outputPath = path.join(AMBIENT_DIR, ambient.filename)
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 10000) return outputPath

  const query      = FREESOUND_QUERIES[key] || ambient.freesoundQuery
  const searchUrl  = `https://freesound.org/search/?q=${encodeURIComponent(query)}&f=license%3A%22Creative+Commons+0%22`
  const tempBase   = outputPath.replace('.mp3', '_temp')
  const tempGlob   = `${tempBase}.%(ext)s`

  // yt-dlp downloads the first result from Freesound and extracts audio
  const dlCmd = `yt-dlp "${searchUrl}" --playlist-end 1 -o "${tempGlob}" --extract-audio --audio-format mp3 --audio-quality 128K --no-playlist --quiet`

  try {
    await execAsync(dlCmd, { timeout: 90_000 })
  } catch (err) {
    throw new Error(`yt-dlp download failed for ${key}: ${err.message}`)
  }

  // Find the downloaded file
  const dir   = path.dirname(outputPath)
  const base  = path.basename(tempBase)
  const files = fs.readdirSync(dir).filter(f => f.startsWith(base))
  if (!files.length) throw new Error(`No file found after yt-dlp for ${key}`)

  const downloaded = path.join(dir, files[0])

  // Trim to 30 seconds using ffmpeg for a compact loop
  try {
    await execAsync(
      `ffmpeg -i "${downloaded}" -t 30 -c:a libmp3lame -q:a 4 "${outputPath}" -y`,
      { timeout: 30_000 }
    )
    if (downloaded !== outputPath) fs.unlinkSync(downloaded)
  } catch {
    // ffmpeg not available — just use the full file
    if (downloaded !== outputPath) fs.renameSync(downloaded, outputPath)
  }

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
    throw new Error(`Ambient file too small after download for ${key}`)
  }

  console.log(`[ambient] downloaded: ${key} → ${outputPath}`)
  return outputPath
}

async function downloadAllMissingAmbient() {
  const results = {}
  for (const key of Object.keys(AMBIENT_CATALOG)) {
    const filePath = path.join(AMBIENT_DIR, AMBIENT_CATALOG[key].filename)
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
      results[key] = 'already exists'
      continue
    }
    try {
      await downloadAmbientFile(key)
      results[key] = 'downloaded'
    } catch (err) {
      results[key] = `failed: ${err.message}`
    }
  }
  return results
}

module.exports = {
  AMBIENT_CATALOG, AMBIENT_DIR,
  getAmbientForCategory, getAmbientForMood, getAmbientByKey, listAmbientFiles,
  downloadAmbientFile, downloadAllMissingAmbient,
}
