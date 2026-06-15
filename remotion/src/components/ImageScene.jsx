import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion'
import {
  LetterboxBars, FilmGrain, Vignette, ColorGrade,
  LightLeak, Halation, DustParticles, SceneFade,
} from './effects/CinematicEffects'

// ── Ken Burns ─────────────────────────────────────────────────────────────────

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
const COMPOSITION_ORIGIN = {
  close_up:      'center center',
  medium:        '30% 50%',
  wide:          'center center',
  aerial:        'center 60%',
  low_angle:     'center bottom',
  over_shoulder: '20% 45%',
}

function easedProgress(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// ── Camera shake ──────────────────────────────────────────────────────────────

const SHAKE_MOODS = new Set(['tense', 'dramatic', 'anticipatory'])

const SHAKE_INTENSITY = { tense: 1.8, dramatic: 2.2, anticipatory: 1.4 }

function getShake(frame, mood) {
  const max = SHAKE_INTENSITY[mood] || 0
  if (!max) return { tx: 0, ty: 0 }
  const tx = Math.sin(frame * 0.13) * max + Math.sin(frame * 0.37) * max * 0.4
  const ty = Math.sin(frame * 0.21) * max * 0.5 + Math.sin(frame * 0.47) * max * 0.25
  return { tx, ty }
}

// ── Year extraction for DustParticles ────────────────────────────────────────

function extractYear(text = '') {
  const m = text.match(/\b(19[0-9]{2}|20[0-2][0-9])\b/)
  return m ? parseInt(m[1], 10) : null
}

// ── ImageScene ────────────────────────────────────────────────────────────────

export const ImageScene = ({ scene, imagePath, globalSettings = {} }) => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()

  const src           = imagePath || scene.image_path
  const motionType    = scene.motion?.type      || 'push_in'
  const motionIntensity = scene.motion?.intensity || 'subtle'
  const composition   = scene.composition       || 'medium'
  const grade         = scene.grade             || 'cool_blue'
  const mood          = scene.mood              || 'neutral'
  const letterbox     = scene.letterbox !== false

  const grainIntensity = globalSettings.grainIntensity !== undefined
    ? globalSettings.grainIntensity
    : 0.06

  // Ken Burns progress with cubic ease
  const rawProgress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })
  const progress = easedProgress(rawProgress)

  // Motion transform
  let transform = 'none'
  const transformOrigin = COMPOSITION_ORIGIN[composition] || 'center center'

  if (motionType !== 'static') {
    if (motionType === 'push_in' || motionType === 'pull_out') {
      const [from, to] = SCALE_MAP[motionType]?.[motionIntensity] || [1, 1.06]
      transform = `scale(${from + progress * (to - from)})`
    } else if (DRIFT_MAP[motionType]) {
      const [from, to] = DRIFT_MAP[motionType][motionIntensity] || [0, 4]
      const val = from + progress * (to - from)
      transform = (motionType === 'drift_up' || motionType === 'drift_down')
        ? `translateY(${val}%)`
        : `translateX(${val}%)`
    }
  }

  // Camera shake — expand container to 105% to hide edges
  const shake = SHAKE_MOODS.has(mood) ? getShake(frame, mood) : { tx: 0, ty: 0 }
  const hasShake = shake.tx !== 0 || shake.ty !== 0

  // Halation on triumphant mood
  const halationEnabled = mood === 'triumphant'

  // Dust particles for archival footage (pre-1990)
  const year = extractYear(scene.script_excerpt || scene.higgsfield_prompt || '')
  const dustEnabled = year !== null && year < 1990

  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      {/* Image container — expanded when shake is active */}
      <div style={{
        position: 'absolute',
        inset: hasShake ? '-5%' : 0,
        overflow: 'hidden',
        transform: hasShake ? `translate(${shake.tx}px, ${shake.ty}px)` : undefined,
      }}>
        <img
          src={src}
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            transform, transformOrigin,
          }}
          alt=""
        />
      </div>

      {/* Effects stack */}
      <ColorGrade grade={grade} />
      <Vignette intensity={0.45} mood={mood} />
      <FilmGrain intensity={grainIntensity} />
      <LightLeak mood={mood} enabled />
      {halationEnabled && <Halation enabled intensity={0.08} />}
      {dustEnabled && <DustParticles enabled count={12} />}
      <SceneFade fadeInFrames={8} fadeOutFrames={8} />
      <LetterboxBars enabled={letterbox} />
    </AbsoluteFill>
  )
}

export default ImageScene
