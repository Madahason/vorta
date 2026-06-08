import { useCurrentFrame, interpolate, useVideoConfig } from 'remotion'
import { loadFont as loadInter } from '@remotion/google-fonts/Inter'

const { fontFamily: interFamily } = loadInter()

export default function SourceCitation({ overlay = {} }) {
  const frame = useCurrentFrame()
  const { durationInFrames, fps } = useVideoConfig()

  const t    = overlay.text       || {}
  const an   = overlay.animation  || {}
  const pos  = overlay.position   || {}

  const text     = t.line1 || ''
  const color    = t.color || 'rgba(255,255,255,0.45)'
  const size     = t.size  || 10
  const weight   = t.weight || '400'
  const spacing  = t.letterSpacing || '0.02em'
  const appearAt = Math.round((overlay.timing?.appearAt ?? 0) * fps)
  const DUR      = an.duration || 10
  const FADE_OUT = 16

  const opacity = interpolate(
    frame,
    [appearAt, appearAt + DUR, durationInFrames - FADE_OUT, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  const { x = 'left', y = 'bottom', offsetX = 48, offsetY = 24 } = pos
  const posStyle = {}
  if (x === 'left')  posStyle.left  = offsetX
  else if (x === 'right') posStyle.right = offsetX
  if (y === 'top')   posStyle.top   = offsetY
  else               posStyle.bottom = offsetY

  return (
    <div style={{
      position: 'absolute', ...posStyle,
      opacity: opacity * (overlay.opacity ?? 1),
      color, fontSize: size, fontWeight: weight,
      fontFamily: interFamily,
      letterSpacing: spacing,
      maxWidth: 420,
    }}>
      {text}
    </div>
  )
}
