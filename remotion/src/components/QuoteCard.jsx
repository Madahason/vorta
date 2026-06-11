import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion'

// Props: quote (string), attribution (string), style ('left' | 'center')
// Backward compat: text= is accepted as alias for quote=
export default function QuoteCard({ quote, text, attribution = '', style = 'left' }) {
  const frame = useCurrentFrame()

  const displayQuote = quote || text || 'Quote goes here.'
  const words = displayQuote.split(' ')

  // Vertical accent bar grows down
  const barH = interpolate(frame, [0, 16], [0, 100], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  // Attribution fades in after words
  const lastWordFrame = 6 + words.length * 3
  const attrOp = interpolate(frame, [lastWordFrame, lastWordFrame + 18], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })
  const attrY = interpolate(frame, [lastWordFrame, lastWordFrame + 18], [8, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  const isCenter = style === 'center'

  return (
    <AbsoluteFill style={{
      background: '#080808',
      display: 'flex',
      flexDirection: 'column',
      alignItems: isCenter ? 'center' : 'flex-start',
      justifyContent: 'center',
      fontFamily: "'Georgia', 'Times New Roman', serif",
      padding: isCenter ? '80px 160px' : '80px 100px',
      textAlign: isCenter ? 'center' : 'left',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 28,
        maxWidth: 920,
      }}>
        {/* Left accent bar */}
        {!isCenter && (
          <div style={{
            flexShrink: 0,
            width: 3,
            height: barH,
            background: 'rgba(255,255,255,0.65)',
            borderRadius: 2,
            marginTop: 6,
            transition: 'height 0ms',
          }} />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {/* Word-by-word reveal */}
          <div style={{
            fontSize: 40,
            fontWeight: 400,
            fontStyle: 'italic',
            color: 'rgba(255,255,255,0.88)',
            lineHeight: 1.5,
            letterSpacing: -0.3,
          }}>
            {isCenter && (
              <span style={{ color: 'rgba(255,255,255,0.25)', marginRight: 4 }}>"</span>
            )}
            {words.map((word, i) => {
              const wOp = interpolate(frame, [6 + i * 3, 10 + i * 3], [0, 1], {
                extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
              })
              const wY = interpolate(frame, [6 + i * 3, 10 + i * 3], [10, 0], {
                extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
              })
              return (
                <span key={i} style={{
                  display: 'inline-block',
                  opacity: wOp,
                  transform: `translateY(${wY}px)`,
                  marginRight: '0.27em',
                }}>
                  {word}
                </span>
              )
            })}
            {isCenter && (
              <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 4 }}>"</span>
            )}
          </div>

          {/* Attribution */}
          {attribution && (
            <div style={{
              fontSize: 14,
              fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
              fontWeight: 500,
              color: 'rgba(255,255,255,0.28)',
              letterSpacing: 4,
              textTransform: 'uppercase',
              opacity: attrOp,
              transform: `translateY(${attrY}px)`,
            }}>
              — {attribution}
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  )
}
