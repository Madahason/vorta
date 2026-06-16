import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { LetterboxBars, FilmGrain, Vignette, ColorGrade, LightLeak, Halation, DustParticles, SceneFade } from './effects/CinematicEffects';
import { easeOut } from '../utils/easings';

function extractYear(text) {
  const match = (text || '').match(/\b(19[0-9]{2}|20[0-2][0-9])\b/);
  return match ? parseInt(match[1]) : null;
}

export const ImageScene = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const motion = scene.motion || { type: 'push_in', intensity: 'subtle' };
  const composition = scene.composition || 'medium';
  const mood = scene.mood || 'neutral';
  const grade = scene.grade || brand?.colorGrade || 'cool_blue';

  // Ken Burns — GSAP power2.out gives fast-start/heavy-deceleration for a more
  // cinematic feel than the symmetric cubic ease-in-out used previously.
  const linearT  = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const progress = easeOut(linearT);

  const SCALE_RANGES = {
    subtle:   { push_in: [1.0, 1.06], pull_out: [1.06, 1.0] },
    moderate: { push_in: [1.0, 1.10], pull_out: [1.10, 1.0] },
    strong:   { push_in: [1.0, 1.16], pull_out: [1.16, 1.0] }
  };
  const TRANSLATE_RANGES = { subtle: 3, moderate: 6, strong: 9 };
  const intensity = motion.intensity || 'subtle';
  const scaleRange = SCALE_RANGES[intensity] || SCALE_RANGES.subtle;
  const translatePct = TRANSLATE_RANGES[intensity] || 3;

  const getTransform = () => {
    switch (motion.type) {
      case 'push_in':   return `scale(${interpolate(progress, [0,1], scaleRange.push_in)})`;
      case 'pull_out':  return `scale(${interpolate(progress, [0,1], scaleRange.pull_out)})`;
      case 'drift_left':  return `scale(${1+translatePct/100}) translateX(${interpolate(progress,[0,1],[0,-translatePct])}%)`;
      case 'drift_right': return `scale(${1+translatePct/100}) translateX(${interpolate(progress,[0,1],[0,translatePct])}%)`;
      case 'drift_up':    return `scale(${1+translatePct/100}) translateY(${interpolate(progress,[0,1],[0,-translatePct])}%)`;
      case 'drift_down':  return `scale(${1+translatePct/100}) translateY(${interpolate(progress,[0,1],[0,translatePct])}%)`;
      case 'static': return 'scale(1)';
      default: return 'scale(1.03)';
    }
  };

  const getOrigin = () => {
    switch (composition) {
      case 'low_angle': return 'center bottom';
      case 'over_shoulder': return '60% 50%';
      default: return 'center center';
    }
  };

  // Camera shake — tense/dramatic/anticipatory moods only
  const SHAKE_MOODS = ['tense', 'dramatic', 'anticipatory'];
  const maxShake = SHAKE_MOODS.includes(mood)
    ? (intensity === 'strong' ? 4 : intensity === 'moderate' ? 2 : 1.5) : 0;
  const shakeTx = maxShake > 0 ? Math.sin(frame*0.13)*maxShake + Math.sin(frame*0.37)*maxShake*0.4 : 0;
  const shakeTy = maxShake > 0 ? Math.sin(frame*0.17+1.2)*maxShake + Math.sin(frame*0.41)*maxShake*0.3 : 0;
  const shakeRot = maxShake > 0 ? Math.sin(frame*0.09)*0.12 : 0;

  const year = extractYear(scene.script_excerpt || '');
  const showDust = year && year < 1990;
  const showHalation = mood === 'triumphant';
  const isValidUrl = (url) => url && (url.startsWith('/') || url.startsWith('http') || url.match(/^[A-Z]:\\/));

  return (
    <div style={{
      width: maxShake > 0 ? '105%' : '100%',
      height: maxShake > 0 ? '105%' : '100%',
      margin: maxShake > 0 ? '-2.5%' : '0',
      overflow: 'hidden', position: 'relative',
      backgroundColor: '#0a0a0a',
      transform: maxShake > 0 ? `translate(${shakeTx}px, ${shakeTy}px) rotate(${shakeRot}deg)` : undefined
    }}>

      {isValidUrl(scene.image_path) ? (
        <img
          src={scene.image_path}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: getTransform(), transformOrigin: getOrigin(), willChange: 'transform' }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #0d0d0d 0%, #1a1a2e 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <div style={{ color: 'rgba(255,255,255,0.12)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.2em' }}>Scene {scene.scene_id}</div>
          <div style={{ color: 'rgba(255,255,255,0.06)', fontSize: 11, maxWidth: 400, textAlign: 'center', lineHeight: 1.5 }}>{scene.script_excerpt?.slice(0, 80)}</div>
        </div>
      )}

      <ColorGrade grade={grade} />
      <DustParticles enabled={showDust} count={10} />
      <Halation enabled={showHalation} intensity={0.06} />
      <Vignette intensity={0.45} animated={['tense','dramatic'].includes(mood)} mood={mood} />
      <FilmGrain intensity={0.055} />
      <LightLeak mood={mood} enabled={true} />
      <SceneFade fadeInFrames={6} fadeOutFrames={6} />
      <LetterboxBars enabled={scene.letterbox !== false} />
    </div>
  );
};

export default ImageScene;
