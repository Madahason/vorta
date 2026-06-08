import { useCurrentFrame, interpolate, useVideoConfig } from 'remotion'

export default function BackgroundOverlay({ overlay = {} }) {
  const frame = useCurrentFrame()
  const { durationInFrames, fps } = useVideoConfig()

  const bg       = overlay.background || {}
  const an       = overlay.animation  || {}
  const bgColor  = bg.color || 'linear-gradient(to top, rgba(0,0,0,0.80) 0%, transparent 60%)'
  const appearAt = Math.round((overlay.timing?.appearAt ?? 0) * fps)
  const DUR      = an.duration || 20
  const FADE_OUT = 20
  const disappearAt = durationInFrames - FADE_OUT

  const opacity = interpolate(
    frame,
    [appearAt, appearAt + DUR, disappearAt, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: bgColor,
      opacity: opacity * (overlay.opacity ?? 1),
      pointerEvents: 'none',
    }} />
  )
}
