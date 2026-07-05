import { Video, staticFile, AbsoluteFill, delayRender, continueRender } from 'remotion';
import { useState, useEffect } from 'react';
import { FilmGrain, Vignette, ColorGrade, LightLeak, LetterboxBars, SceneFade } from './effects/CinematicEffects';
import SceneOverlays from './overlays/SceneOverlays';
import PlaceholderScene from './PlaceholderScene';

// A missing/slow clip must never hang the render: Remotion's own <Video> calls
// delayRender() internally while loading Html5Video duration, and an unresolved
// handle aborts the ENTIRE render once the CLI's --timeout elapses — potentially
// hours into a long render. This bounds that wait to CLIP_CHECK_TIMEOUT_MS and
// falls back to PlaceholderScene instead of ever letting it hang.
const CLIP_CHECK_TIMEOUT_MS = 8000;

// Derive the bare filename staticFile('clips/<filename>') expects from whatever
// shape the clip's stored `file` field takes — a bare filename, a
// "/library/clips/x.mp4" relative path, or a full "http://host/.../x.mp4" URL.
// Only the basename is ever used: staticFile() resolves it against Remotion's own
// bundled public/ folder, never against clip.file's original origin/directory.
function extractClipFilename(file) {
  if (!file) return null;
  return file.split('/').pop().split('\\').pop().split('?')[0] || null;
}

export const FootageScene = ({ clip, scene, overlayInDelaySec = 0 }) => {
  const [error, setError]       = useState(false);
  const [clipReady, setClipReady] = useState(false);
  const mood = scene?.mood || 'neutral';
  const grade = scene?.grade || 'cool_blue';
  const filename = extractClipFilename(clip?.file);
  const src = filename ? staticFile(`clips/${filename}`) : null;

  // Bounded pre-check: confirm the clip is actually reachable before Remotion's own
  // <Video> tries to load it. A probe <video> element asks the browser for the same
  // duration metadata Remotion needs, gated by our OWN delayRender with a short
  // timeoutInMilliseconds — so a 404 or a stalled fetch resolves to the
  // PlaceholderScene fallback in seconds instead of hanging until the render aborts.
  useEffect(() => {
    if (!src) return undefined;
    setClipReady(false);
    setError(false);

    const handle = delayRender(`FootageScene: verifying clip ${filename}`, {
      timeoutInMilliseconds: CLIP_CHECK_TIMEOUT_MS,
    });

    let settled = false;
    const settle = (ok) => {
      if (settled) return;
      settled = true;
      if (!ok) setError(true);
      setClipReady(true);
      continueRender(handle);
    };

    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => settle(true);
    probe.onerror = () => settle(false);
    probe.src = src;

    // Fires slightly before delayRender's own timeout so we always get the chance to
    // fall back gracefully ourselves rather than letting Remotion's timeout abort the render.
    const fallbackTimer = setTimeout(() => settle(false), CLIP_CHECK_TIMEOUT_MS - 500);

    return () => {
      clearTimeout(fallbackTimer);
      probe.onloadedmetadata = null;
      probe.onerror = null;
      probe.src = '';
      // Unmounting before the probe settled (e.g. scene changed early) — clear the
      // delayRender handle so it can never leak, but skip setState on the way out.
      if (!settled) {
        settled = true;
        continueRender(handle);
      }
    };
  }, [src, filename]);

  if (!filename || !clipReady || error) {
    return <PlaceholderScene scene={scene} />;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      <Video
        src={src}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        muted
        volume={0}
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
