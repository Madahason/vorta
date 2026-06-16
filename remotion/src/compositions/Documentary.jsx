import { useMemo }                                                            from 'react'
import { AbsoluteFill, Audio, Sequence, interpolate, useVideoConfig, useCurrentFrame } from 'remotion'
import { TransitionSeries, springTiming, linearTiming }                      from '@remotion/transitions'
import { fade }                                                              from '@remotion/transitions/fade'
import ImageScene             from '../components/ImageScene'
import FootageScene           from '../components/FootageScene'
import PlaceholderScene       from '../components/PlaceholderScene'
import { MotionGraphicScene } from '../components/MotionGraphicScene'
import { ErrorBoundaryScene } from '../components/ErrorBoundaryScene'

// ── Transition frame constants ────────────────────────────────────────────────
const TRANSITION_FRAMES = 12  // dissolve — crossfade overlap (0.4 s at 30 fps)
const CUT_FRAMES        = 1   // cut — near-instant
const DIP_FRAMES        = 18  // dip_black / dip_white — total overlap budget
const DIP_FADE          = Math.round(DIP_FRAMES / 2)  // 9 — each fade arm
const DIP_MID           = 8   // solid colour plate frames between the two fade arms

// ── getTransition(scene) ──────────────────────────────────────────────────────
// Pure fn — reads scene.transition_out, returns a descriptor used by both the
// duration calculator and the flatMap renderer.
//   frames       — overlap eaten from this scene's tail (TransitionSeries.Transition)
//   outgoingFade — same for non-dip; used for narration fade-out timing
//   narrationIn  — frames to delay narration in the NEXT scene (incoming perspective)
function getTransition(scene) {
  const type = scene?.transition_out || 'dissolve'
  switch (type) {
    case 'cut':
      return { type: 'cut', frames: CUT_FRAMES, outgoingFade: CUT_FRAMES, narrationIn: CUT_FRAMES }
    case 'dip_black':
      return { type: 'dip_black', frames: DIP_FADE, outgoingFade: DIP_FADE, narrationIn: DIP_FADE, color: '#000000' }
    case 'dip_white':
      return { type: 'dip_white', frames: DIP_FADE, outgoingFade: DIP_FADE, narrationIn: DIP_FADE, color: '#ffffff' }
    case 'dissolve':
    default:
      return { type: 'dissolve', frames: TRANSITION_FRAMES, outgoingFade: TRANSITION_FRAMES, narrationIn: TRANSITION_FRAMES }
  }
}

// ── computeSceneStartFrames ───────────────────────────────────────────────────
// Returns the absolute global start frame for each scene in the final timeline.
// Mirrors calculateDocumentaryDuration's per-boundary deduction logic exactly,
// so both the total duration and per-scene positions agree.
function computeSceneStartFrames(scenes, fps) {
  if (!scenes.length) return []
  const starts = [0]
  for (let i = 0; i < scenes.length - 1; i++) {
    const dur  = Math.max(Math.round((scenes[i].duration_seconds || 5) * fps), 30)
    const t    = getTransition(scenes[i])
    // Dip net deduction = DIP_FADE + DIP_FADE - DIP_MID (10 fr); dissolve/cut = t.frames
    const ded  = (t.type === 'dip_black' || t.type === 'dip_white')
      ? DIP_FADE + DIP_FADE - DIP_MID
      : t.frames
    starts.push(starts[i] + dur - ded)
  }
  return starts
}

// ── Duration helpers ──────────────────────────────────────────────────────────
export function calculateDocumentaryDuration(scenes, fps = 30) {
  if (!scenes?.length) return 30
  const base = scenes.reduce((sum, s) => sum + Math.round((s.duration_seconds || 5) * fps), 0)
  let deduction = 0
  for (let i = 0; i < scenes.length - 1; i++) {
    const t = getTransition(scenes[i])
    deduction += (t.type === 'dip_black' || t.type === 'dip_white')
      ? DIP_FADE + DIP_FADE - DIP_MID
      : t.frames
  }
  return Math.max(base - deduction, 30)
}

// Kept for backward compat — Remotion Studio still imports it
export function computeLayout(scenes) {
  const startFrames = []
  let cursor = 0
  scenes.forEach((scene) => {
    startFrames.push(cursor)
    cursor += Math.round((scene.duration_seconds || 5) * 30)
  })
  return { startFrames, totalFrames: cursor }
}

// Accept relative (/...) and HTTP URLs only — Windows absolute paths are not
// supported by Remotion headless Chrome; render.js always converts to HTTP URLs.
const isValidUrl = (src) => !!src && (src.startsWith('/') || src.startsWith('http'))

// ── SceneRenderer — per-scene visual dispatch ─────────────────────────────────
function SceneRenderer({ scene, imagePath, selectedClip, globalSettings }) {
  if (!scene) return <PlaceholderScene scene={{ scene_id: 'unknown' }} />
  if (scene.shot_type === 'image') {
    const s = imagePath ? { ...scene, image_path: imagePath } : scene
    if (!s.image_path) return <PlaceholderScene scene={scene} />
    return <ImageScene scene={s} />
  }
  if (scene.shot_type === 'motion_graphic') {
    if (!scene.motion_component) return <PlaceholderScene scene={scene} />
    return <MotionGraphicScene scene={scene} />
  }
  if (scene.shot_type === 'real_footage') {
    if (!selectedClip) return <PlaceholderScene scene={scene} />
    return <FootageScene clip={selectedClip} scene={scene} />
  }
  return <PlaceholderScene scene={scene} />
}

// ── NarrationTrack — global uploaded audio from ExportPanel ──────────────────
function NarrationTrack({ audio }) {
  const { durationInFrames, fps } = useVideoConfig()
  const startFrom = Math.round((audio.startFrom || 0) * fps)
  const vol       = audio.volume !== undefined ? audio.volume : 0.85
  const fadeInF   = Math.round((audio.fadeIn  || 0.5) * fps)
  const fadeOutF  = Math.round((audio.fadeOut || 2.0) * fps)
  const fadeStart = durationInFrames - fadeOutF
  const volume = (f) => {
    if (f < fadeInF)   return interpolate(f, [0, Math.max(fadeInF, 1)], [0, vol],  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    if (f > fadeStart) return interpolate(f, [fadeStart, durationInFrames], [vol, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    return vol
  }
  return <Audio src={audio.path} startFrom={startFrom} volume={volume} />
}

// ── Documentary composition ───────────────────────────────────────────────────
export function Documentary({
  scenes         = [],
  imagePaths     = {},
  selectedClips  = {},
  globalSettings = {},
  audio          = null,
  audioSpecs     = [],
}) {
  const { fps } = useVideoConfig()

  // Deduplicate scenes by scene_id — duplicates cause TransitionSeries to replay scenes.
  const uniqueScenes = useMemo(() => {
    const seen = new Set()
    return scenes.filter(s => {
      if (!s?.scene_id || seen.has(s.scene_id)) return false
      seen.add(s.scene_id)
      return true
    })
  }, [scenes])

  // Absolute start frames for each scene — used for global-space narration timing.
  const sceneStartFrames = useMemo(
    () => computeSceneStartFrames(uniqueScenes, fps),
    [uniqueScenes, fps]
  )

  // Build narration spec map keyed by scene_id
  const validSceneIds = new Set(uniqueScenes.map(s => s.scene_id))
  const audioSpecMap  = {}
  audioSpecs.forEach(spec => {
    if (validSceneIds.has(spec.scene_id)) audioSpecMap[spec.scene_id] = spec
  })

  const narrationCount = Object.values(audioSpecMap).filter(s => s.narration?.url).length
  console.log('[Documentary] scenes:', scenes.length, '→ unique:', uniqueScenes.length,
    '| narration:', narrationCount, '/', audioSpecs.length)

  if (!uniqueScenes.length) {
    return (
      <AbsoluteFill style={{
        backgroundColor: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ color: 'white', fontSize: 24, fontFamily: 'sans-serif' }}>No scenes loaded</div>
      </AbsoluteFill>
    )
  }

  // ── Visual sequences (narration NOT included here) ────────────────────────
  // TransitionSeries flattened children — no nesting fragments.
  //   dissolve / cut: [scene] → [Transition] → [next scene]
  //   dip:           [scene] → [Transition DIP_FADE] → [solid plate DIP_MID] → [Transition DIP_FADE] → [next scene]
  const seriesChildren = uniqueScenes.flatMap((scene, index) => {
    const durationFrames = Math.max(Math.round((scene.duration_seconds || 5) * fps), 30)
    const outT = getTransition(scene)

    const sequence = (
      <TransitionSeries.Sequence
        key={String(scene.scene_id)}
        durationInFrames={durationFrames}
      >
        <AbsoluteFill>
          <ErrorBoundaryScene scene={scene}>
            <SceneRenderer
              scene={scene}
              imagePath={imagePaths[scene.scene_id]}
              selectedClip={selectedClips[scene.scene_id] || null}
              globalSettings={globalSettings}
            />
          </ErrorBoundaryScene>
        </AbsoluteFill>
      </TransitionSeries.Sequence>
    )

    if (index < uniqueScenes.length - 1) {
      if (outT.type === 'dip_black' || outT.type === 'dip_white') {
        const dipTiming = linearTiming({ durationInFrames: DIP_FADE })
        return [
          sequence,
          <TransitionSeries.Transition key={`t1-${scene.scene_id}`} timing={dipTiming} presentation={fade()} />,
          <TransitionSeries.Sequence   key={`dip-${scene.scene_id}`} durationInFrames={DIP_MID}>
            <AbsoluteFill style={{ backgroundColor: outT.color }} />
          </TransitionSeries.Sequence>,
          <TransitionSeries.Transition key={`t2-${scene.scene_id}`} timing={dipTiming} presentation={fade()} />,
        ]
      }
      if (outT.type === 'cut') {
        return [
          sequence,
          <TransitionSeries.Transition key={`t-${scene.scene_id}`} timing={linearTiming({ durationInFrames: CUT_FRAMES })} presentation={fade()} />,
        ]
      }
      // dissolve (default)
      return [
        sequence,
        <TransitionSeries.Transition key={`t-${scene.scene_id}`} timing={springTiming({ durationInFrames: TRANSITION_FRAMES, config: { damping: 200 } })} presentation={fade()} />,
      ]
    }

    return [sequence]
  })

  // ── Narration tracks — rendered OUTSIDE TransitionSeries ──────────────────
  //
  // Moving narration to global frame space is required for J and L cuts, which
  // need audio to cross scene boundaries. Each track is a <Sequence from={N}>
  // whose `from` is the absolute global start frame of the narration audio.
  //
  // audio_cut field on each scene:
  //   "hard"  (default) — starts after the incoming visual transition completes
  //   "j_cut" — starts BEFORE the visual cut (audio_overlap_seconds early)
  //             fades IN over 6 frames to avoid a pop under the previous scene's visual
  //   "l_cut" — starts at default position but fades out audio_overlap_seconds AFTER
  //             the scene end, bleeding narration into the next scene's visual
  //
  // Validation / fallback:
  //   - Missing audio_cut → "hard"
  //   - Missing audio_overlap_seconds on j/l → use 1.0
  //   - narrationStart < 0 (j_cut on scene 0) → clamp to 0
  //   - Never j/l on dip transitions or the last scene → fall back to "hard"

  const narrationTracks = uniqueScenes.map((scene, index) => {
    const spec        = audioSpecMap[scene.scene_id] || null
    const narrationUrl = spec?.narration?.url || scene.audio_path || null
    if (!isValidUrl(narrationUrl)) return null

    const durationFrames = Math.max(Math.round((scene.duration_seconds || 5) * fps), 30)
    const sceneStart     = sceneStartFrames[index] ?? 0
    const sceneEnd       = sceneStart + durationFrames

    const outT    = getTransition(scene)
    const inT     = index === 0 ? null : getTransition(uniqueScenes[index - 1])
    const inDelay = index === 0 ? 0 : (inT?.narrationIn ?? 0)

    // Determine effective audio_cut — fall back to "hard" when conditions aren't met
    const rawCut      = scene.audio_cut || 'hard'
    const isDip       = outT.type === 'dip_black' || outT.type === 'dip_white'
    const isLastScene = index === uniqueScenes.length - 1
    const effectiveCut = (rawCut === 'hard' || isDip || isLastScene) ? 'hard' : rawCut

    // overlap in seconds — minimum 0.8s when a j/l cut is active
    const rawOverlapSec  = Number(scene.audio_overlap_seconds) || (effectiveCut !== 'hard' ? 1.0 : 0)
    const overlapSec     = effectiveCut !== 'hard' ? Math.max(rawOverlapSec, 0.8) : 0
    const overlapFr      = Math.round(overlapSec * fps)

    let narrationStart, sequenceDuration

    if (effectiveCut === 'j_cut') {
      // Narration starts BEFORE the visual cut — no inDelay (the whole point)
      narrationStart   = Math.max(0, sceneStart - overlapFr)
      sequenceDuration = sceneEnd - narrationStart
    } else if (effectiveCut === 'l_cut') {
      // Normal start, but audio runs overlapFr frames past scene end
      narrationStart   = sceneStart + inDelay
      sequenceDuration = sceneEnd + overlapFr - narrationStart
    } else {
      // hard — classic: start after incoming transition, fade before outgoing
      narrationStart   = sceneStart + inDelay
      sequenceDuration = sceneEnd - narrationStart
    }

    sequenceDuration = Math.max(sequenceDuration, 1)

    // Volume fn — `frame` is sequence-local (0 = narrationStart in global space)
    const localSceneEnd = sceneEnd - narrationStart  // when scene's visual ends, in local frames

    let volumeFn
    if (effectiveCut === 'j_cut') {
      volumeFn = (frame) => {
        // Fade in over 6 frames — narration is starting under the previous scene's visual
        if (frame < 6) return interpolate(frame, [0, 6], [0, 1.0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        // Fade out before outgoing transition
        const fadeOutStart = localSceneEnd - outT.outgoingFade - 9
        if (frame >= fadeOutStart) return interpolate(frame, [fadeOutStart, localSceneEnd], [1.0, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        return 1.0
      }
    } else if (effectiveCut === 'l_cut') {
      // Sustain past scene end, fade out over 6 frames at the overlap boundary
      const localNarrationEnd  = localSceneEnd + overlapFr
      const localFadeOutStart  = localNarrationEnd - 6
      volumeFn = (frame) => {
        if (frame >= localFadeOutStart) return interpolate(frame, [localFadeOutStart, localNarrationEnd], [1.0, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        return 1.0
      }
    } else {
      // hard — fade out ahead of the outgoing transition (preserves original behaviour)
      const fadeOutStart = localSceneEnd - outT.outgoingFade - 9
      volumeFn = (frame) => {
        if (frame >= fadeOutStart) return interpolate(frame, [fadeOutStart, localSceneEnd], [1.0, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        return 1.0
      }
    }

    return { key: `narr-${scene.scene_id}`, narrationStart, sequenceDuration, narrationUrl, volumeFn }
  }).filter(Boolean)

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {/* Global narration track uploaded via ExportPanel (not per-scene) */}
      {audio?.path && <NarrationTrack audio={audio} />}

      {/* Visual timeline */}
      <TransitionSeries>
        {seriesChildren}
      </TransitionSeries>

      {/* Per-scene narration — outside TransitionSeries so audio can cross boundaries.
          J-cut: narration starts before the visual; L-cut: narration bleeds past scene end. */}
      {narrationTracks.map(({ key, narrationStart, sequenceDuration, narrationUrl, volumeFn }) => (
        <Sequence key={key} from={narrationStart} durationInFrames={sequenceDuration}>
          <Audio src={narrationUrl} volume={volumeFn} />
        </Sequence>
      ))}
    </AbsoluteFill>
  )
}
