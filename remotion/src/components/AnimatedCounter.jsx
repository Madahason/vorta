import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'

// Props: value (number), label (string), prefix (string '$'), suffix (string '%')
export default function AnimatedCounter({ value = 1000, label = '', prefix = '', suffix = '' }) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  // Count-up animation with spring ease for natural deceleration
  const progress = spring({
    frame,
    fps,
    config: { damping: 50, stiffness: 80, mass: 1 },
    durationInFrames: Math.min(durationInFrames - 20, durationInFrames * 0.8),
  })

  const displayValue = Math.round(progress * value)

  // Format large numbers with commas
  const formatted = displayValue.toLocaleString()

  // Label fade in
  const labelOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  // Number entrance
  const numScale = interpolate(frame, [0, 15], [0.85, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const numOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{
      background: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
    }}>
      {/* Number */}
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 6,
        opacity: numOpacity,
        transform: `scale(${numScale})`,
      }}>
        {prefix && (
          <span style={{ fontSize: 64, fontWeight: 300, color: 'rgba(255,255,255,0.4)', letterSpacing: -2 }}>
            {prefix}
          </span>
        )}
        <span style={{
          fontSize: 120,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.92)',
          letterSpacing: -6,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {formatted}
        </span>
        {suffix && (
          <span style={{ fontSize: 64, fontWeight: 300, color: 'rgba(255,255,255,0.4)', letterSpacing: -2 }}>
            {suffix}
          </span>
        )}
      </div>

      {/* Label */}
      {label && (
        <div style={{
          marginTop: 24,
          fontSize: 22,
          fontWeight: 400,
          color: 'rgba(255,255,255,0.35)',
          letterSpacing: 4,
          textTransform: 'uppercase',
          opacity: labelOpacity,
        }}>
          {label}
        </div>
      )}

      {/* Underline accent */}
      <div style={{
        marginTop: 20,
        width: interpolate(progress, [0, 1], [0, 120]),
        height: 2,
        background: 'rgba(255,255,255,0.15)',
        borderRadius: 1,
      }} />
    </AbsoluteFill>
  )
}
