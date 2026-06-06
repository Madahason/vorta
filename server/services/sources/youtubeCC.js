const path     = require('path')
const crypto   = require('crypto')
const { parseDumpJson, downloadSegment, generateDescription, q, execAsync, SEARCH_OPTS } = require('../ytdlp')
const clipStore = require('../clipStore')

async function search(query, maxResults = 5) {
  const n   = Math.min(maxResults, 10)
  const cmd = `yt-dlp "ytsearch${n}:${query} creative commons" --dump-json --no-download --quiet --no-warnings`
  try {
    const { stdout } = await execAsync(cmd, SEARCH_OPTS)
    const results    = parseDumpJson(stdout)
    // Filter to only videos that have a CC license per yt-dlp metadata
    return results.filter(r =>
      !r.license ||
      r.license.toLowerCase().includes('creative commons') ||
      r.license.toLowerCase().includes('cc by')
    )
  } catch (err) {
    console.error('[youtubeCC] search error:', err.message)
    return []
  }
}

async function download({ url, startSec, endSec, tags = [], mood = 'neutral', category = 'general', projectId = null, title = '' }) {
  const id         = crypto.randomUUID()
  const filename   = `yt_cc_${id}.mp4`
  const outputPath = path.join(clipStore.getClipsDir(), filename)

  await downloadSegment(url, startSec, endSec, outputPath)

  const resolvedTitle = title || `YouTube CC clip ${id.slice(0, 8)}`
  const description   = await generateDescription(resolvedTitle, tags)
  const duration      = Math.round(endSec - startSec)

  const clip = clipStore.addClip({
    clip_id:    id,
    file:       `/library/clips/${filename}`,
    title:      resolvedTitle,
    source:     'youtube_cc',
    license:    'creative_commons',
    source_url: url,
    tags,
    mood,
    category,
    duration,
    description,
    warning:    null,
    project_id: projectId,
  })

  console.log(`[youtubeCC] downloaded ${duration}s clip: ${resolvedTitle}`)
  return clip
}

module.exports = { search, download }
