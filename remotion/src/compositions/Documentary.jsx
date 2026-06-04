import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate } from 'remotion'
import ImageScene from '../components/ImageScene'

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
function SceneLayer({ scene, imagePath, fadeIn, fadeOut }) {
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

  return (
    <AbsoluteFill style={{ opacity }}>
      {scene.shot_type === 'image' && (
        <ImageScene scene={scene} imagePath={imagePath} />
      )}
      {/* motion_graphic and real_footage scenes will be wired in Phase 4/5 */}
      {scene.shot_type !== 'image' && (
        <AbsoluteFill style={{ background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: '#333', fontSize: 16, fontFamily: 'sans-serif' }}>
            {scene.shot_type}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  )
}

// ── Documentary composition ───────────────────────────────────────────────────
export function Documentary({ scenes = [], imagePaths = {} }) {
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
