import { AbsoluteFill, useCurrentFrame, interpolate, spring } from 'remotion'

// Props: items — [{ label, value, color? }], title (string), unit (string)
const DEFAULT_ITEMS = [
  { label: 'Before', value: 42 },
  { label: 'After',  value: 87 },
]

export default function ComparisonChart({ items = DEFAULT_ITEMS, title = '', unit = '' }) {
  const frame = useCurrentFrame()

  const maxValue = Math.max(...items.map(it => it.value), 1)

  const titleOp = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  const SHADES = [
    'rgba(255,255,255,0.80)',
    'rgba(255,255,255,0.42)',
    'rgba(255,255,255,0.60)',
    'rgba(255,255,255,0.28)',
  ]

  return (
    <AbsoluteFill style={{
      background: '#080808',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      justifyContent: 'center',
      fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
      padding: '60px 100px',
    }}>
      {title && (
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.25)',
          letterSpacing: 5,
          textTransform: 'uppercase',
          marginBottom: 48,
          opacity: titleOp,
        }}>
          {title}
        </div>
      )}

      {/* Horizontal bar rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32, width: '100%' }}>
        {items.map((item, i) => {
          const delay = 10 + i * 14
          const barFill = spring({
            frame: Math.max(0, frame - delay),
            fps: 30,
            config: { damping: 55, stiffness: 55, mass: 0.9 },
          })
          const barW = (item.value / maxValue) * 100 * barFill
          const barColor = item.color || SHADES[i % SHADES.length]

          const labelOp = interpolate(frame, [delay, delay + 10], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          })
          const valOp = interpolate(frame, [delay + 8, delay + 18], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          })

          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Label + value row */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}>
                <span style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.32)',
                  letterSpacing: 3,
                  textTransform: 'uppercase',
                  opacity: labelOp,
                }}>
                  {item.label}
                </span>
                <span style={{
                  fontSize: 26,
                  fontWeight: 700,
                  color: barColor,
                  letterSpacing: -1,
                  fontVariantNumeric: 'tabular-nums',
                  opacity: valOp,
                }}>
                  {unit}{item.value.toLocaleString()}
                </span>
              </div>

              {/* Track */}
              <div style={{ position: 'relative', height: 3, width: '100%' }}>
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 2,
                }} />
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, bottom: 0,
                  width: `${barW}%`,
                  background: barColor,
                  borderRadius: 2,
                }} />
              </div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}
