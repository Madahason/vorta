const path     = require('path')
const crypto   = require('crypto')
const { parseDumpJson, downloadSegment, downloadFull, generateDescription, q, execAsync, SEARCH_OPTS, DL_OPTS } = require('../ytdlp')
const clipStore = require('../clipStore')

const CSPAN_SEARCH_BASE = 'https://www.c-span.org/search/?query='

async function search(query, maxResults = 5) {
  const n       = Math.min(maxResults, 10)
  const encoded = encodeURIComponent(query)
  const url     = `${CSPAN_SEARCH_BASE}${encoded}&type=Video`
  const cmd     = `yt-dlp ${q(url)} --flat-playlist --print-json --no-download --quiet --no-warnings --playlist-end ${n}`
  try {
    const { stdout } = await execAsync(cmd, SEARCH_OPTS)
    return parseDumpJson(stdout).map(r => ({
      ...r,
      license: 'public_domain',
      channel: 'C-SPAN',
    }))
  } catch (err) {
    console.error('[cspan] search error:', err.message)
    return []
  }
}

async function download({ url, startSec, endSec, tags = [], mood = 'neutral', category = 'politics', projectId = null, title = '' }) {
  const id       = crypto.randomUUID()
  const filename = `cspan_${id}.mp4`
  const outputPath = path.join(clipStore.getClipsDir(), filename)

  let duration = 0
  if (typeof startSec === 'number' && typeof endSec === 'number' && endSec > startSec) {
    await downloadSegment(url, startSec, endSec, outputPath)
    duration = Math.round(endSec - startSec)
  } else {
    await downloadFull(url, outputPath)
  }

  const resolvedTitle = title || `C-SPAN clip ${id.slice(0, 8)}`
  const description   = await generateDescription(resolvedTitle, tags)

  const clip = clipStore.addClip({
    clip_id:    id,
    file:       `/library/clips/${filename}`,
    title:      resolvedTitle,
    source:     'cspan',
    license:    'public_domain',
    source_url: url,
    tags,
    mood,
    category,
    duration,
    description,
    warning:    null,
    project_id: projectId,
  })

  console.log(`[cspan] downloaded${duration ? ` ${duration}s` : ''} clip: ${resolvedTitle}`)
  return clip
}

module.exports = { search, download }
