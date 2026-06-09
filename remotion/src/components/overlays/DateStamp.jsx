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

function hexToRgba(hex, opacity) {
  if (!hex || !hex.startsWith('#')) return `rgba(0,0,0,${opacity})`
  const r = parseInt(hex.slice(1, 3), 16); const g = parseInt(hex.slice(3, 5), 16); const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${opacity})`
}

function norm(ov) {
  if (ov.text && typeof ov.text === 'object') {
    const t = ov.text; const bg = ov.background || {}; const an = ov.animation || {}
    return {
      text: t.line1 || '',
      textColor: t.color || 'rgba(255,255,255,0.85)',
      size: t.size || 11, weight: t.weight || '500',
      family: t.family || 'Inter',
      letterSpacing: t.letterSpacing || '0.12em',
      textTransform: t.transform || 'uppercase',
      bgColor: bg.color || 'rgba(0,0,0,0.50)',
      bgRadius: bg.borderRadius ?? 20,
      enter: an.enter || 'fade', dur: an.duration || 12,
      appearAt: ov.timing?.appearAt ?? 0,
      position: ov.position || null, opacity: ov.opacity ?? 1,
      isNew: true,
    }
  }
  const c = ov.color || {}; const f = ov.font || {}; const a = ov.animation || {}
  return {
    text: typeof ov.text === 'string' ? ov.text : '',
    textColor: c.textColor || '#ffffff',
    size: f.size || 11, weight: f.weight || '400',
    family: f.family || 'Inter',
    letterSpacing: f.letterSpacing || '0.15em',
    textTransform: f.transform || 'uppercase',
    bgColor: hexToRgba(c.background || '#000000', c.backgroundOpacity ?? 0.55),
    bgRadius: 20,
    enter: a.enter || 'fade', dur: a.duration || 12,
    appearAt: ov.appearAt ?? 0,
    position: null, opacity: 1, isNew: false,
  }
}

function computePositionStyle(pos) {
  if (!pos) return { bottom: 48, right: 48 }
  const { x = 'right', y = 'bottom', offsetX = 48, offsetY = 48 } = pos
  const s = {}
  if (x === 'left')   s.left   = offsetX
  else if (x === 'right')  s.right  = offsetX
  else if (x === 'center') { s.left = 0; s.right = 0 }
  if (y === 'top')    s.top    = offsetY
  else if (y === 'bottom') s.bottom = offsetY
  return s
}

export default function DateStamp({ overlay = {} }) {
  const frame = useCurrentFrame()
  const { durationInFrames, fps } = useVideoConfig()

  const d        = norm(overlay)
  const appearAt = Math.round(d.appearAt * fps)
  const FADE_IN  = d.dur
  const FADE_OUT = 20
  const disappearAt = durationInFrames - FADE_OUT

  const opacity = interpolate(frame, [appearAt, appearAt + FADE_IN, disappearAt, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  let translateY = 0
  if (d.enter === 'slide_up') {
    translateY = interpolate(frame, [appearAt, appearAt + FADE_IN], [12, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  }

  const isCenter = d.position?.x === 'center'
  const posStyle = computePositionStyle(d.position)
  const fontFamily = FONT_MAP[d.family] || d.family

  return (
    <div style={{
      position: 'absolute', ...posStyle,
      ...(isCenter ? { display: 'flex', justifyContent: 'center' } : {}),
    }}>
      <div style={{
        opacity: Math.min(opacity, d.opacity),
        transform: `translateY(${translateY}px)`,
        background: d.bgColor,
        borderRadius: d.bgRadius,
        padding: '6px 14px',
        color: d.textColor,
        fontSize: d.size,
        letterSpacing: d.letterSpacing,
        textTransform: d.textTransform,
        fontFamily,
        fontWeight: d.weight,
        whiteSpace: 'nowrap',
      }}>
        {d.text}
      </div>
    </div>
  )
}
