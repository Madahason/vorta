function basicAuth(req, res, next) {
  // Skip auth in development
  if (process.env.NODE_ENV !== 'production') return next()

  // Skip auth for health check so Railway can reach it without credentials
  if (req.path === '/health') return next()

  const username = process.env.BASIC_AUTH_USER || 'admin'
  const password = process.env.BASIC_AUTH_PASS || 'vorta2024'

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Vorta"')
    return res.status(401).send('Authentication required')
  }

  const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8')
  const colonIdx    = credentials.indexOf(':')
  const user        = credentials.slice(0, colonIdx)
  const pass        = credentials.slice(colonIdx + 1)

  if (user !== username || pass !== password) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Vorta"')
    return res.status(401).send('Invalid credentials')
  }

  next()
}

module.exports = basicAuth
