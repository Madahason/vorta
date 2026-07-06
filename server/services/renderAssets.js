const path = require('path');
const { getPublicUrl } = require('./s3');

// resolveRenderAssetUrl — the ONE conversion point for every asset type (image, audio,
// clip, uploaded narration, and — once that feature ships — library music/ambient/
// stings/overlay-sounds) that a Lambda render needs resolved to an S3 URL.
//
// Lambda functions can't reach localhost or local disk, so every asset a render
// references must live in S3. This function computes the S3 URL an asset WILL have — it
// does not upload anything and does not check the object exists (that's Phase 2's
// uploadFile()/objectExists(), server/services/s3.js). Pure string logic: no fs, no
// network access, so it's testable without AWS credentials — see renderAssets.test.js.
//
// rawPath: whatever shape the caller currently has on hand — a stale
//   "http://localhost:PORT/projects/proj_x/audio/scene_001.mp3" URL, a root-relative
//   "/projects/proj_x/audio/scene_001.mp3" or "/library/clips/x.mp4" path, or a bare
//   filename. Only the basename is ever used — origin, port, and directory prefix are
//   discarded, mirroring how the local resolveRenderAssetPath (server/routes/render.js)
//   and FootageScene.jsx's extractClipFilename already treat these fields.
//
// category: 'images' | 'audio' | 'clips' | a future library type ('music', 'ambient',
//   'stings', 'overlay-sounds', ...).
//
// namespace: the projectId for per-project assets (images, audio) — already in this
//   codebase's own "proj_<id>" string form (e.g. "proj_1783141891744", same value passed
//   as `namespace` to the local resolveRenderAssetPath in server/routes/render.js), so it
//   is used as-is, not re-prefixed. Every project reuses filenames like "scene_001.mp3",
//   so the key must be scoped to avoid collisions.
//   Pass null/undefined for shared assets: real_footage clips already live in one
//   deduplicated library/clips/ folder reused across every project (namespacing them per
//   project would re-upload the same clip library once per project), and library
//   music/ambient/stings/overlay-sounds are the same kind of shared, cross-project
//   resource — so both key under the shared "library/<category>/" tier, never
//   "<projectId>/<category>/".
//
// Returns null if rawPath is falsy (nothing to resolve — same "not generated yet" case
// the local resolver treats as a no-op, not a validation failure).
function resolveRenderAssetUrl(rawPath, category, namespace) {
  if (!rawPath) return null;

  const withoutOrigin = rawPath.replace(/^https?:\/\/[^/]+/, '');
  const withoutPrefix = withoutOrigin.replace(/^\/(projects|public)\//, '');
  const basename       = path.basename(withoutPrefix.split('?')[0]);

  const key = namespace
    ? `${namespace}/${category}/${basename}`
    : `library/${category}/${basename}`;

  return getPublicUrl(key);
}

module.exports = { resolveRenderAssetUrl };
