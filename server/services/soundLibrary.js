const fs   = require('fs')
const path = require('path')
const { randomUUID: uuidv4 } = require('crypto')

const LIBRARY_DIR  = path.resolve(__dirname, '../../library/sounds')
const INDEX_PATH   = path.resolve(__dirname, '../../library/soundIndex.json')
const MUSIC_DIR    = path.resolve(__dirname, '../../library/music')
const AMBIENT_DIR  = path.resolve(__dirname, '../../library/ambient')
const STINGS_DIR   = path.resolve(__dirname, '../../library/stings')
const OVERLAY_DIR  = path.resolve(__dirname, '../../library/overlay-sounds')

;[LIBRARY_DIR, MUSIC_DIR, AMBIENT_DIR, STINGS_DIR, OVERLAY_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
})

function loadIndex() {
  try {
    const data = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'))
    if (!data.sounds) data.sounds = []
    return data
  } catch {
    return { sounds: [], lastUpdated: null, totalGenerated: 0 }
  }
}

function saveIndex(data) {
  data.lastUpdated = new Date().toISOString()
  fs.writeFileSync(INDEX_PATH, JSON.stringify(data, null, 2))
}

function addToLibrary(entry) {
  const index = loadIndex()
  const sound = {
    id:         uuidv4(),
    type:       entry.type,
    category:   entry.category,
    subtype:    entry.subtype || null,
    prompt:     entry.prompt,
    filename:   entry.filename,
    filePath:   entry.filePath,
    url:        entry.url,
    duration:   entry.duration || null,
    volume:     entry.volume || 1.0,
    source:     'elevenlabs',
    model:      entry.model || 'eleven_text_to_sound_v2',
    createdAt:  new Date().toISOString(),
    usageCount: 0,
    tags:       entry.tags || [],
  }
  index.sounds.push(sound)
  index.totalGenerated = (index.totalGenerated || 0) + 1
  saveIndex(index)
  console.log(`[library] added: ${sound.type}/${sound.category} → ${sound.filename}`)
  return sound
}

function searchLibrary(type, category, subtype = null) {
  const index = loadIndex()
  return index.sounds.find(s => {
    if (s.type !== type || s.category !== category) return false
    if (subtype && s.subtype !== subtype) return false
    return fs.existsSync(s.filePath)
  }) || null
}

function searchLibraryByType(type) {
  const index = loadIndex()
  return index.sounds.filter(s => s.type === type && fs.existsSync(s.filePath))
}

function incrementUsage(id) {
  const index = loadIndex()
  const sound = index.sounds.find(s => s.id === id)
  if (sound) {
    sound.usageCount = (sound.usageCount || 0) + 1
    sound.lastUsed   = new Date().toISOString()
    saveIndex(index)
  }
}

function removeFromLibrary(id) {
  const index = loadIndex()
  const sound = index.sounds.find(s => s.id === id)
  if (sound) {
    if (fs.existsSync(sound.filePath)) fs.unlinkSync(sound.filePath)
    index.sounds = index.sounds.filter(s => s.id !== id)
    saveIndex(index)
    console.log(`[library] removed: ${sound.category}`)
  }
  return sound
}

function getLibraryStats() {
  const index  = loadIndex()
  const sounds = index.sounds.filter(s => fs.existsSync(s.filePath))
  return {
    total:          sounds.length,
    byType: {
      sting:   sounds.filter(s => s.type === 'sting').length,
      ambient: sounds.filter(s => s.type === 'ambient').length,
      overlay: sounds.filter(s => s.type === 'overlay').length,
      music:   sounds.filter(s => s.type === 'music').length,
    },
    totalGenerated: index.totalGenerated || 0,
    lastUpdated:    index.lastUpdated,
  }
}

module.exports = {
  addToLibrary,
  searchLibrary,
  searchLibraryByType,
  incrementUsage,
  removeFromLibrary,
  getLibraryStats,
  loadIndex,
  STINGS_DIR,
  AMBIENT_DIR,
  OVERLAY_DIR,
  MUSIC_DIR,
}
