import { useCurrentFrame, useVideoConfig, interpolate, random } from 'remotion'

// ── LetterboxBars ─────────────────────────────────────────────────────────────

export const LetterboxBars = ({ enabled = true }) => {
  if (!enabled) return null
  const bar = { position: 'absolute', left: 0, right: 0, height: '12%', background: '#000', zIndex: 50, pointerEvents: 'none' }
  return (
    <>
      <div style={{ ...bar, top: 0 }} />
      <div style={{ ...bar, bottom: 0 }} />
    </>
  )
}

// ── FilmGrain ─────────────────────────────────────────────────────────────────
// SVG feTurbulence approach — works in Remotion SSR without canvas/useEffect

export const FilmGrain = ({ intensity = 0.06 }) => {
  const frame = useCurrentFrame()
  const seed = (frame * 7 + 13) % 1000
  return (
    <svg
      width="100%" height="100%"
      style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none', mixBlendMode: 'overlay', opacity: Math.min(intensity * 14, 1) }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id={`grain-${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>
      <rect width="100%" height="100%" filter={`url(#grain-${seed})`} />
    </svg>
  )
}

// ── Vignette ──────────────────────────────────────────────────────────────────

const ANIMATED_MOODS = new Set(['tense', 'dramatic'])

export const Vignette = ({ intensity = 0.45, animated = false, mood = 'neutral' }) => {
  const frame = useCurrentFrame()
  const shouldAnimate = animated || ANIMATED_MOODS.has(mood)
  const pulse = shouldAnimate ? Math.sin(frame * 0.05) * 0.07 : 0
  const eff = Math.min(intensity + pulse, 1)
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
      background: `radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,${eff.toFixed(3)}) 100%)`,
    }} />
  )
}

// ── ColorGrade ────────────────────────────────────────────────────────────────

const GRADES = {
  neutral: {
    filter: 'contrast(1.0) saturate(1.0) brightness(1.0)',
    overlay: null,
  },
  cool_blue: {
    filter: 'contrast(1.08) saturate(0.92) brightness(0.97)',
    overlay: { background: 'rgba(20,40,80,0.12)', mixBlendMode: 'multiply' },
  },
  warm_amber: {
    filter: 'contrast(1.05) saturate(1.1) brightness(1.02)',
    overlay: { background: 'rgba(100,60,10,0.10)', mixBlendMode: 'multiply' },
  },
  desaturated: {
    filter: 'contrast(1.12) saturate(0.35) brightness(0.92)',
    overlay: { background: 'rgba(30,30,40,0.15)', mixBlendMode: 'multiply' },
  },
  magnates: {
    filter: 'contrast(1.25) saturate(1.15) brightness(0.95)',
    tealShadow: 'radial-gradient(ellipse at 20% 80%, rgba(0,80,80,0.30) 0%, transparent 60%)',
    orangeHighlight: 'radial-gradient(ellipse at 80% 20%, rgba(180,80,0,0.22) 0%, transparent 55%)',
  },
  high_contrast: {
    filter: 'contrast(1.40) saturate(0.80) brightness(0.90)',
    overlay: { background: 'rgba(0,0,0,0.10)', mixBlendMode: 'multiply' },
  },
}

export const ColorGrade = ({ grade = 'cool_blue' }) => {
  const g = GRADES[grade] || GRADES.neutral
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none', backdropFilter: g.filter }}>
      {g.overlay && <div style={{ position: 'absolute', inset: 0, ...g.overlay }} />}
      {g.tealShadow && <div style={{ position: 'absolute', inset: 0, background: g.tealShadow, mixBlendMode: 'multiply' }} />}
      {g.orangeHighlight && <div style={{ position: 'absolute', inset: 0, background: g.orangeHighlight, mixBlendMode: 'screen' }} />}
    </div>
  )
}

// ── LightLeak ─────────────────────────────────────────────────────────────────

const LEAK_COLORS = {
  triumphant:   'rgba(255,200,60,',
  anticipatory: 'rgba(255,140,30,',
  intimate:     'rgba(220,100,100,',
  reflective:   'rgba(100,150,255,',
  neutral:      'rgba(255,220,160,',
}

export const LightLeak = ({ mood = 'neutral', enabled = true }) => {
  const frame = useCurrentFrame()
  if (!enabled) return null
  const opacity = interpolate(frame, [0, 8, 20], [0.6, 0.3, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })
  if (opacity <= 0) return null
  const colorBase = LEAK_COLORS[mood] || LEAK_COLORS.neutral
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 8, pointerEvents: 'none', opacity,
      background: `radial-gradient(ellipse at 15% 10%, ${colorBase}0.85) 0%, ${colorBase}0) 60%)`,
      mixBlendMode: 'screen',
    }} />
  )
}

// ── Halation ──────────────────────────────────────────────────────────────────

export const Halation = ({ enabled = false, intensity = 0.08 }) => {
  if (!enabled) return null
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none',
      backdropFilter: `blur(${intensity * 60}px) saturate(1.6)`,
      background: `rgba(255,140,60,${intensity * 0.5})`,
      mixBlendMode: 'screen',
    }} />
  )
}

// ── DustParticles ─────────────────────────────────────────────────────────────
// Uses Remotion random() for deterministic positioning across frames

export const DustParticles = ({ enabled = false, count = 12 }) => {
  const frame = useCurrentFrame()
  if (!enabled) return null
  const particles = Array.from({ length: count }, (_, idx) => {
    const seed = idx * 1000
    const x = random(`dust-x-${idx}`) * 100
    const baseY = random(`dust-y-${idx}`) * 100
    const speed = random(`dust-s-${idx}`) * 0.02 + 0.005
    const y = (baseY + frame * speed) % 100
    const size = random(`dust-sz-${idx}`) * 2 + 0.5
    const opacity = random(`dust-op-${idx}`) * 0.35 + 0.05
    return { x, y, size, opacity, seed }
  })
  return (
    <svg
      width="100%" height="100%"
      style={{ position: 'absolute', inset: 0, zIndex: 9, pointerEvents: 'none' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {particles.map((p, i) => (
        <circle
          key={i}
          cx={`${p.x}%`} cy={`${p.y}%`}
          r={p.size}
          fill={`rgba(220,210,190,${p.opacity})`}
        />
      ))}
    </svg>
  )
}

// ── SceneFade ─────────────────────────────────────────────────────────────────

export const SceneFade = ({ fadeInFrames = 8, fadeOutFrames = 8 }) => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const opacity = interpolate(
    frame,
    [0, fadeInFrames, durationInFrames - fadeOutFrames, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )
  if (Math.abs(opacity - 1) < 0.001) return null
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none',
      background: '#000', opacity: 1 - opacity,
    }} />
  )
}
