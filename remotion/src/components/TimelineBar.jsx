import { AbsoluteFill, useCurrentFrame, interpolate, spring } from 'remotion'

// Props: events — [{ year, label }], title (string)
const DEFAULT_EVENTS = [
  { year: '1997', label: 'Founded' },
  { year: '2001', label: 'IPO' },
  { year: '2007', label: 'Breakthrough' },
  { year: '2012', label: 'Expansion' },
  { year: '2018', label: 'Peak' },
]

export default function TimelineBar({ events = DEFAULT_EVENTS, title = '' }) {
  const frame = useCurrentFrame()

  // Track draws left to right
  const lineProgress = interpolate(frame, [8, 48], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  const titleOp = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{
      background: '#080808',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      justifyContent: 'center',
      fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
      padding: '0 100px',
    }}>
      {title && (
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.25)',
          letterSpacing: 5,
          textTransform: 'uppercase',
          marginBottom: 56,
          opacity: titleOp,
        }}>
          {title}
        </div>
      )}

      {/* Track + dots */}
      <div style={{ position: 'relative', width: '100%', height: 80 }}>
        {/* Background track */}
        <div style={{
          position: 'absolute',
          top: 20, left: 0, right: 0, height: 1,
          background: 'rgba(255,255,255,0.06)',
        }} />
        {/* Fill */}
        <div style={{
          position: 'absolute',
          top: 20, left: 0, height: 1,
          width: `${lineProgress * 100}%`,
          background: 'rgba(255,255,255,0.30)',
        }} />

        {/* Dots + labels */}
        {events.map((event, i) => {
          const pct = events.length === 1 ? 0.5 : i / (events.length - 1)
          const visible = lineProgress >= pct - 0.005

          const dotFrame = spring({
            frame: Math.max(0, frame - (8 + i * 6)),
            fps: 30,
            config: { damping: 28, stiffness: 220, mass: 0.6 },
          })

          const labelOp = interpolate(frame, [12 + i * 6, 20 + i * 6], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          })

          return (
            <div key={i} style={{
              position: 'absolute',
              left: `${pct * 100}%`,
              top: 0,
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              opacity: visible ? 1 : 0,
            }}>
              {/* Year above track */}
              <div style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'rgba(255,255,255,0.55)',
                letterSpacing: 1,
                marginBottom: 6,
                fontVariantNumeric: 'tabular-nums',
                opacity: labelOp,
              }}>
                {event.year}
              </div>

              {/* Spring dot on track */}
              <div style={{
                width: 8, height: 8,
                borderRadius: '50%',
                background: '#ffffff',
                transform: `scale(${dotFrame})`,
                boxShadow: '0 0 10px rgba(255,255,255,0.4)',
              }} />

              {/* Label below track */}
              <div style={{
                marginTop: 8,
                fontSize: 11,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.25)',
                letterSpacing: 2,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                opacity: labelOp,
              }}>
                {event.label}
              </div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}
