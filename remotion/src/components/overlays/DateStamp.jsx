import { useCurrentFrame, interpolate, useVideoConfig } from 'remotion'

const FADE_IN  = 12
const FADE_OUT = 20

export default function DateStamp({ text, appearAt = 20 }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()

  const disappearAt = durationInFrames - FADE_OUT

  const opacity = interpolate(
    frame,
    [appearAt, appearAt + FADE_IN, disappearAt, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  return (
    <div style={{
      position: 'absolute',
      bottom: 48,
      right: 48,
      opacity,
      background: 'rgba(0,0,0,0.50)',
      borderRadius: 20,
      padding: '6px 14px',
      color: 'rgba(255,255,255,0.70)',
      fontSize: 11,
      letterSpacing: '0.15em',
      textTransform: 'uppercase',
      fontFamily: 'sans-serif',
    }}>
      {text}
    </div>
  )
}
