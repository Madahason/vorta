import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion'

const FONT_MAP = {
  'Inter':          'Inter',
  'Montserrat':     'Montserrat',
  'DM Sans':        'DM Sans',
  'Helvetica Neue': 'Helvetica Neue, Helvetica, Arial, sans-serif',
  'Georgia':        'Georgia, serif',
}

function computePositionStyle(pos) {
  if (!pos) return { top: 48, right: 48 }
  const { x = 'right', y = 'top', offsetX = 48, offsetY = 48 } = pos
  const s = {}
  if (x === 'left')   s.left   = offsetX
  else if (x === 'right')  s.right  = offsetX
  else if (x === 'center') { s.left = 0; s.right = 0 }
  if (y === 'top')    s.top    = offsetY
  else if (y === 'bottom') s.bottom = offsetY
  else if (y === 'center') { s.top = 0; s.bottom = 0 }
  return s
}

export default function StatCallout({ overlay = {} }) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const t   = overlay.text       || {}
  const bg  = overlay.background || {}
  const acc = overlay.accent     || {}
  const an  = overlay.animation  || {}
  const pos = overlay.position   || {}

  const line1    = t.line1 || ''
  const line2    = t.line2 || ''
  const color    = t.color || '#ffffff'
  const size1    = t.size  || 48
  const weight   = t.weight || '800'
  const family   = FONT_MAP[t.family || 'Inter'] || interFamily
  const bgColor  = bg.color || 'rgba(0,0,0,0)'
  const bgRadius = bg.borderRadius ?? 8
  const accColor = acc.color || '#3b82f6'
  const accWidth = acc.width ?? 3
  const accPos   = acc.position || 'left'
  const template = overlay.template || 'corner_stat'

  const appearAt = Math.round((overlay.timing?.appearAt ?? 0) * fps)
  const DUR      = an.duration || 20
  const HOLD     = Math.min(Math.max(durationInFrames - appearAt - DUR * 2 - fps, DUR), 4 * fps)

  const rel = frame - appearAt
  if (rel < 0) return null

  const enterP = template === 'big_number'
    ? interpolate(frame, [appearAt, appearAt + DUR], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : spring({ frame: rel, fps, config: { damping: 18, stiffness: 200, mass: 0.5 } })

  const exitP = rel < HOLD ? 0 : interpolate(rel - HOLD, [0, DUR], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const opacity = Math.min(enterP, 1 - exitP) * (overlay.opacity ?? 1)

  const borderStyle = {}
  if (accWidth > 0) {
    if (accPos === 'left')   borderStyle.borderLeft   = `${accWidth}px solid ${accColor}`
    if (accPos === 'right')  borderStyle.borderRight  = `${accWidth}px solid ${accColor}`
    if (accPos === 'bottom') borderStyle.borderBottom = `${accWidth}px solid ${accColor}`
  }

  const posStyle = computePositionStyle(overlay.position)
  const isCenter = pos.x === 'center' || pos.y === 'center'

  // big_number: full-center layout
  if (template === 'big_number') {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color, fontSize: size1, fontWeight: weight, fontFamily: family, letterSpacing: '-0.02em', lineHeight: 1, textShadow: '0 4px 40px rgba(0,0,0,0.7)' }}>
            {line1}
          </div>
          {line2 && (
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: Math.round(size1 * 0.22), fontWeight: '400', fontFamily: family, marginTop: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {line2}
            </div>
          )}
        </div>
      </div>
    )
  }

  // corner_stat: compact card
  const tx = accPos !== 'left' ? 0 : (enterP - 1) * -120 - exitP * 120

  return (
    <div style={{
      position: 'absolute', ...posStyle,
      ...(isCenter ? { display: 'flex', justifyContent: pos.x === 'center' ? 'center' : 'flex-start', alignItems: pos.y === 'center' ? 'center' : 'flex-start' } : {}),
    }}>
      <div style={{
        opacity,
        transform: `translateX(${tx}px)`,
        display: 'flex', flexDirection: 'column', gap: 4,
        padding: '10px 16px 10px 12px',
        ...borderStyle,
        background: bgColor,
        backdropFilter: bg.blur > 0 ? `blur(${bg.blur}px)` : 'none',
        borderRadius: bgRadius,
        fontFamily: family,
        minWidth: 80,
      }}>
        <div style={{ color, fontSize: size1, fontWeight: weight, lineHeight: 1, letterSpacing: '-0.01em' }}>
          {line1}
        </div>
        {line2 && (
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: Math.round(size1 * 0.28), fontWeight: '400', letterSpacing: '0.04em' }}>
            {line2}
          </div>
        )}
      </div>
    </div>
  )
}
