import { AbsoluteFill, useCurrentFrame, interpolate, spring } from 'remotion'

// Props: items — [{ label, value, color? }], title (string), unit (string '$' / '%' etc.)
const DEFAULT_ITEMS = [
  { label: 'Before', value: 42 },
  { label: 'After',  value: 87 },
]

export default function ComparisonChart({ items = DEFAULT_ITEMS, title = '', unit = '' }) {
  const frame = useCurrentFrame()
  const { fps } = { fps: 30 }

  const maxValue = Math.max(...items.map(it => it.value), 1)

  const titleOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  const COLORS = ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0.38)', 'rgba(255,255,255,0.15)']

  return (
    <AbsoluteFill style={{
      background: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
      padding: '60px 160px',
    }}>
      {title && (
        <div style={{
          fontSize: 18,
          fontWeight: 400,
          color: 'rgba(255,255,255,0.3)',
          letterSpacing: 4,
          textTransform: 'uppercase',
          marginBottom: 50,
          opacity: titleOpacity,
        }}>
          {title}
        </div>
      )}

      {/* Bars */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 40,
        width: '100%',
        maxWidth: 700,
        height: 300,
      }}>
        {items.map((item, i) => {
          const delay   = 10 + i * 12
          const barFill = spring({
            frame: Math.max(0, frame - delay),
            fps: 30,
            config: { damping: 60, stiffness: 60, mass: 0.8 },
          })
          const barHeight  = (item.value / maxValue) * 280 * barFill
          const barColor   = item.color || COLORS[i % COLORS.length]
          const valOpacity = interpolate(frame, [delay + 10, delay + 20], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          })

          return (
            <div key={i} style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
            }}>
              {/* Value label above bar */}
              <div style={{
                fontSize: 28,
                fontWeight: 700,
                color: barColor,
                letterSpacing: -1,
                opacity: valOpacity,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {unit}{item.value.toLocaleString()}
              </div>

              {/* Bar */}
              <div style={{
                width: '100%',
                height: barHeight,
                background: barColor,
                borderRadius: '4px 4px 0 0',
                minHeight: 2,
              }} />

              {/* Label below */}
              <div style={{
                fontSize: 14,
                fontWeight: 400,
                color: 'rgba(255,255,255,0.30)',
                letterSpacing: 2,
                textTransform: 'uppercase',
                opacity: valOpacity,
                textAlign: 'center',
              }}>
                {item.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* Baseline */}
      <div style={{
        width: '100%', maxWidth: 700,
        height: 1,
        background: 'rgba(255,255,255,0.08)',
        marginTop: 0,
      }} />
    </AbsoluteFill>
  )
}
