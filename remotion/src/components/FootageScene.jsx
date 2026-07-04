import { Video, staticFile, AbsoluteFill } from 'remotion';
import { useState } from 'react';
import { FilmGrain, Vignette, ColorGrade, LightLeak, LetterboxBars, SceneFade } from './effects/CinematicEffects';
import SceneOverlays from './overlays/SceneOverlays';

export const FootageScene = ({ clip, scene, overlayInDelaySec = 0 }) => {
  const [error, setError] = useState(false);
  const mood = scene?.mood || 'neutral';
  const grade = scene?.grade || 'cool_blue';
  const filename = clip?.file ? clip.file.split('/').pop().split('\\').pop() : null;

  if (error || !filename) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 14 }}>{!filename ? 'No clip selected' : 'Clip unavailable'}</div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      <Video
        src={staticFile(`clips/${filename}`)}
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
