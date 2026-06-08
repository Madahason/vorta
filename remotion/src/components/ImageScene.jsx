import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion'
import FilmLook          from './overlays/FilmLook'
import LowerThird        from './overlays/LowerThird'
import DateStamp         from './overlays/DateStamp'
import KineticText       from './overlays/KineticText'
import StatCallout       from './overlays/StatCallout'
import ChapterTitle      from './overlays/ChapterTitle'
import SourceCitation    from './overlays/SourceCitation'
import BackgroundOverlay from './overlays/BackgroundOverlay'
import Watermark         from './overlays/Watermark'

const SCALE_MAP = {
  push_in:  { subtle: [1.00, 1.06], moderate: [1.00, 1.10], strong: [1.00, 1.16] },
  pull_out: { subtle: [1.06, 1.00], moderate: [1.10, 1.00], strong: [1.16, 1.00] },
}

const DRIFT_MAP = {
  drift_left:  { subtle: [0, -4],  moderate: [0, -7],  strong: [0, -10] },
  drift_right: { subtle: [0,  4],  moderate: [0,  7],  strong: [0,  10] },
  drift_up:    { subtle: [0, -4],  moderate: [0, -7],  strong: [0, -10] },
}

// globalSettings.grainIntensity = 0 → disable grain globally (overrides per-scene overlay)
export default function ImageScene({ scene, imagePath, globalSettings = {} }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()

  const motionType      = scene.motion?.type      || 'push_in'
  const motionIntensity = scene.motion?.intensity || 'subtle'
  const grade           = scene.grade             || 'cool_blue'
  const overlays        = scene.overlays          || []

  // Grain: global override > per-scene overlay > default 0.06
  const grainOverlay   = overlays.find(o => o.type === 'grain')
  const grainIntensity = globalSettings.grainIntensity !== undefined
    ? globalSettings.grainIntensity
    : (grainOverlay ? (grainOverlay.intensity ?? 0.06) : 0.06)
  const grainPattern   = grainOverlay?.animation?.pattern ?? 'random'

  // Vignette: per-scene overlay or default
  const vignetteOverlay   = overlays.find(o => o.type === 'vignette')
  const vignetteIntensity = vignetteOverlay ? (vignetteOverlay.intensity ?? 0.45) : 0.45

  // Color grade: overlay overrides scene-level grade field
  const colorGradeOverlay = overlays.find(o => o.type === 'color_grade')
  const effectiveGrade    = colorGradeOverlay?.grade || grade

  // ── Motion transform ────────────────────────────────────────────────────────
  let transform = 'none'

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
      transform = motionType === 'drift_up'
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
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform }}
          alt=""
        />
      </div>

      <FilmLook grade={effectiveGrade} grainIntensity={grainIntensity} grainPattern={grainPattern} vignetteIntensity={vignetteIntensity} />

      {overlays.map((o, i) => {
        if (o.type === 'lower_third')        return <LowerThird        key={i} overlay={o} />
        if (o.type === 'date_stamp')         return <DateStamp         key={i} overlay={o} />
        if (o.type === 'kinetic_text')       return <KineticText       key={i} overlay={o} />
        if (o.type === 'stat_callout')       return <StatCallout       key={i} overlay={o} />
        if (o.type === 'chapter_title')      return <ChapterTitle      key={i} overlay={o} />
        if (o.type === 'source_citation')    return <SourceCitation    key={i} overlay={o} />
        if (o.type === 'background_overlay') return <BackgroundOverlay key={i} overlay={o} />
        if (o.type === 'watermark')          return <Watermark         key={i} overlay={o} />
        // vignette, grain, color_grade handled above via FilmLook
        return null
      })}
    </AbsoluteFill>
  )
}
