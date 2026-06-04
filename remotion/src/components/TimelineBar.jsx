import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion'

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

  // Line draws from left to right
  const lineProgress = interpolate(frame, [10, 50], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  // Title fade
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], {
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
      padding: '0 120px',
    }}>
      {title && (
        <div style={{
          fontSize: 18,
          fontWeight: 400,
          color: 'rgba(255,255,255,0.3)',
          letterSpacing: 4,
          textTransform: 'uppercase',
          marginBottom: 60,
          opacity: titleOpacity,
        }}>
          {title}
        </div>
      )}

      {/* Timeline track */}
      <div style={{ position: 'relative', width: '100%', height: 2 }}>
        {/* Background track */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 1,
        }} />
        {/* Animated fill */}
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: `${lineProgress * 100}%`,
          background: 'rgba(255,255,255,0.25)',
          borderRadius: 1,
          transition: 'width 0ms',
        }} />

        {/* Event dots + labels */}
        {events.map((event, i) => {
          const pct = events.length === 1 ? 0.5 : i / (events.length - 1)
          const dotDelay   = 15 + i * 8
          const dotOpacity = interpolate(frame, [dotDelay, dotDelay + 10], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          })
          const dotScale = interpolate(frame, [dotDelay, dotDelay + 8], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          })
          const visible = lineProgress >= pct - 0.01

          return (
            <div key={i} style={{
              position: 'absolute',
              left: `${pct * 100}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              opacity: visible ? dotOpacity : 0,
            }}>
              {/* Dot */}
              <div style={{
                width: 10, height: 10,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.7)',
                transform: `scale(${dotScale})`,
                boxShadow: '0 0 12px rgba(255,255,255,0.3)',
              }} />

              {/* Year — above line */}
              <div style={{
                position: 'absolute',
                top: -38,
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: 15,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.65)',
                letterSpacing: 1,
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {event.year}
              </div>

              {/* Label — below line */}
              <div style={{
                position: 'absolute',
                top: 22,
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: 13,
                fontWeight: 400,
                color: 'rgba(255,255,255,0.30)',
                whiteSpace: 'nowrap',
                letterSpacing: 1,
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
