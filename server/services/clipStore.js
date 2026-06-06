const fs     = require('fs')
const path   = require('path')
const crypto = require('crypto')

const LIBRARY_PATH = path.join(__dirname, '../../library/clips.json')
const CLIPS_DIR    = path.join(__dirname, '../../library/clips')

function loadClips() {
  const raw  = fs.readFileSync(LIBRARY_PATH, 'utf8')
  const data = JSON.parse(raw)
  return (data.clips || []).map(c => ({
    ...c,
    filename: c.filename || (c.file ? c.file.split('/').pop() : ''),
  }))
}

function addClip(clipData) {
  const data = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'))
  const clip = {
    clip_id:     clipData.clip_id    || crypto.randomUUID(),
    file:        clipData.file,
    title:       clipData.title      || clipData.description || '',
    source:      clipData.source     || 'manual',
    license:     clipData.license    || 'unknown',
    source_url:  clipData.source_url || '',
    tags:        (clipData.tags || []).map(t => t.toLowerCase().trim()).filter(Boolean),
    mood:        clipData.mood       || 'neutral',
    category:    clipData.category   || 'general',
    duration:    parseInt(clipData.duration, 10) || 0,
    description: clipData.description || '',
    warning:     clipData.warning    || null,
    added_at:    clipData.added_at   || new Date().toISOString(),
    project_id:  clipData.project_id || null,
  }
  data.clips.push(clip)
  fs.writeFileSync(LIBRARY_PATH, JSON.stringify(data, null, 2))
  console.log(`[clipStore] added ${clip.clip_id}: ${clip.title || clip.file}`)
  return clip
}

function removeClip(clipId) {
  const data   = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'))
  const before = data.clips.length
  data.clips   = data.clips.filter(c => c.clip_id !== clipId)
  if (data.clips.length === before) return false
  fs.writeFileSync(LIBRARY_PATH, JSON.stringify(data, null, 2))
  return true
}

// Returns true if any clip already covers a given tag
function hasTag(tag) {
  const tl = tag.toLowerCase()
  return loadClips().some(c => c.tags.some(t => t.includes(tl) || tl.includes(t)))
}

function getClipsDir()    { return CLIPS_DIR }
function getLibraryPath() { return LIBRARY_PATH }

module.exports = { loadClips, addClip, removeClip, hasTag, getClipsDir, getLibraryPath }
