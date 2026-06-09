import { useCurrentFrame, interpolate, useVideoConfig } from 'remotion'

const FONT_MAP = {
  'Inter':            'Inter',
  'Montserrat':       'Montserrat',
  'Playfair Display': 'Playfair Display',
  'DM Sans':          'DM Sans',
  'Helvetica Neue':   'Helvetica Neue, Helvetica, Arial, sans-serif',
  'Georgia':          'Georgia, serif',
  'Courier New':      'Courier New, monospace',
}

function norm(ov) {
  if (ov.text && typeof ov.text === 'object') {
    const t = ov.text; const an = ov.animation || {}; const pos = ov.position || {}
    return {
      text: t.line1 || '',
      textColor: t.color || '#ffffff',
      size: t.size || 52, weight: t.weight || '700', family: t.family || 'Inter',
      enter: an.enter || 'fade', exit: an.exit || 'fade', dur: an.duration || 20,
      appearAt: ov.timing?.appearAt ?? 0,
      posX: pos.x || 'center', posY: pos.y || 'center',
      offsetY: pos.offsetY ?? 0,
      opacity: ov.opacity ?? 1, isNew: true,
    }
  }
  const c = ov.color || {}; const f = ov.font || {}; const a = ov.animation || {}
  const style = ov.style || 'center'
  return {
    text: typeof ov.text === 'string' ? ov.text : '',
    textColor: c.textColor || '#ffffff',
    size: f.size || 52, weight: f.weight || '700', family: f.family || 'Inter',
    enter: a.enter || 'fade', exit: a.exit || 'fade', dur: a.duration || 20,
    appearAt: ov.appearAt ?? 0,
    posX: 'center', posY: style === 'center' ? 'center' : 'bottom',
    offsetY: style === 'center' ? 0 : 80,
    opacity: 1, isNew: false,
  }
}

export default function KineticText({ overlay = {} }) {
  const frame = useCurrentFrame()
  const { durationInFrames, fps } = useVideoConfig()

  const d        = norm(overlay)
  const appearAt = Math.round(d.appearAt * fps)
  const DUR      = d.dur
  const holdEnd  = durationInFrames - DUR
  const fontFamily = FONT_MAP[d.family] || d.family

  const mainOpacity = interpolate(
    frame, [appearAt, appearAt + DUR, holdEnd, durationInFrames], [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  const baseStyle = {
    color: d.textColor, fontSize: d.size, fontWeight: d.weight, fontFamily,
    textAlign: 'center', textShadow: '0 2px 20px rgba(0,0,0,0.8)', lineHeight: 1.2,
  }

  const containerStyle = {
    position: 'absolute', left: 0, right: 0,
    ...(d.posY === 'center' ? { top: '50%', transform: 'translateY(-50%)' } : { bottom: d.offsetY }),
    display: 'flex', justifyContent: 'center', padding: '0 80px',
  }

  if (d.enter === 'word_by_word') {
    const words = d.text.split(' ').filter(Boolean)
    const STAGGER = 4
    const exitOpacity = interpolate(frame, [holdEnd, durationInFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    return (
      <div style={containerStyle}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3em', justifyContent: 'center', alignItems: 'center' }}>
          {words.map((word, i) => {
            const wOp = interpolate(frame, [appearAt + i * STAGGER, appearAt + i * STAGGER + DUR], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
            return <span key={i} style={{ ...baseStyle, opacity: Math.min(wOp, exitOpacity) * d.opacity }}>{word}</span>
          })}
        </div>
      </div>
    )
  }

  if (d.enter === 'typewriter') {
    const chars = d.text.split('')
    const CHAR_DELAY = 2
    return (
      <div style={containerStyle}>
        <div style={{ ...baseStyle, opacity: mainOpacity * d.opacity }}>
          {chars.map((ch, i) => {
            const cOp = interpolate(frame, [appearAt + i * CHAR_DELAY, appearAt + i * CHAR_DELAY + 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
            return <span key={i} style={{ opacity: cOp }}>{ch}</span>
          })}
        </div>
      </div>
    )
  }

  if (d.enter === 'scale_in') {
    const scale = interpolate(frame, [appearAt, appearAt + DUR], [0.7, 1.0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    return (
      <div style={containerStyle}>
        <div style={{ ...baseStyle, opacity: mainOpacity * d.opacity, transform: `scale(${scale})` }}>{d.text}</div>
      </div>
    )
  }

  if (d.enter === 'slide_up') {
    const ty = interpolate(frame, [appearAt, appearAt + DUR], [24, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    return (
      <div style={containerStyle}>
        <div style={{ ...baseStyle, opacity: mainOpacity * d.opacity, transform: `translateY(${ty}px)` }}>{d.text}</div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={{ ...baseStyle, opacity: mainOpacity * d.opacity }}>{d.text}</div>
    </div>
  )
}
