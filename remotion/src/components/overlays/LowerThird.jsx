import { useCurrentFrame, spring, useVideoConfig } from 'remotion'

const HOLD_FRAMES = 90  // 3s at 30fps
const SPRING_CFG  = { damping: 18, stiffness: 200, mass: 0.5 }

export default function LowerThird({ line1, line2, appearAt = 20 }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const rel = frame - appearAt
  if (rel < 0) return null

  // Slide in 0 → 1 from left, then slide out after HOLD_FRAMES
  const inProgress = spring({ frame: rel, fps, config: SPRING_CFG })
  const outProgress = spring({ frame: rel - HOLD_FRAMES, fps, config: SPRING_CFG })

  // translateX: -320px off-screen → 0 on in, 0 → -320px on out
  const tx = rel < HOLD_FRAMES
    ? inProgress * 320 - 320    // maps 0→1 to -320→0
    : -outProgress * 320        // maps 0→1 to 0→-320

  return (
    <div style={{
      position: 'absolute',
      bottom: 48,
      left: 48,
      transform: `translateX(${tx}px)`,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      padding: '10px 20px 10px 12px',
      borderLeft: '3px solid #3b82f6',
      background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{ color: '#ffffff', fontSize: 15, fontWeight: 500, fontFamily: 'sans-serif', lineHeight: 1.2 }}>
        {line1}
      </div>
      {line2 && (
        <div style={{ color: '#a0aec0', fontSize: 12, fontFamily: 'sans-serif', lineHeight: 1.2 }}>
          {line2}
        </div>
      )}
    </div>
  )
}
