import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion'
import FilmLook from './overlays/FilmLook'
import LowerThird from './overlays/LowerThird'
import DateStamp from './overlays/DateStamp'
import KineticText from './overlays/KineticText'

// scale ranges [from, to] keyed by intensity
const SCALE_MAP = {
  push_in:  { subtle: [1.00, 1.06], moderate: [1.00, 1.10], strong: [1.00, 1.16] },
  pull_out: { subtle: [1.06, 1.00], moderate: [1.10, 1.00], strong: [1.16, 1.00] },
}

// translate % ranges [from, to] keyed by intensity
const DRIFT_MAP = {
  drift_left:  { subtle: [0, -4],  moderate: [0, -7],  strong: [0, -10] },
  drift_right: { subtle: [0,  4],  moderate: [0,  7],  strong: [0,  10] },
  drift_up:    { subtle: [0, -4],  moderate: [0, -7],  strong: [0, -10] },
}

export default function ImageScene({ scene, imagePath }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()

  const motionType      = scene.motion?.type      || 'push_in'
  const motionIntensity = scene.motion?.intensity || 'subtle'
  const grade           = scene.grade             || 'cool_blue'
  const overlays        = scene.overlays          || []

  // ── Motion transform ────────────────────────────────────────────────────────
  let transform = 'none'

  if (motionType !== 'static') {
    const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })

    if (motionType === 'push_in' || motionType === 'pull_out') {
      const [from, to] = SCALE_MAP[motionType][motionIntensity]
      const scale = from + progress * (to - from)
      transform = `scale(${scale})`
    } else if (DRIFT_MAP[motionType]) {
      const [from, to] = DRIFT_MAP[motionType][motionIntensity]
      const val = from + progress * (to - from)
      if (motionType === 'drift_up') {
        transform = `translateY(${val}%)`
      } else {
        transform = `translateX(${val}%)`
      }
    }
  }

  // desaturated grade is applied as a CSS filter on the scene wrapper
  const wrapperFilter = grade === 'desaturated' ? 'saturate(0.6)' : 'none'

  return (
    <AbsoluteFill style={{ background: '#000', filter: wrapperFilter }}>
      {/* Image */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <img
          src={imagePath}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform,
            // Linear timing — motion duration is handled by the interpolate range
          }}
          alt=""
        />
      </div>

      {/* Film look (grain + vignette + grade) */}
      <FilmLook grade={grade} grainIntensity={0.12} vignetteIntensity={0.45} />

      {/* Overlays */}
      {overlays.map((o, i) => {
        if (o.type === 'lower_third') {
          return <LowerThird key={i} line1={o.line1} line2={o.line2} appearAt={o.appearAt ?? 20} />
        }
        if (o.type === 'date_stamp') {
          return <DateStamp key={i} text={o.text} appearAt={o.appearAt ?? 20} />
        }
        if (o.type === 'kinetic_text') {
          return <KineticText key={i} text={o.text} style={o.style ?? 'center'} appearAt={o.appearAt ?? 30} />
        }
        return null
      })}
    </AbsoluteFill>
  )
}
