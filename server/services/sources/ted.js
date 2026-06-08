const { execAsync, SEARCH_OPTS } = require('../ytdlp')

async function searchTED(query, maxResults = 5) {
  const n       = Math.min(maxResults, 10)
  const encoded = encodeURIComponent(query)
  const command = [
    'yt-dlp',
    `"https://www.youtube.com/@TED/search?query=${encoded}"`,
    '--flat-playlist',
    '--print', '"%(id)s|||%(title)s|||%(duration)s|||%(webpage_url)s|||%(thumbnail)s"',
    '--playlist-end', n,
    '--no-download',
    '--quiet',
    '--no-warnings',
  ].join(' ')

  try {
    const { stdout } = await execAsync(command, { ...SEARCH_OPTS, timeout: 30000 })
    return stdout.trim().split('\n')
      .filter(Boolean)
      .map(line => {
        const [id, title, duration, url, thumbnail] = line.split('|||')
        if (!id || !title || title === 'NA') return null
        return {
          id,
          title,
          duration:  parseInt(duration) || 0,
          url:       (url && url !== 'NA') ? url : `https://www.youtube.com/watch?v=${id}`,
          thumbnail: (thumbnail && thumbnail !== 'NA') ? thumbnail : '',
          source:    'ted',
          license:   'creative_commons',
          channel:   'TED',
          description: '',
        }
      })
      .filter(Boolean)
  } catch (err) {
    console.error('[ted] search error:', err.message)
    return []
  }
}

module.exports = { searchTED }
