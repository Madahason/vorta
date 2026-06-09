import { useCurrentFrame, spring, useVideoConfig, interpolate } from 'remotion'

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
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${opacity})`
}

// Normalize both old flat format and new nested format to a unified internal shape
function norm(ov) {
  if (ov.text && typeof ov.text === 'object') {
    const t = ov.text; const bg = ov.background || {}; const acc = ov.accent || {}; const an = ov.animation || {}
    return {
      line1: t.line1 || '', line2: t.line2 || '',
      color1: t.color || '#f0f0f0', color2: t.secondaryColor || 'rgba(255,255,255,0.55)',
      size1: t.size || 15, size2: t.secondarySize || 12,
      weight: t.weight || '500', family: t.family || 'Inter',
      spacing: t.letterSpacing || '0em', textTransform: t.transform || 'none',
      bgColor: bg.color || 'rgba(0,0,0,0)', bgBlur: bg.blur ?? 0, bgRadius: bg.borderRadius ?? 0,
      accColor: acc.color || '#3b82f6', accWidth: acc.width ?? 3, accPos: acc.position || 'left',
      enter: an.enter || 'slide_left', exit: an.exit || 'slide_left',
      dur: an.duration || 18, easing: an.easing || 'spring', delay: an.delay || 0,
      appearAt: ov.timing?.appearAt ?? 0, position: ov.position || null, opacity: ov.opacity ?? 1,
      isNew: true,
    }
  }
  const c = ov.color || {}; const f = ov.font || {}; const a = ov.animation || {}
  return {
    line1: ov.line1 || '', line2: ov.line2 || '',
    color1: c.textPrimary || '#f0f0f0', color2: c.textSecondary || '#a0aec0',
    size1: f.sizePrimary || 15, size2: f.sizeSecondary || 12,
    weight: f.weight || '500', family: f.family || 'Inter',
    spacing: f.letterSpacing || '0em', textTransform: f.transform || 'none',
    bgColor: c.background || '#000000', bgOpacity: c.backgroundOpacity ?? 0.65,
    bgBlur: 2, bgRadius: 0,
    accColor: c.accent || '#3b82f6', accWidth: 3, accPos: 'left',
    enter: a.enter || 'slide_left', exit: a.exit || 'slide_left',
    dur: a.duration || 18, easing: a.easing || 'spring', delay: 0,
    appearAt: ov.appearAt ?? 0, position: null, opacity: 1,
    isNew: false,
  }
}

function calcProgress(frame, fps, easing, dur) {
  if (easing === 'spring') return spring({ frame, fps, config: { damping: 18, stiffness: 200, mass: 0.5 } })
  const easingFn = easing === 'ease_out' ? [0, 0, 0.58, 1] : easing === 'ease_in_out' ? [0.42, 0, 0.58, 1] : undefined
  return interpolate(frame, [0, dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingFn })
}

function getTransform(type, enter, exit) {
  const DIST = 340
  if (type === 'slide_left')  return `translateX(${(enter - 1) * -DIST - exit * DIST}px)`
  if (type === 'slide_right') return `translateX(${(enter - 1) * DIST + exit * DIST}px)`
  if (type === 'slide_up')    return `translateY(${(1 - enter) * 40 + exit * 40}px)`
  if (type === 'slide_down')  return `translateY(${(1 - enter) * -40 - exit * 40}px)`
  return 'none'
}

function getOpacity(type, enter, exit) {
  return (type === 'fade' || type === 'scale_in') ? Math.min(enter, 1 - exit) : 1
}

function computePositionStyle(position) {
  if (!position) return { bottom: 48, left: 48 }
  const { x = 'left', y = 'bottom', offsetX = 48, offsetY = 48 } = position
  const style = {}
  if (x === 'left')   style.left  = offsetX
  else if (x === 'right')  style.right  = offsetX
  else if (x === 'center') { style.left = 0; style.right = 0 }
  if (y === 'top')    style.top    = offsetY
  else if (y === 'bottom') style.bottom = offsetY
  else if (y === 'center') { style.top = 0; style.bottom = 0 }
  return style
}

export default function LowerThird({ overlay = {} }) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const d        = norm(overlay)
  const appearAt = Math.round((d.appearAt + (d.delay ?? 0) / fps) * fps)
  // Hold until 1 second before scene end, then exit. Capped at 4 seconds max hold.
  const HOLD     = Math.min(Math.max(durationInFrames - appearAt - d.dur * 2 - fps, d.dur), 4 * fps)
  const rel      = frame - appearAt
  if (rel < 0) return null

  const enterP    = calcProgress(rel,          fps, d.easing, d.dur)
  const exitP     = rel < HOLD ? 0 : calcProgress(rel - HOLD, fps, d.easing, d.dur)
  const transform = getTransform(d.enter, enterP, exitP)
  const animOpacity = getOpacity(d.enter, enterP, exitP)
  const fontFamily  = FONT_MAP[d.family] || d.family

  const background = d.isNew ? d.bgColor : hexToRgba(d.bgColor, d.bgOpacity ?? 0.65)

  // Accent border
  const borderStyle = {}
  if (d.accWidth > 0) {
    if (d.accPos === 'left')   borderStyle.borderLeft   = `${d.accWidth}px solid ${d.accColor}`
    if (d.accPos === 'right')  borderStyle.borderRight  = `${d.accWidth}px solid ${d.accColor}`
    if (d.accPos === 'bottom') borderStyle.borderBottom = `${d.accWidth}px solid ${d.accColor}`
  }

  const posStyle = computePositionStyle(d.position)
  const isCenter = d.position?.x === 'center' || d.position?.y === 'center'

  return (
    <div style={{
      position: 'absolute', ...posStyle,
      ...(isCenter ? { display: 'flex', justifyContent: d.position?.x === 'center' ? 'center' : 'flex-start', alignItems: d.position?.y === 'center' ? 'center' : 'flex-start' } : {}),
    }}>
      <div style={{
        transform, opacity: Math.min(animOpacity, d.opacity),
        display: 'flex', flexDirection: 'column', gap: 4,
        padding: d.accPos === 'bottom' ? '10px 16px 10px 16px' : '10px 20px 10px 12px',
        ...borderStyle,
        background,
        backdropFilter: d.bgBlur > 0 ? `blur(${d.bgBlur}px)` : 'none',
        borderRadius: d.bgRadius,
        fontFamily,
      }}>
        <div style={{
          color: d.color1, fontSize: d.size1, fontWeight: d.weight,
          lineHeight: 1.2, letterSpacing: d.spacing, textTransform: d.textTransform,
        }}>
          {d.line1}
        </div>
        {d.line2 && (
          <div style={{ color: d.color2, fontSize: d.size2, fontWeight: '400', lineHeight: 1.2, letterSpacing: d.spacing }}>
            {d.line2}
          </div>
        )}
      </div>
    </div>
  )
}
