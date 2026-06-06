const path     = require('path')
const crypto   = require('crypto')
const https    = require('https')
const { downloadFull, generateDescription } = require('../ytdlp')
const clipStore = require('../clipStore')

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000 }, res => {
      let body = ''
      res.on('data', d => { body += d })
      res.on('end', () => {
        try { resolve(JSON.parse(body)) } catch (e) { reject(e) }
      })
    }).on('error', reject).on('timeout', () => reject(new Error('Archive search timed out')))
  })
}

async function search(query, maxResults = 5) {
  const q   = encodeURIComponent(query)
  const url = `https://archive.org/advancedsearch.php?q=${q}&mediatype=movies&output=json&rows=${Math.min(maxResults, 20)}&fl=identifier,title,description,subject,licenseurl,avg_rating`
  try {
    const data    = await fetchJson(url)
    const docs    = (data.response?.docs || [])
    return docs.map(d => ({
      id:          d.identifier || '',
      title:       d.title      || d.identifier || '',
      duration:    0,
      url:         `https://archive.org/details/${d.identifier}`,
      thumbnail:   `https://archive.org/services/img/${d.identifier}`,
      license:     d.licenseurl || 'public_domain',
      channel:     'Internet Archive',
      description: (Array.isArray(d.description) ? d.description[0] : d.description || '').slice(0, 200),
    })).filter(r => r.id)
  } catch (err) {
    console.error('[internetArchive] search error:', err.message)
    return []
  }
}

async function getDownloadUrl(identifier) {
  try {
    const data  = await fetchJson(`https://archive.org/metadata/${identifier}`)
    const files = data.files || []
    // Prefer mp4, then mpeg4, then any video
    const mp4   = files.find(f => f.name?.endsWith('.mp4'))
    const mpeg4 = files.find(f => f.name?.endsWith('.mpeg4'))
    const video = files.find(f => ['mp4','mov','avi','mkv','mpeg4','ogv'].some(ext => f.name?.endsWith(ext)))
    const chosen = mp4 || mpeg4 || video
    if (!chosen) return null
    return `https://archive.org/download/${identifier}/${encodeURIComponent(chosen.name)}`
  } catch {
    return null
  }
}

async function download({ identifier, url: passedUrl, tags = [], mood = 'neutral', category = 'general', projectId = null, title = '' }) {
  const id = crypto.randomUUID()

  // Resolve the direct download URL if only an archive details URL was given
  let directUrl = passedUrl
  if (identifier && (!directUrl || directUrl.includes('/details/'))) {
    directUrl = await getDownloadUrl(identifier)
    if (!directUrl) throw new Error(`No downloadable video found for archive identifier: ${identifier}`)
  }

  const filename   = `archive_${id}.mp4`
  const outputPath = path.join(clipStore.getClipsDir(), filename)

  await downloadFull(directUrl, outputPath)

  const resolvedTitle = title || `Archive clip ${id.slice(0, 8)}`
  const description   = await generateDescription(resolvedTitle, tags)

  const clip = clipStore.addClip({
    clip_id:    id,
    file:       `/library/clips/${filename}`,
    title:      resolvedTitle,
    source:     'internet_archive',
    license:    'public_domain',
    source_url: directUrl,
    tags,
    mood,
    category,
    duration:   0,
    description,
    warning:    null,
    project_id: projectId,
  })

  console.log(`[internetArchive] downloaded: ${resolvedTitle}`)
  return clip
}

module.exports = { search, download, getDownloadUrl }
