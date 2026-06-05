import { useCurrentFrame, interpolate, useVideoConfig } from 'remotion'
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
  color: { background: '#000000', backgroundOpacity: 0.55, textColor: '#ffffff' },
  font:  { family: 'Inter', size: 11, weight: '400', letterSpacing: '0.15em', transform: 'uppercase' },
  animation: { enter: 'fade', duration: 12, easing: 'linear' },
}

function hexToRgba(hex, opacity) {
  if (!hex || !hex.startsWith('#')) return `rgba(0,0,0,${opacity})`
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${opacity})`
}

// overlay: full overlay object with { text, appearAt, color, font, animation }
export default function DateStamp({ overlay = {} }) {
  const frame = useCurrentFrame()
  const { durationInFrames, fps } = useVideoConfig()

  const c    = { ...DEFAULTS.color,     ...overlay.color     }
  const f    = { ...DEFAULTS.font,      ...overlay.font      }
  const anim = { ...DEFAULTS.animation, ...overlay.animation }

  const text     = overlay.text || ''
  const appearAt = Math.round((overlay.appearAt ?? 0.7) * fps)
  const FADE_IN  = anim.duration
  const FADE_OUT = 20
  const disappearAt = durationInFrames - FADE_OUT

  let opacity = interpolate(
    frame,
    [appearAt, appearAt + FADE_IN, disappearAt, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  // Slide-up enter animation
  let translateY = 0
  if (anim.enter === 'slide_up') {
    translateY = interpolate(frame, [appearAt, appearAt + FADE_IN], [12, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    })
  }

  const fontFamily = FONT_MAP[f.family] || f.family

  return (
    <div style={{
      position: 'absolute',
      bottom: 48, right: 48,
      opacity,
      transform: `translateY(${translateY}px)`,
      background: hexToRgba(c.background, c.backgroundOpacity),
      borderRadius: 20,
      padding: '6px 14px',
      color: c.textColor,
      fontSize: f.size,
      letterSpacing: typeof f.letterSpacing === 'number' ? `${f.letterSpacing}em` : f.letterSpacing,
      textTransform: f.transform,
      fontFamily,
      fontWeight: f.weight,
    }}>
      {text}
    </div>
  )
}
