const { exec }      = require('child_process')
const { promisify } = require('util')
const path          = require('path')
const fs            = require('fs')
const crypto        = require('crypto')

const execAsync = promisify(exec)
const DL_OPTS   = { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }
const CLIPS_DIR = path.resolve(__dirname, '../../library/clips')

const MAX_SECONDS          = 8
const DEFAULT_START_OFFSET = 25  // skip title cards and intros

// Shell-quote a path (handles Windows spaces)
function q(s) { return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` }

// Seconds → M:SS for yt-dlp --download-sections
function fmtSec(s) {
  const m   = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

async function getVideoDuration(filePath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 ${q(filePath)}`
    )
    const d = parseFloat(stdout.trim())
    return isNaN(d) ? null : Math.round(d * 10) / 10
  } catch { return null }
}

async function trimWithFfmpeg(inputPath, outputPath, duration) {
  const cmd = `ffmpeg -i ${q(inputPath)} -t ${duration} -c:v libx264 -c:a aac -movflags +faststart -y ${q(outputPath)}`
  await execAsync(cmd, { timeout: 60000, maxBuffer: 1024 * 1024 })
}

// Resolve an archive.org details URL to a direct download URL
async function resolveArchiveUrl(url) {
  const identifierMatch = url.match(/archive\.org\/(?:details|download)\/([^/?#]+)/)
  if (!identifierMatch) throw new Error('Cannot parse archive.org identifier from URL')
  const identifier = identifierMatch[1]

  const https = require('https')
  const data  = await new Promise((resolve, reject) => {
    https.get(`https://archive.org/metadata/${identifier}`, { timeout: 15000 }, res => {
      let body = ''
      res.on('data', d => { body += d })
      res.on('end', () => { try { resolve(JSON.parse(body)) } catch (e) { reject(e) } })
    }).on('error', reject)
  })

  const files = data.files || []
  const mp4   = files.find(f => f.name?.endsWith('.mp4'))
  const mpeg4 = files.find(f => f.name?.endsWith('.mpeg4'))
  const video = files.find(f => ['mp4','mov','avi','mkv','mpeg4','ogv'].some(e => f.name?.endsWith(e)))
  const chosen = mp4 || mpeg4 || video
  if (!chosen) throw new Error(`No downloadable video found for archive identifier: ${identifier}`)
  return `https://archive.org/download/${identifier}/${encodeURIComponent(chosen.name)}`
}

/**
 * Download a clip from any source, trim to exact duration with ffmpeg.
 * Enforces MAX_SECONDS = 8 hard cap on all sources.
 *
 * @param {object} opts
 * @param {string} opts.url           Source URL (YouTube, C-SPAN, Archive details page, etc.)
 * @param {number} [opts.startSec=0]  Start time in seconds
 * @param {number} [opts.endSec]      End time in seconds (capped at startSec + MAX_SECONDS)
 * @param {string} opts.source        'youtube_cc' | 'youtube_fair_use' | 'cspan' | 'internet_archive'
 * @param {string[]} [opts.tags]
 * @param {string} [opts.mood]
 * @param {string} [opts.category]
 * @param {string} opts.license       'creative_commons' | 'public_domain' | 'fair_use'
 * @param {string} [opts.title]
 * @param {string|null} [opts.warning]
 * @param {string|null} [opts.projectId]
 */
async function downloadClip({ url, startSec, endSec, source, tags = [], mood = 'neutral', category = 'general', license, title = '', warning = null, projectId = null }) {
  // Default to DEFAULT_START_OFFSET if startSec is 0 or not provided (skip intros)
  const start    = (startSec != null && Number(startSec) > 0) ? Number(startSec) : DEFAULT_START_OFFSET
  const maxEnd   = start + MAX_SECONDS
  const end      = endSec != null ? Math.min(Number(endSec), maxEnd) : maxEnd
  const duration = end - start
  if (duration <= 0) throw new Error('Invalid time range: duration must be > 0')

  const id         = crypto.randomUUID()
  const prefix     = source === 'internet_archive' ? 'archive'
                   : source === 'cspan'            ? 'cspan'
                   : source === 'youtube_cc'       ? 'yt_cc'
                   : source === 'ted'              ? 'ted'
                   : 'yt_fu'
  const filename   = `${prefix}_${id}.mp4`
  const tempPath   = path.join(CLIPS_DIR, `${id}_temp.mp4`)
  const outputPath = path.join(CLIPS_DIR, filename)

  try {
    if (source === 'internet_archive') {
      // Archive: resolve direct file URL, download full, trim to first {duration}s
      const directUrl = url.includes('archive.org/download')
        ? url
        : await resolveArchiveUrl(url)

      const dlCmd = [
        'yt-dlp', q(directUrl),
        '-o', q(tempPath),
        '--format', '"bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"',
        '--merge-output-format', 'mp4',
        '--no-playlist',
        '--quiet',
      ].join(' ')
      await execAsync(dlCmd, DL_OPTS)
    } else {
      // YouTube / C-SPAN: use yt-dlp --download-sections for efficient range download
      const startFmt = fmtSec(start)
      const endFmt   = fmtSec(end)
      const dlCmd = [
        'yt-dlp', q(url),
        '--download-sections', q(`*${startFmt}-${endFmt}`),
        '--force-keyframes-at-cuts',
        '-o', q(tempPath),
        '--format', '"bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"',
        '--merge-output-format', 'mp4',
        '--no-playlist',
        '--quiet',
      ].join(' ')
      await execAsync(dlCmd, DL_OPTS)
    }

    if (!fs.existsSync(tempPath)) throw new Error('yt-dlp did not produce an output file')

    // Trim to exact duration with ffmpeg (also re-encodes for playback compatibility)
    await trimWithFfmpeg(tempPath, outputPath, duration)
    fs.unlinkSync(tempPath)

    if (!fs.existsSync(outputPath)) throw new Error('ffmpeg trim did not produce output file')

    const realDuration = await getVideoDuration(outputPath) || duration

    return {
      clip_id:    id,
      file:       `/library/clips/${filename}`,
      title:      title || `${source} clip`,
      source,
      license,
      source_url: url,
      tags:       tags.map(t => t.toLowerCase().trim()).filter(Boolean),
      mood,
      category,
      duration:   realDuration,
      description: '',
      warning,
      added_at:   new Date().toISOString(),
      project_id: projectId || null,
    }
  } catch (err) {
    if (fs.existsSync(tempPath))   try { fs.unlinkSync(tempPath)   } catch {}
    if (fs.existsSync(outputPath)) try { fs.unlinkSync(outputPath) } catch {}
    throw err
  }
}

module.exports = { downloadClip, getVideoDuration, MAX_SECONDS }
