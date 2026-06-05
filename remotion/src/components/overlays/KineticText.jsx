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
  color: { textColor: '#ffffff' },
  font:  { family: 'Inter', size: 52, weight: '700' },
  animation: { enter: 'fade', exit: 'fade', duration: 20, easing: 'linear' },
}

// overlay: { text, style, appearAt, color, font, animation }
export default function KineticText({ overlay = {} }) {
  const frame = useCurrentFrame()
  const { durationInFrames, fps } = useVideoConfig()

  const c    = { ...DEFAULTS.color,     ...overlay.color     }
  const f    = { ...DEFAULTS.font,      ...overlay.font      }
  const anim = { ...DEFAULTS.animation, ...overlay.animation }

  const text     = overlay.text || ''
  const position = overlay.style || 'center'
  const appearAt = Math.round((overlay.appearAt ?? 1.0) * fps)
  const DUR      = anim.duration
  const holdEnd  = durationInFrames - DUR
  const isCenter = position === 'center'
  const fontFamily = FONT_MAP[f.family] || f.family

  const baseStyle = {
    color: c.textColor,
    fontSize: f.size || 52,
    fontWeight: f.weight || '700',
    fontFamily,
    textAlign: 'center',
    textShadow: '0 2px 20px rgba(0,0,0,0.8)',
    lineHeight: 1.2,
  }

  const containerStyle = {
    position: 'absolute',
    left: 0, right: 0,
    ...(isCenter ? { top: '50%', transform: 'translateY(-50%)' } : { bottom: 80 }),
    display: 'flex', justifyContent: 'center',
    padding: '0 80px',
  }

  // ── Main opacity for enter/exit ──────────────────────────────────────────
  const mainOpacity = interpolate(
    frame,
    [appearAt, appearAt + DUR, holdEnd, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  // ── word_by_word ─────────────────────────────────────────────────────────
  if (anim.enter === 'word_by_word') {
    const words = text.split(' ').filter(Boolean)
    const STAGGER = 4
    const exitOpacity = interpolate(frame, [holdEnd, durationInFrames], [1, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    })
    return (
      <div style={{ ...containerStyle, ...(isCenter ? {} : {}) }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3em', justifyContent: 'center', alignItems: 'center' }}>
          {words.map((word, i) => {
            const wOpacity = interpolate(frame, [appearAt + i * STAGGER, appearAt + i * STAGGER + DUR], [0, 1], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            })
            return (
              <span key={i} style={{ ...baseStyle, opacity: Math.min(wOpacity, exitOpacity) }}>
                {word}
              </span>
            )
          })}
        </div>
      </div>
    )
  }

  // ── typewriter ───────────────────────────────────────────────────────────
  if (anim.enter === 'typewriter') {
    const chars = text.split('')
    const CHAR_DELAY = 2
    return (
      <div style={containerStyle}>
        <div style={{ ...baseStyle, opacity: mainOpacity }}>
          {chars.map((ch, i) => {
            const cOpacity = interpolate(frame, [appearAt + i * CHAR_DELAY, appearAt + i * CHAR_DELAY + 4], [0, 1], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            })
            return <span key={i} style={{ opacity: cOpacity }}>{ch}</span>
          })}
        </div>
      </div>
    )
  }

  // ── scale_in ─────────────────────────────────────────────────────────────
  if (anim.enter === 'scale_in') {
    const scale = interpolate(frame, [appearAt, appearAt + DUR], [0.7, 1.0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    })
    return (
      <div style={containerStyle}>
        <div style={{ ...baseStyle, opacity: mainOpacity, transform: `scale(${scale})` }}>
          {text}
        </div>
      </div>
    )
  }

  // ── slide_up ─────────────────────────────────────────────────────────────
  if (anim.enter === 'slide_up') {
    const ty = interpolate(frame, [appearAt, appearAt + DUR], [24, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    })
    return (
      <div style={containerStyle}>
        <div style={{ ...baseStyle, opacity: mainOpacity, transform: `translateY(${ty}px)` }}>
          {text}
        </div>
      </div>
    )
  }

  // ── Default: fade ────────────────────────────────────────────────────────
  return (
    <div style={containerStyle}>
      <div style={{ ...baseStyle, opacity: mainOpacity }}>
        {text}
      </div>
    </div>
  )
}
