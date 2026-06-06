const path     = require('path')
const crypto   = require('crypto')
const { parseDumpJson, downloadSegment, generateDescription, execAsync, SEARCH_OPTS } = require('../ytdlp')
const clipStore = require('../clipStore')

const MAX_FAIR_USE_SECONDS = 8
const FAIR_USE_WARNING     = 'Copyrighted content. Fair use applies for short documentary/commentary clips under 8 seconds. Verify your use case before distribution.'

async function search(query, maxResults = 5) {
  const n   = Math.min(maxResults, 10)
  const cmd = `yt-dlp "ytsearch${n}:${query}" --dump-json --no-download --quiet --no-warnings`
  try {
    const { stdout } = await execAsync(cmd, SEARCH_OPTS)
    return parseDumpJson(stdout)
  } catch (err) {
    console.error('[youtubeFairUse] search error:', err.message)
    return []
  }
}

async function download({ url, startSec, endSec, tags = [], mood = 'neutral', category = 'general', projectId = null, title = '' }) {
  const duration = endSec - startSec
  if (duration > MAX_FAIR_USE_SECONDS) {
    throw new Error(`Fair use clips must be ${MAX_FAIR_USE_SECONDS} seconds or less. Requested: ${duration.toFixed(1)}s`)
  }
  if (duration <= 0) {
    throw new Error('End time must be greater than start time.')
  }

  const id         = crypto.randomUUID()
  const filename   = `yt_fu_${id}.mp4`
  const outputPath = path.join(clipStore.getClipsDir(), filename)

  await downloadSegment(url, startSec, endSec, outputPath)

  const resolvedTitle = title || `Fair use clip ${id.slice(0, 8)}`
  const description   = await generateDescription(resolvedTitle, tags)

  const clip = clipStore.addClip({
    clip_id:    id,
    file:       `/library/clips/${filename}`,
    title:      resolvedTitle,
    source:     'youtube_fair_use',
    license:    'fair_use',
    source_url: url,
    tags,
    mood,
    category,
    duration:   Math.round(duration),
    description,
    warning:    FAIR_USE_WARNING,
    project_id: projectId,
  })

  console.log(`[youtubeFairUse] downloaded ${duration.toFixed(1)}s clip: ${resolvedTitle}`)
  return clip
}

module.exports = { search, download, MAX_FAIR_USE_SECONDS, FAIR_USE_WARNING }
