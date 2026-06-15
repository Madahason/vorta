import { useCurrentFrame, useVideoConfig, interpolate, random } from 'remotion';

export const LetterboxBars = ({ enabled = true }) => {
  if (!enabled) return null;
  const BAR_HEIGHT = '12%';
  return (
    <>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: BAR_HEIGHT, background: '#000', zIndex: 50, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: BAR_HEIGHT, background: '#000', zIndex: 50, pointerEvents: 'none' }} />
    </>
  );
};

export const FilmGrain = ({ intensity = 0.06 }) => {
  const frame = useCurrentFrame();
  const seed = (frame * 7 + 13) % 1000;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 30, pointerEvents: 'none', opacity: intensity, mixBlendMode: 'overlay' }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <filter id={`grain_${frame}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain_${frame})`} />
      </svg>
    </div>
  );
};

export const Vignette = ({ intensity = 0.45, animated = false, mood = 'neutral' }) => {
  const frame = useCurrentFrame();
  const pulseIntensity = animated && ['tense', 'dramatic'].includes(mood)
    ? intensity + Math.sin(frame * 0.08) * 0.08
    : intensity;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 25, pointerEvents: 'none',
      background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${pulseIntensity * 0.5}) 70%, rgba(0,0,0,${pulseIntensity}) 100%)`
    }} />
  );
};

const GRADES = {
  neutral:       { filter: 'contrast(1.05) saturate(0.95) brightness(0.98)', overlay: null },
  cool_blue:     { filter: 'contrast(1.08) saturate(0.85) brightness(0.95)', overlay: 'rgba(20,40,80,0.10)' },
  warm_amber:    { filter: 'contrast(1.06) saturate(0.90) brightness(0.97) sepia(0.15)', overlay: 'rgba(120,80,20,0.08)' },
  desaturated:   { filter: 'contrast(1.12) saturate(0.45) brightness(0.92)', overlay: 'rgba(0,0,0,0.05)' },
  magnates:      { filter: 'contrast(1.25) saturate(1.1) brightness(0.88)', overlay: null, shadows: 'rgba(0,20,30,0.15)', highlights: 'rgba(180,100,30,0.08)' },
  high_contrast: { filter: 'contrast(1.30) saturate(0.80) brightness(0.90)', overlay: 'rgba(0,0,0,0.08)' }
};

export const ColorGrade = ({ grade = 'cool_blue' }) => {
  const config = GRADES[grade] || GRADES.cool_blue;
  return (
    <>
      {config.filter && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none', backdropFilter: config.filter, WebkitBackdropFilter: config.filter }} />
      )}
      {config.overlay && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 21, pointerEvents: 'none', background: config.overlay, mixBlendMode: 'multiply' }} />
      )}
      {config.shadows && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 22, pointerEvents: 'none', background: `radial-gradient(ellipse at 30% 70%, ${config.shadows} 0%, transparent 60%)`, mixBlendMode: 'multiply' }} />
      )}
      {config.highlights && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 23, pointerEvents: 'none', background: `radial-gradient(ellipse at 70% 30%, ${config.highlights} 0%, transparent 60%)`, mixBlendMode: 'screen' }} />
      )}
    </>
  );
};

export const LightLeak = ({ mood = 'neutral', enabled = true }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  if (!enabled) return null;
  const startFlare = interpolate(frame, [0, 8, 20], [0.6, 0.3, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const LEAK_COLORS = {
    tense: 'rgba(180,30,30,0.15)', dramatic: 'rgba(200,140,30,0.12)',
    triumphant: 'rgba(255,200,50,0.10)', somber: 'rgba(50,80,120,0.12)',
    reflective: 'rgba(100,140,180,0.08)', anticipatory: 'rgba(180,100,30,0.10)',
    institutional: 'rgba(80,100,80,0.08)', neutral: 'rgba(200,180,140,0.06)'
  };
  const leakColor = LEAK_COLORS[mood] || LEAK_COLORS.neutral;
  if (startFlare <= 0) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none', opacity: startFlare }}>
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${leakColor} 0%, transparent 50%)`, mixBlendMode: 'screen' }} />
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(315deg, ${leakColor} 0%, transparent 40%)`, mixBlendMode: 'screen', opacity: 0.5 }} />
    </div>
  );
};

export const Halation = ({ enabled = false, intensity = 0.08 }) => {
  if (!enabled) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 26, pointerEvents: 'none', backdropFilter: `blur(${intensity * 100}px) saturate(1.5)`, WebkitBackdropFilter: `blur(${intensity * 100}px) saturate(1.5)`, mixBlendMode: 'screen', opacity: intensity }} />
  );
};

export const DustParticles = ({ enabled = false, count = 12 }) => {
  const frame = useCurrentFrame();
  if (!enabled) return null;
  const particles = Array.from({ length: count }, (_, i) => {
    const seed1 = random(`px_${i}`);
    const seed2 = random(`py_${i}`);
    const seed3 = random(`ps_${i}`);
    const seed4 = random(`po_${i}`);
    const speed = 0.05 + seed3 * 0.1;
    return {
      x: ((seed1 * 100 + frame * speed * (i % 2 === 0 ? 1 : -0.5)) % 100 + 100) % 100,
      y: ((seed2 * 100 + frame * speed * 0.3) % 100 + 100) % 100,
      size: 1 + seed3 * 2,
      opacity: 0.1 + seed4 * 0.2
    };
  });
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 35, pointerEvents: 'none' }}>
      {particles.map((p, i) => (
        <div key={i} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, borderRadius: '50%', background: 'rgba(255,255,240,0.8)', opacity: p.opacity }} />
      ))}
    </div>
  );
};

export const SceneFade = ({ fadeInFrames = 8, fadeOutFrames = 8 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = interpolate(
    frame,
    [0, fadeInFrames, durationInFrames - fadeOutFrames, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  if (opacity >= 1) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 45, pointerEvents: 'none', background: '#000', opacity: 1 - opacity }} />
  );
};
