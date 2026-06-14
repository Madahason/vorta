import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion'
import FilmLook from './overlays/FilmLook'

const SCALE_MAP = {
  push_in:  { subtle: [1.00, 1.06], moderate: [1.00, 1.10], strong: [1.00, 1.16] },
  pull_out: { subtle: [1.06, 1.00], moderate: [1.10, 1.00], strong: [1.16, 1.00] },
}

const DRIFT_MAP = {
  drift_left:  { subtle: [0, -4],  moderate: [0, -7],  strong: [0, -10] },
  drift_right: { subtle: [0,  4],  moderate: [0,  7],  strong: [0,  10] },
  drift_up:    { subtle: [0, -4],  moderate: [0, -7],  strong: [0, -10] },
  drift_down:  { subtle: [0,  4],  moderate: [0,  7],  strong: [0,  10] },
}

// Where the Ken Burns zoom originates from, per composition type
const COMPOSITION_ORIGIN = {
  close_up:      'center center',
  medium:        '30% 50%',
  wide:          'center center',
  aerial:        'center 60%',
  low_angle:     'center bottom',
  over_shoulder: '20% 45%',
}

// globalSettings.grainIntensity = 0 → disable grain globally (overrides per-scene overlay)
export default function ImageScene({ scene, imagePath, globalSettings = {} }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()

  const motionType      = scene.motion?.type      || 'push_in'
  const motionIntensity = scene.motion?.intensity || 'subtle'
  const composition     = scene.composition       || 'medium'
  const grade           = scene.grade             || 'cool_blue'

  const grainIntensity = globalSettings.grainIntensity !== undefined
    ? globalSettings.grainIntensity
    : 0.06
  const vignetteIntensity = 0.45
  const effectiveGrade    = grade

  // ── Motion transform ────────────────────────────────────────────────────────
  let transform = 'none'
  const transformOrigin = COMPOSITION_ORIGIN[composition] || 'center center'

  if (motionType !== 'static') {
    const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    })

    if (motionType === 'push_in' || motionType === 'pull_out') {
      const [from, to] = SCALE_MAP[motionType][motionIntensity]
      transform = `scale(${from + progress * (to - from)})`
    } else if (DRIFT_MAP[motionType]) {
      const [from, to] = DRIFT_MAP[motionType][motionIntensity]
      const val = from + progress * (to - from)
      transform = (motionType === 'drift_up' || motionType === 'drift_down')
        ? `translateY(${val}%)`
        : `translateX(${val}%)`
    }
  }

  const wrapperFilter = effectiveGrade === 'desaturated' ? 'saturate(0.6)' : 'none'

  return (
    <AbsoluteFill style={{ background: '#000', filter: wrapperFilter }}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <img
          src={imagePath}
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform, transformOrigin }}
          alt=""
        />
      </div>

      <FilmLook grade={effectiveGrade} grainIntensity={grainIntensity} grainPattern="random" vignetteIntensity={vignetteIntensity} />
    </AbsoluteFill>
  )
}
