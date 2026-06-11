import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'

// Props: to (number), from (number), label (string), prefix (string), suffix (string)
// Backward compat: value= is accepted as alias for to=
export default function AnimatedCounter({ to, from = 0, value, label = '', prefix = '', suffix = '' }) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const target = to ?? value ?? 1000
  const origin = from ?? 0

  const progress = spring({
    frame,
    fps,
    config: { damping: 40, stiffness: 60, mass: 1.2 },
    durationInFrames: Math.min(durationInFrames - 10, durationInFrames * 0.85),
  })

  const current = origin + Math.round(progress * (target - origin))
  const formatted = current.toLocaleString()

  const appear = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  // Accent bar slides down
  const barH = interpolate(frame, [0, 18], [0, 72], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  // Label slides up
  const labelY = interpolate(frame, [8, 24], [12, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })
  const labelOp = interpolate(frame, [8, 24], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{
      background: '#080808',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
        {/* Vertical accent bar */}
        <div style={{
          width: 3,
          height: barH,
          background: 'rgba(255,255,255,0.7)',
          borderRadius: 2,
          alignSelf: 'center',
        }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Number row */}
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            opacity: appear,
          }}>
            {prefix && (
              <span style={{
                fontSize: 52,
                fontWeight: 300,
                color: 'rgba(255,255,255,0.38)',
                letterSpacing: -1,
                lineHeight: 1,
              }}>
                {prefix}
              </span>
            )}
            <span style={{
              fontSize: 108,
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: -5,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {formatted}
            </span>
            {suffix && (
              <span style={{
                fontSize: 52,
                fontWeight: 300,
                color: 'rgba(255,255,255,0.38)',
                letterSpacing: -1,
                lineHeight: 1,
              }}>
                {suffix}
              </span>
            )}
          </div>

          {/* Label */}
          {label && (
            <div style={{
              fontSize: 16,
              fontWeight: 500,
              color: 'rgba(255,255,255,0.30)',
              letterSpacing: 5,
              textTransform: 'uppercase',
              opacity: labelOp,
              transform: `translateY(${labelY}px)`,
            }}>
              {label}
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  )
}
