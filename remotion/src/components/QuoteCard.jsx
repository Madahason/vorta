import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion'

// Props: text (string), attribution (string), style ('center' | 'left')
export default function QuoteCard({ text = 'Quote goes here.', attribution = '', style = 'center' }) {
  const frame = useCurrentFrame()

  // Text fades and slides in
  const textOpacity = interpolate(frame, [8, 28], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })
  const textY = interpolate(frame, [8, 28], [20, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  // Attribution fades in later
  const attrOpacity = interpolate(frame, [30, 48], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  // Accent line grows in
  const lineWidth = interpolate(frame, [0, 20], [0, 60], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  const isCenter = style === 'center'

  return (
    <AbsoluteFill style={{
      background: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: isCenter ? 'center' : 'flex-start',
      justifyContent: 'center',
      fontFamily: "'Georgia', 'Times New Roman', serif",
      padding: isCenter ? '80px 160px' : '80px 140px',
      textAlign: isCenter ? 'center' : 'left',
    }}>
      {/* Accent line */}
      <div style={{
        width: lineWidth,
        height: 2,
        background: 'rgba(255,255,255,0.25)',
        marginBottom: 36,
        borderRadius: 1,
      }} />

      {/* Quote text */}
      <div style={{
        fontSize: 42,
        fontWeight: 400,
        fontStyle: 'italic',
        color: 'rgba(255,255,255,0.88)',
        lineHeight: 1.45,
        letterSpacing: -0.5,
        maxWidth: 900,
        opacity: textOpacity,
        transform: `translateY(${textY}px)`,
      }}>
        "{text}"
      </div>

      {/* Attribution */}
      {attribution && (
        <div style={{
          marginTop: 36,
          fontSize: 16,
          fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
          fontWeight: 400,
          color: 'rgba(255,255,255,0.30)',
          letterSpacing: 3,
          textTransform: 'uppercase',
          opacity: attrOpacity,
        }}>
          — {attribution}
        </div>
      )}
    </AbsoluteFill>
  )
}
