import { OffthreadVideo, staticFile, AbsoluteFill } from 'remotion';
import { useState } from 'react';
import { FilmGrain, Vignette, ColorGrade, LightLeak, LetterboxBars, SceneFade } from './effects/CinematicEffects';
import SceneOverlays from './overlays/SceneOverlays';
import PlaceholderScene from './PlaceholderScene';

// OffthreadVideo decodes via ffmpeg off the main render thread instead of a browser
// <video> element — much faster than <Video>/<Html5Video> for real_footage clips, and
// it has its own bounded delayRender (below) instead of <Video>'s unbounded
// "Loading <Html5Video> duration" wait that used to be able to hang the whole render.
// 15s (not the previous <Video>-era 8s): Remotion subtracts a 2s safety margin from
// whatever is passed here, and OffthreadVideo's frame extraction goes through a
// separate compositor process — under real machine load that hop needs more slack
// than a simple fetch() did, or a merely-slow (not actually missing) clip can trip
// the timeout and abort the render instead of falling back gracefully.
const CLIP_LOAD_TIMEOUT_MS = 15000;

// Derive the bare filename staticFile('clips/<filename>') expects from whatever
// shape the clip's stored `file` field takes — a bare filename, a
// "/library/clips/x.mp4" relative path, or a full "http://host/.../x.mp4" URL.
// Only the basename is ever used: staticFile() resolves it against Remotion's own
// bundled public/ folder, never against clip.file's original origin/directory.
function extractClipFilename(file) {
  if (!file) return null;
  return file.split('/').pop().split('\\').pop().split('?')[0] || null;
}

// A real, already-resolved S3 URL — this is the shape server/routes/render.js's
// resolveAsset() gives clip.file in Lambda mode (see its comment: local mode's
// self-sufficient staticFile() derivation "has nothing to lean on" for Lambda, since a
// deployed Lambda site's bundled public/ is deliberately near-empty and never contains
// per-project or library clips — see LOCAL_ASSETS_DIR). Matched narrowly (the exact S3
// virtual-hosted-style domain shape server/services/s3.js's getPublicUrl() constructs)
// rather than "any https:// URL", so a stale http://localhost reference from older
// scenes.json data (local mode leaves clip.file untouched, whatever shape it has) can
// never be mistaken for this and used directly.
const isS3Url = (file) => typeof file === 'string' && /^https:\/\/[^/]+\.s3[.-][a-z0-9-]+\.amazonaws\.com\//i.test(file);

export const FootageScene = ({ clip, scene, overlayInDelaySec = 0 }) => {
  const [error, setError] = useState(false);
  const mood = scene?.mood || 'neutral';
  const grade = scene?.grade || 'cool_blue';
  const filename = extractClipFilename(clip?.file);
  const src = isS3Url(clip?.file) ? clip.file : (filename ? staticFile(`clips/${filename}`) : null);

  if (!src || error) {
    return <PlaceholderScene scene={scene} />;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      <OffthreadVideo
        src={src}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        muted
        volume={0}
        delayRenderTimeoutInMilliseconds={CLIP_LOAD_TIMEOUT_MS}
        onError={() => setError(true)}
      />
      <ColorGrade grade={grade} />
      <Vignette intensity={0.40} mood={mood} />
      <FilmGrain intensity={0.04} />
      <LightLeak mood={mood} enabled={true} />
      <SceneFade fadeInFrames={6} fadeOutFrames={6} />
      <LetterboxBars enabled={scene?.letterbox !== false} />

      <SceneOverlays overlays={scene?.overlays || []} transitionInSeconds={overlayInDelaySec} />
    </AbsoluteFill>
  );
};

export default FootageScene;
