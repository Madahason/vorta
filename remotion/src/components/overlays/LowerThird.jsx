import { useCurrentFrame, spring, useVideoConfig, interpolate } from 'remotion'
import { loadFont as loadInter }      from '@remotion/google-fonts/Inter'
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat'
import { loadFont as loadPlayfair }   from '@remotion/google-fonts/PlayfairDisplay'
import { loadFont as loadDMSans }     from '@remotion/google-fonts/DMSans'

const { fontFamily: interFamily }      = loadInter()
const { fontFamily: montserratFamily } = loadMontserrat()
const { fontFamily: playfairFamily }   = loadPlayfair()
const { fontFamily: dmSansFamily }     = loadDMSans()

const FONT_MAP = {
  'Inter':           interFamily,
  'Montserrat':      montserratFamily,
  'Playfair Display':playfairFamily,
  'DM Sans':         dmSansFamily,
  'Helvetica Neue':  'Helvetica Neue, Helvetica, Arial, sans-serif',
  'Georgia':         'Georgia, serif',
  'Courier New':     'Courier New, monospace',
}

const DEFAULTS = {
  color: { background: '#000000', backgroundOpacity: 0.65, accent: '#3b82f6', textPrimary: '#f0f0f0', textSecondary: '#a0aec0' },
  font:  { family: 'Inter', sizePrimary: 15, sizeSecondary: 12, weight: '500', letterSpacing: '0em', transform: 'none', lineHeight: 1.2 },
  animation: { enter: 'slide_left', exit: 'slide_left', duration: 18, easing: 'spring' },
}

function hexToRgba(hex, opacity) {
  if (!hex || !hex.startsWith('#')) return `rgba(0,0,0,${opacity})`
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${opacity})`
}

function calcProgress(frame, fps, easing, dur) {
  if (easing === 'spring') {
    return spring({ frame, fps, config: { damping: 18, stiffness: 200, mass: 0.5 } })
  }
  const easingFn = easing === 'linear' ? undefined
    : easing === 'ease_out'    ? [0, 0, 0.58, 1]
    : easing === 'ease_in_out' ? [0.42, 0, 0.58, 1]
    : undefined
  return interpolate(frame, [0, dur], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: easingFn,
  })
}

function applyTransform(type, enter, exit) {
  const DIST = 340
  if (type === 'slide_left')  return `translateX(${(enter - 1) * -DIST - exit * DIST}px)`
  if (type === 'slide_right') return `translateX(${(enter - 1) * DIST + exit * DIST}px)`
  if (type === 'slide_up')    return `translateY(${(1 - enter) * 40 + exit * 40}px)`
  if (type === 'slide_down')  return `translateY(${(1 - enter) * -40 - exit * 40}px)`
  return 'none'
}

function applyOpacity(type, enter, exit) {
  if (type === 'fade' || type === 'scale_up') return Math.min(enter, 1 - exit)
  return 1
}

function applyScale(type, enter, exit) {
  if (type === 'scale_up') return 0.85 + Math.min(enter, 1 - exit) * 0.15
  return 1
}

// overlay: full overlay object with { line1, line2, appearAt, color, font, animation }
export default function LowerThird({ overlay = {} }) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const c    = { ...DEFAULTS.color,     ...overlay.color     }
  const f    = { ...DEFAULTS.font,      ...overlay.font      }
  const anim = { ...DEFAULTS.animation, ...overlay.animation }

  const line1    = overlay.line1 || ''
  const line2    = overlay.line2 || ''
  const appearAt = Math.round((overlay.appearAt ?? 0.7) * fps)
  const HOLD     = 90 // frames to hold before exit

  const rel = frame - appearAt
  if (rel < 0) return null

  const enterP = calcProgress(rel, fps, anim.easing, anim.duration)
  const exitP  = rel < HOLD ? 0 : calcProgress(rel - HOLD, fps, anim.easing, anim.duration)

  const transform = applyTransform(anim.enter, enterP, exitP)
  const opacity   = applyOpacity(anim.enter, enterP, exitP)
  const scale     = applyScale(anim.enter, enterP, exitP)
  const fontFamily = FONT_MAP[f.family] || f.family

  return (
    <div style={{
      position: 'absolute',
      bottom: 48, left: 48,
      transform: `${transform} scale(${scale})`,
      opacity,
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '10px 20px 10px 12px',
      borderLeft: `3px solid ${c.accent}`,
      background: hexToRgba(c.background, c.backgroundOpacity),
      backdropFilter: 'blur(2px)',
      fontFamily,
    }}>
      <div style={{
        color: c.textPrimary,
        fontSize: f.sizePrimary,
        fontWeight: f.weight,
        lineHeight: f.lineHeight || 1.2,
        letterSpacing: typeof f.letterSpacing === 'number' ? `${f.letterSpacing}em` : f.letterSpacing,
        textTransform: f.transform || 'none',
      }}>
        {line1}
      </div>
      {line2 && (
        <div style={{
          color: c.textSecondary,
          fontSize: f.sizeSecondary,
          fontWeight: '400',
          lineHeight: f.lineHeight || 1.2,
          letterSpacing: typeof f.letterSpacing === 'number' ? `${f.letterSpacing}em` : f.letterSpacing,
        }}>
          {line2}
        </div>
      )}
    </div>
  )
}
