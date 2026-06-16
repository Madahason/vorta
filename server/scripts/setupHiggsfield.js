const fs   = require('fs')
const path = require('path')
const os   = require('os')

function setupHiggsfieldCredentials() {
  // Windows uses the user's existing CLI login — no setup needed
  if (process.platform === 'win32') {
    console.log('[higgsfield] Windows — using existing credentials')
    return
  }

  const accessToken  = process.env.HIGGSFIELD_ACCESS_TOKEN
  const refreshToken = process.env.HIGGSFIELD_REFRESH_TOKEN

  if (!accessToken || !refreshToken) {
    console.warn('[higgsfield] HIGGSFIELD_ACCESS_TOKEN / HIGGSFIELD_REFRESH_TOKEN not set — image generation will fail')
    return
  }

  const credDir  = path.join(os.homedir(), '.config', 'higgsfield')
  const credPath = path.join(credDir, 'credentials.json')

  if (!fs.existsSync(credDir)) {
    fs.mkdirSync(credDir, { recursive: true })
  }

  fs.writeFileSync(credPath, JSON.stringify({
    access_token:  accessToken,
    refresh_token: refreshToken,
  }, null, 2))

  console.log('[higgsfield] credentials written to:', credPath)
}

module.exports = { setupHiggsfieldCredentials }
