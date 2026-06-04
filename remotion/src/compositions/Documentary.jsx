import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate } from 'remotion'
import ImageScene      from '../components/ImageScene'
import FootageScene    from '../components/FootageScene'
import PlaceholderScene from '../components/PlaceholderScene'
import AnimatedCounter from '../components/AnimatedCounter'
import TimelineBar     from '../components/TimelineBar'
import ComparisonChart from '../components/ComparisonChart'
import QuoteCard       from '../components/QuoteCard'
import MapHighlight    from '../components/MapHighlight'

// Dispatch motion_graphic scene to the correct template component
function MotionGraphicScene({ scene }) {
  const type  = scene.motion_graphic_type
  const props = scene.motion_graphic_props || {}

  if (type === 'AnimatedCounter') return <AnimatedCounter {...props} />
  if (type === 'TimelineBar')     return <TimelineBar     {...props} />
  if (type === 'ComparisonChart') return <ComparisonChart {...props} />
  if (type === 'QuoteCard')       return <QuoteCard       {...props} />
  if (type === 'MapHighlight')    return <MapHighlight    {...props} />

  // Fallback placeholder
  return (
    <AbsoluteFill style={{ background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#333', fontSize: 16, fontFamily: 'sans-serif' }}>{type || 'motion graphic'}</div>
    </AbsoluteFill>
  )
}

const FPS              = 30
const DISSOLVE_OVERLAP = 12  // frames
const DIP_DURATION     = 8   // frames

// ── Layout computation ────────────────────────────────────────────────────────
// Returns start frame for every scene and total duration based on transition_out.
export function computeLayout(scenes) {
  const startFrames = []
  let cursor = 0

  scenes.forEach((scene, i) => {
    startFrames.push(cursor)
    const dur   = (scene.duration_seconds || 5) * FPS
    const trans = scene.transition_out || 'dissolve'
    const last  = i === scenes.length - 1

    if (last) {
      cursor += dur
    } else if (trans === 'dissolve') {
      cursor += dur - DISSOLVE_OVERLAP
    } else if (trans === 'cut') {
      cursor += dur
    } else {
      // dip_black / dip_white: scene + gap
      cursor += dur + DIP_DURATION
    }
  })

  return { startFrames, totalFrames: cursor }
}

export function calculateDocumentaryDuration(scenes) {
  if (!scenes?.length) return 30
  return Math.max(computeLayout(scenes).totalFrames, 30)
}

// ── SceneLayer — handles per-scene fade in/out for dissolve ──────────────────
function SceneLayer({ scene, imagePath, selectedClip, fadeIn, fadeOut }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()

  let opacity = 1

  if (fadeIn) {
    opacity = Math.min(opacity,
      interpolate(frame, [0, DISSOLVE_OVERLAP], [0, 1], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
      })
    )
  }
  if (fadeOut) {
    opacity = Math.min(opacity,
      interpolate(frame, [durationInFrames - DISSOLVE_OVERLAP, durationInFrames], [1, 0], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
      })
    )
  }

  const renderScene = () => {
    if (scene.shot_type === 'image') {
      if (!imagePath) return <PlaceholderScene scene={scene} />
      return <ImageScene scene={scene} imagePath={imagePath} />
    }
    if (scene.shot_type === 'motion_graphic') {
      return <MotionGraphicScene scene={scene} />
    }
    if (scene.shot_type === 'real_footage') {
      if (selectedClip) return <FootageScene clip={selectedClip} />
      return <PlaceholderScene scene={scene} />
    }
    return <PlaceholderScene scene={scene} />
  }

  return (
    <AbsoluteFill style={{ opacity }}>
      {renderScene()}
    </AbsoluteFill>
  )
}

// ── Documentary composition ───────────────────────────────────────────────────
// selectedClips: { [scene_id]: clip_object } — passed from the render pipeline
export function Documentary({ scenes = [], imagePaths = {}, selectedClips = {} }) {
  if (!scenes.length) {
    return (
      <AbsoluteFill style={{ background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#333', fontSize: 20, fontFamily: 'sans-serif' }}>No scenes loaded</div>
      </AbsoluteFill>
    )
  }

  const { startFrames } = computeLayout(scenes)

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {/* Scene sequences */}
      {scenes.map((scene, i) => {
        const dur         = (scene.duration_seconds || 5) * FPS
        const startFrame  = startFrames[i]
        const prevTrans   = i > 0 ? (scenes[i - 1].transition_out || 'dissolve') : 'cut'
        const myTrans     = scene.transition_out || 'dissolve'

        return (
          <Sequence key={scene.scene_id} from={startFrame} durationInFrames={dur}>
            <SceneLayer
              scene={scene}
              imagePath={imagePaths[scene.scene_id]}
              selectedClip={selectedClips[scene.scene_id] || null}
              fadeIn={prevTrans === 'dissolve'}
              fadeOut={myTrans === 'dissolve'}
            />
          </Sequence>
        )
      })}

      {/* Dip frames between scenes */}
      {scenes.map((scene, i) => {
        if (i === scenes.length - 1) return null
        const trans = scene.transition_out || 'dissolve'
        if (trans !== 'dip_black' && trans !== 'dip_white') return null
        const dipStart = startFrames[i] + (scene.duration_seconds || 5) * FPS
        return (
          <Sequence key={`dip-${i}`} from={dipStart} durationInFrames={DIP_DURATION}>
            <AbsoluteFill style={{ background: trans === 'dip_black' ? '#000' : '#fff' }} />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
