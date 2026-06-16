const fs   = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')

function ensureDirectories() {
  const dirs = [
    'projects',
    'library/clips',
    'library/music',
    'library/ambient',
    'library/stings',
    'library/overlay-sounds',
    'library/sounds',
    'remotion/public/clips',
  ]
  dirs.forEach(dir => {
    const full = path.join(ROOT, dir)
    if (!fs.existsSync(full)) {
      fs.mkdirSync(full, { recursive: true })
      console.log('[startup] created:', dir)
    }
  })
}

function syncClipsToRemotion() {
  const src  = path.join(ROOT, 'library/clips')
  const dest = path.join(ROOT, 'remotion/public/clips')

  if (!fs.existsSync(src)) return

  const files = fs.readdirSync(src).filter(f => /\.(mp4|webm|mov)$/i.test(f))
  let synced = 0
  files.forEach(f => {
    const d = path.join(dest, f)
    if (!fs.existsSync(d)) {
      try { fs.copyFileSync(path.join(src, f), d); synced++ } catch {}
    }
  })

  if (files.length > 0) {
    console.log(`[startup] clips: ${files.length} total, ${synced} synced to remotion/public/clips`)
  }
}

function checkDependencies() {
  const { execSync } = require('child_process')

  const tools = [
    { cmd: 'ffmpeg -version',   name: 'ffmpeg' },
    { cmd: 'ffprobe -version',  name: 'ffprobe' },
    { cmd: 'yt-dlp --version',  name: 'yt-dlp' },
    { cmd: 'higgsfield --version', name: 'higgsfield CLI' },
  ]

  tools.forEach(({ cmd, name }) => {
    try {
      execSync(cmd, { stdio: 'ignore' })
      console.log(`[startup] ✓ ${name}`)
    } catch {
      console.warn(`[startup] ✗ ${name} not found`)
    }
  })
}

module.exports = { ensureDirectories, syncClipsToRemotion, checkDependencies }
