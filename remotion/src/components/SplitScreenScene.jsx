import { LetterboxBars, FilmGrain, Vignette, ColorGrade, SceneFade } from './effects/CinematicEffects';
import SceneOverlays from './overlays/SceneOverlays';

// FT-7: dual-panel split-screen render for a single scene. Deliberately static (no Ken Burns)
// — see the note in Documentary.jsx's SceneRenderer for why animating two independent panels
// was pushed out of this phase's scope rather than risking the existing single-panel Ken
// Burns behavior in ImageScene.jsx. Reuses the same "always-on" cinematic effects ImageScene
// applies (color grade, vignette, film grain, scene fade, letterbox) so a split-screen scene
// doesn't look visually disconnected from the rest of the documentary; skips the
// conditional/mood-specific ones (camera shake, dust, halation, light leak) to keep this new
// component minimal.
const isValidUrl = (url) => url && (url.startsWith('/') || url.startsWith('http') || url.match(/^[A-Z]:\\/));

function Panel({ src, sceneId, label }) {
  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#0a0a0a' }}>
      {isValidUrl(src) ? (
        <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{
          width: '100%', height: '100%',
          background: 'linear-gradient(135deg, #0d0d0d 0%, #1a1a2e 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ color: 'rgba(255,255,255,0.12)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.15em' }}>
            Scene {sceneId} · {label}
          </div>
        </div>
      )}
    </div>
  );
}

export const SplitScreenScene = ({ scene, overlayInDelaySec = 0 }) => {
  const grade = scene.grade || 'cool_blue';
  const isHorizontal = scene.layout === 'split_horizontal'; // left / right
  // split_vertical = top / bottom

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', backgroundColor: '#0a0a0a' }}>
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: isHorizontal ? 'row' : 'column' }}>
        <Panel src={scene.image_path} sceneId={scene.scene_id} label="primary" />
        <div style={{
          width:  isHorizontal ? 2 : '100%',
          height: isHorizontal ? '100%' : 2,
          background: 'rgba(0,0,0,0.6)',
          flexShrink: 0,
        }} />
        <Panel src={scene.secondary_image_path} sceneId={scene.scene_id} label="secondary" />
      </div>

      <ColorGrade grade={grade} />
      <Vignette intensity={0.45} />
      <FilmGrain intensity={0.055} />
      <SceneFade fadeInFrames={6} fadeOutFrames={6} />
      <LetterboxBars enabled={scene.letterbox !== false} />

      <SceneOverlays overlays={scene.overlays || []} transitionInSeconds={overlayInDelaySec} />
    </div>
  );
};

export default SplitScreenScene;
