import { useCurrentFrame, interpolate, useVideoConfig } from 'remotion'

const FADE_FRAMES = 20

export default function KineticText({ text, appearAt = 30, style = 'center' }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()

  const holdEnd = durationInFrames - FADE_FRAMES

  const opacity = interpolate(
    frame,
    [appearAt, appearAt + FADE_FRAMES, holdEnd, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  const isCenter = style === 'center'

  return (
    <div style={{
      position: 'absolute',
      left: 0,
      right: 0,
      ...(isCenter
        ? { top: '50%', transform: 'translateY(-50%)' }
        : { bottom: 80 }
      ),
      opacity,
      display: 'flex',
      justifyContent: 'center',
      padding: '0 80px',
    }}>
      <div style={{
        color: '#ffffff',
        fontSize: isCenter ? 52 : 22,
        fontWeight: 700,
        fontFamily: 'sans-serif',
        textAlign: 'center',
        textShadow: '0 2px 20px rgba(0,0,0,0.8)',
        lineHeight: 1.2,
      }}>
        {text}
      </div>
    </div>
  )
}
