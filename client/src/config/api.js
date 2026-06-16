// In development Vite proxies /api, /projects, /library, /output → localhost:3001.
// In production the client is served by the same Express server, so relative
// paths resolve correctly with no prefix needed.
export const API_BASE = ''

export function apiUrl(path) {
  return `${API_BASE}${path}`
}
