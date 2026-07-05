import { staticFile } from 'remotion'

// Bare relative paths like "images/proj_x__scene_001.jpg" or "audio/proj_x__scene_001.mp3"
// come from server/routes/render.js's resolveRenderAssetPath (CLI render only), which
// synced the file into remotion/public/<category>/. staticFile() is required to resolve
// them correctly: during CLI render it serves from "/public/<category>/..." (Remotion's
// bundler copies remotion/public/ into the bundle under a "/public" mount and injects
// window.remotion_staticBase = "/public" for staticFile() to read), while in a bare
// @remotion/player embed (no Remotion bundle HTML wrapper, so that global is never set)
// it resolves to "/<category>/..." instead — which is exactly what the /images, /audio,
// /clips Express routes (server/index.js) serve for browser preview. Hardcoding either
// shape breaks the other context, which is why this must go through staticFile() itself
// rather than string-concatenating a URL by hand.
//
// Browser-preview values are always root-relative ("/projects/...") or full "http://..."
// URLs already served correctly via Express/Vite — pass those through untouched.
export function resolveAssetSrc(src) {
  if (!src) return null
  if (src.startsWith('/') || /^https?:\/\//.test(src)) return src
  return staticFile(src)
}
