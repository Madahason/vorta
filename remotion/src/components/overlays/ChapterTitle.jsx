import { useCurrentFrame, interpolate, useVideoConfig } from 'remotion'

const FONT_MAP = {
  'Inter':            'Inter',
  'Montserrat':       'Montserrat',
  'Playfair Display': 'Playfair Display',
  'Helvetica Neue':   'Helvetica Neue, Helvetica, Arial, sans-serif',
  'Georgia':          'Georgia, serif',
}

export default function ChapterTitle({ overlay = {} }) {
  const frame = useCurrentFrame()
  const { durationInFrames, fps } = useVideoConfig()

  const t   = overlay.text       || {}
  const bg  = overlay.background || {}
  const acc = overlay.accent     || {}
  const an  = overlay.animation  || {}

  const line1    = t.line1 || ''
  const line2    = t.line2 || ''
  const color    = t.color || '#ffffff'
  const size1    = t.size  || 48
  const weight   = t.weight || '700'
  const family   = FONT_MAP[t.family || 'Inter'] || interFamily
  const bgColor  = bg.color || 'rgba(0,0,0,0)'
  const accColor = acc.color || '#3b82f6'
  const template = overlay.template || 'minimal_chapter'

  const appearAt = Math.round((overlay.timing?.appearAt ?? 0) * fps)
  const DUR      = an.duration || 30
  const holdEnd  = durationInFrames - DUR

  const opacity = interpolate(frame, [appearAt, appearAt + DUR, holdEnd, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  const isFull = template === 'full_screen_chapter'

  // full_screen_chapter: full-frame dark overlay
  if (isFull) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: bgColor, opacity: opacity * (overlay.opacity ?? 1), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color, fontSize: size1, fontWeight: weight, fontFamily: family, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {line1}
          </div>
          {line2 && (
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: Math.round(size1 * 0.40), fontWeight: '300', fontFamily: family, marginTop: 16, letterSpacing: '0.04em' }}>
              {line2}
            </div>
          )}
        </div>
        <div style={{ width: Math.min(acc.width || 60, 120), height: 3, background: accColor, borderRadius: 2, marginTop: 8 }} />
      </div>
    )
  }

  // minimal_chapter: centered text, no overlay background
  const ty = interpolate(frame, [appearAt, appearAt + DUR], [16, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', opacity: opacity * (overlay.opacity ?? 1), transform: `translateY(${ty}px)` }}>
        <div style={{ color, fontSize: size1, fontWeight: weight, fontFamily: family, letterSpacing: '-0.01em', lineHeight: 1.1 }}>
          {line1}
        </div>
        {line2 && (
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: Math.round(size1 * 0.40), fontWeight: '300', fontFamily: family, marginTop: 14, letterSpacing: '0.04em' }}>
            {line2}
          </div>
        )}
        <div style={{ width: 40, height: 2, background: accColor, margin: '16px auto 0', borderRadius: 1 }} />
      </div>
    </div>
  )
}
