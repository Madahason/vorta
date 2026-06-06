const { exec }      = require('child_process')
const { promisify } = require('util')
const Anthropic     = require('@anthropic-ai/sdk')

const execAsync = promisify(exec)

const SEARCH_OPTS = { timeout: 60000,  maxBuffer: 5  * 1024 * 1024 }
const DL_OPTS     = { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }

async function checkYtDlp() {
  try {
    const { stdout } = await execAsync('yt-dlp --version', { timeout: 5000, maxBuffer: 65536 })
    return { installed: true, version: stdout.trim() }
  } catch {
    return { installed: false, version: null }
  }
}

// Parse JSON-per-line output from yt-dlp --dump-json
function parseDumpJson(stdout) {
  return stdout
    .split('\n')
    .filter(Boolean)
    .map(line => { try { return JSON.parse(line) } catch { return null } })
    .filter(Boolean)
    .map(v => ({
      id:          v.id          || '',
      title:       v.title       || '',
      duration:    v.duration    || 0,
      url:         v.webpage_url || (v.id ? `https://www.youtube.com/watch?v=${v.id}` : ''),
      thumbnail:   v.thumbnail   || (v.thumbnails?.[0]?.url) || '',
      license:     v.license     || '',
      channel:     v.uploader    || v.channel || '',
      description: (v.description || '').slice(0, 200),
    }))
    .filter(r => r.id && r.title)
}

// Shell-quote a path or argument (handles spaces on Windows)
const q = p => `"${String(p).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

// Convert seconds (number) to M:SS for yt-dlp --download-sections
function fmtSec(s) {
  const m   = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

async function downloadSegment(url, startSec, endSec, outputPath) {
  const start = fmtSec(startSec)
  const end   = fmtSec(endSec)
  const cmd   = [
    'yt-dlp', q(url),
    '--download-sections', q(`*${start}-${end}`),
    '--force-keyframes-at-cuts',
    '-o', q(outputPath),
    '--format', '"bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"',
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '--quiet',
  ].join(' ')
  await execAsync(cmd, DL_OPTS)
  return outputPath
}

async function downloadFull(url, outputPath) {
  const cmd = [
    'yt-dlp', q(url),
    '-o', q(outputPath),
    '--format', '"bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"',
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '--quiet',
  ].join(' ')
  await execAsync(cmd, DL_OPTS)
  return outputPath
}

async function getVideoTitle(url) {
  try {
    const cmd        = `yt-dlp ${q(url)} --print "%(title)s" --no-download --quiet`
    const { stdout } = await execAsync(cmd, { timeout: 15000, maxBuffer: 65536 })
    return stdout.trim()
  } catch {
    return ''
  }
}

async function generateDescription(title, tags) {
  try {
    const client = new Anthropic()
    const msg    = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages:   [{ role: 'user', content: `Video titled "${title}" with tags: ${tags.join(', ')}. Write ONE concise sentence describing what is visually shown. No quotes. Return only the sentence.` }],
    })
    return msg.content[0].text.trim()
  } catch {
    return title
  }
}

module.exports = {
  checkYtDlp, parseDumpJson,
  downloadSegment, downloadFull, getVideoTitle, generateDescription,
  q, fmtSec, execAsync, SEARCH_OPTS, DL_OPTS,
}
