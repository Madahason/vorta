import { useMemo }                                                            from 'react'
import { AbsoluteFill, Audio, Sequence, interpolate, useVideoConfig, useCurrentFrame } from 'remotion'
import { TransitionSeries, springTiming, linearTiming }                      from '@remotion/transitions'
import { fade }                                                              from '@remotion/transitions/fade'
import ImageScene             from '../components/ImageScene'
import SplitScreenScene       from '../components/SplitScreenScene'
import FootageScene           from '../components/FootageScene'
import PlaceholderScene       from '../components/PlaceholderScene'
import { MotionGraphicScene } from '../components/MotionGraphicScene'
import { ErrorBoundaryScene } from '../components/ErrorBoundaryScene'
import { ThreeGlobe }         from '../components/ThreeGlobe'

// ── Transition frame constants ────────────────────────────────────────────────
const TRANSITION_FRAMES  = 12  // dissolve — crossfade overlap (0.4 s at 30 fps)
const CUT_FRAMES         = 1   // cut — near-instant
const DIP_FRAMES         = 18  // dip_black / dip_white — total overlap budget
const DIP_FADE           = Math.round(DIP_FRAMES / 2)  // 9 — each fade arm
// DIP_MID must be > DIP_FADE: TransitionSeries requires each sequence to be longer
// than its adjacent transition. Old value was 8 (< DIP_FADE 9) → always crashed.
const DIP_MID            = DIP_FADE + 1  // 10 — plate longer than fade arm
// MIN_SCENE_FRAMES must exceed the longest transition arm (TRANSITION_FRAMES = 12).
// Any scene sequence shorter than its adjacent transition causes a Remotion crash.
const MIN_SCENE_FRAMES   = TRANSITION_FRAMES + 1  // 13 — safely longer than any transition
// FT-4: manual J-cut/L-cut boundary offset safety margin — mirrors
// server/services/frameMath.js's BOUNDARY_SAFETY_MARGIN_SECONDS. Keep in sync.
const BOUNDARY_SAFETY_MARGIN_SECONDS = 0.2

// ── getTransition(scene, sceneDurationFrames?) ────────────────────────────────
// Pure fn — reads scene.transition_out, returns a descriptor used by both the
// duration calculator and the flatMap renderer.
//   frames       — overlap eaten from this scene's tail (TransitionSeries.Transition)
//   outgoingFade — same for non-dip; used for narration fade-out timing
//   narrationIn  — frames to delay narration in the NEXT scene (incoming perspective)
//
// If sceneDurationFrames is provided and the scene is too short to support a dip
// transition (requires at least DIP_FADE frames on each side), dip automatically
// downgrades to dissolve to avoid "sequence shorter than transition" crash.
function getTransition(scene, sceneDurationFrames) {
  let type = scene?.transition_out || 'dissolve'

  // Downgrade dip transitions on scenes that are too short.
  // A dip requires at least DIP_FADE frames available on this scene's tail.
  if ((type === 'dip_black' || type === 'dip_white') &&
      sceneDurationFrames !== undefined &&
      sceneDurationFrames < DIP_FADE * 2) {
    console.warn(
      `[Documentary] scene ${scene?.scene_id} too short for dip transition ` +
      `(${sceneDurationFrames} frames < ${DIP_FADE * 2} required) — falling back to dissolve`
    )
    type = 'dissolve'
  }

  switch (type) {
    case 'cut':
    // FT-6: match cut is semantic/suggested only — visually and in every downstream
    // consumer (seriesChildren's flatMap, narration timing) it IS a cut. Returning
    // type: 'cut' here (not a new 'match' descriptor type) means every consumer already
    // checking `outT.type === 'cut'` handles it with zero new code, per the task's explicit
    // "do not add new transition math for this."
    case 'match':
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

// ── sceneDur(scene, fps) ──────────────────────────────────────────────────────
// Single source of truth for per-scene frame count used everywhere in this file.
// Enforces MIN_SCENE_FRAMES so no sequence is shorter than its adjacent transition.
function sceneDur(scene, fps) {
  return Math.max(Math.round((scene.duration_seconds || 5) * fps), MIN_SCENE_FRAMES)
}

// ── computeSceneStartFrames ───────────────────────────────────────────────────
// Returns the absolute global start frame for each scene in the final timeline.
// Mirrors calculateDocumentaryDuration's per-boundary deduction logic exactly,
// so both the total duration and per-scene positions agree.
export function computeSceneStartFrames(scenes, fps) {
  if (!scenes.length) return []
  const starts = [0]
  for (let i = 0; i < scenes.length - 1; i++) {
    const dur  = sceneDur(scenes[i], fps)
    const t    = getTransition(scenes[i], dur)
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
  const base = scenes.reduce((sum, s) => sum + sceneDur(s, fps), 0)
  let deduction = 0
  for (let i = 0; i < scenes.length - 1; i++) {
    const dur = sceneDur(scenes[i], fps)
    const t   = getTransition(scenes[i], dur)
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
  // FT-8: cutaway insert. Hooks must run unconditionally before any early return (Rules of
  // Hooks) — cheap, and every child component this dispatches to already reads frame/fps
  // itself anyway, so this adds no meaningful overhead. useCurrentFrame() here returns the
  // frame LOCAL to this scene's own TransitionSeries.Sequence (Remotion scopes it to the
  // nearest enclosing Sequence), which is exactly "seconds relative to the scene's own
  // start" the task calls for — no separate frame-offset bookkeeping needed.
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  if (!scene) return <PlaceholderScene scene={{ scene_id: 'unknown' }} />
  if (scene.shot_type === '3d_graphic') {
    return <ThreeGlobe scene={scene} />
  }
  if (scene.shot_type === 'image') {
    const s = imagePath ? { ...scene, image_path: imagePath } : scene
    if (!s.image_path) return <PlaceholderScene scene={scene} />

    // FT-8: temporarily swap in the cutaway's image for the [insert_at, insert_at+duration)
    // window, then revert to the main image_path — purely a per-frame image_path swap. It
    // never touches durationInFrames, the Sequence, or the narration <Audio> track (a
    // completely separate element elsewhere in this file, with zero awareness of this) — the
    // scene's duration and its narration play through exactly as if no cutaway existed.
    const cutaway = scene.cutaway
    let effectiveImagePath = s.image_path
    if (cutaway?.image_path && cutaway.insert_at != null && cutaway.duration != null) {
      const insertAtFrames = Math.round(cutaway.insert_at * fps)
      const endFrames       = insertAtFrames + Math.round(cutaway.duration * fps)
      if (frame >= insertAtFrames && frame < endFrames) {
        effectiveImagePath = cutaway.image_path
      }
    }
    const withCutaway = effectiveImagePath !== s.image_path ? { ...s, image_path: effectiveImagePath } : s

    // FT-7: split-screen — one scene, one Sequence, one duration; just two visual panels
    // instead of one. Falls back cleanly to single-panel ImageScene (no broken/blank scene)
    // whenever layout is "single" OR secondary_image_path hasn't been set yet — e.g. right
    // after switching to a split layout but before picking a source, or after reverting.
    //
    // FT-7 + FT-8 interaction: a cutaway on a split-layout scene replaces only the PRIMARY
    // panel (the image_path swap above) — the secondary panel keeps showing its own image
    // throughout. This preserves the split layout's visual identity during the cutaway
    // instead of collapsing it to a single full-frame image and back, which would be a much
    // more jarring visual event for what's meant to be a brief insert. See PLAN.md FT-8 for
    // the full reasoning.
    const isSplit = withCutaway.layout === 'split_horizontal' || withCutaway.layout === 'split_vertical'
    if (isSplit && withCutaway.secondary_image_path) {
      return <SplitScreenScene scene={withCutaway} />
    }
    return <ImageScene scene={withCutaway} />
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
  const { fps, durationInFrames: configDuration } = useVideoConfig()

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

  // Build narration spec map keyed by scene_id — memoized so audio props stay stable
  const audioSpecMap = useMemo(() => {
    const validIds = new Set(uniqueScenes.map(s => s.scene_id))
    const map = {}
    audioSpecs.forEach(spec => { if (validIds.has(spec.scene_id)) map[spec.scene_id] = spec })
    return map
  }, [uniqueScenes, audioSpecs])

  // Frame mismatch assertion — only log once when values change, not on every 30fps render
  useMemo(() => {
    const expectedFrames = calculateDocumentaryDuration(uniqueScenes, fps)
    if (expectedFrames !== configDuration) {
      console.warn(
        `[Documentary] FRAME MISMATCH: composition durationInFrames=${configDuration} ` +
        `but calculateDocumentaryDuration=${expectedFrames} (diff=${configDuration - expectedFrames})`
      )
    }
  }, [uniqueScenes, fps, configDuration])

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
    const durationFrames = sceneDur(scene, fps)
    const outT = getTransition(scene, durationFrames)

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

  // Narration tracks — memoized so volumeFn closures and the track array maintain
  // stable references across Remotion's 30fps re-renders. Without memoization,
  // new volumeFn references every frame can cause Remotion's <Audio> to restart playback.
  const narrationTracks = useMemo(() => uniqueScenes.map((scene, index) => {
    const spec        = audioSpecMap[scene.scene_id] || null
    const narrationUrl = spec?.narration?.url || scene.audio_path || null
    if (!isValidUrl(narrationUrl)) return null

    const durationFrames = sceneDur(scene, fps)
    const sceneStart     = sceneStartFrames[index] ?? 0
    const sceneEnd       = sceneStart + durationFrames

    const outT      = getTransition(scene, durationFrames)
    const prevScene = index === 0 ? null : uniqueScenes[index - 1]
    const prevDur   = index === 0 ? 0 : sceneDur(prevScene, fps)
    const inT       = index === 0 ? null : getTransition(prevScene, prevDur)
    const inDelay   = index === 0 ? 0 : (inT?.narrationIn ?? 0)
    const nextScene = uniqueScenes[index + 1] || null

    const rawCut      = scene.audio_cut || 'hard'
    const isDip       = outT.type === 'dip_black' || outT.type === 'dip_white'
    const isLastScene = index === uniqueScenes.length - 1
    const effectiveCut = (rawCut === 'hard' || isDip || isLastScene) ? 'hard' : rawCut

    // FT-4: manual boundary offset override — lives on the OUTGOING (earlier) scene of a
    // boundary pair. l_cut is THIS scene's own outgoing boundary (scene -> nextScene), so the
    // manual value is read from `scene` itself. j_cut is THIS scene's INCOMING boundary
    // (prevScene -> scene) — which is prevScene's outgoing boundary — so the manual value is
    // read from `prevScene`. boundary_partner_scene_id guards against a reorder (FT-2) having
    // broken the adjacency the offset was calibrated for; scenes.js's /reorder route already
    // resets is_manual_offset when that happens, but this is a defensive second check in case
    // scenes.json was edited by another path.
    let manualOverlapSec = null
    if (effectiveCut === 'l_cut' && scene.is_manual_offset && scene.boundary_partner_scene_id === nextScene?.scene_id) {
      manualOverlapSec = Number(scene.lcut_offset) || 0
    } else if (effectiveCut === 'j_cut' && prevScene?.is_manual_offset && prevScene.boundary_partner_scene_id === scene.scene_id) {
      manualOverlapSec = Number(prevScene.jcut_offset) || 0
    } else if (effectiveCut === 'l_cut' && scene.is_manual_offset) {
      console.warn(`[Documentary] scene ${scene.scene_id}: manual l_cut offset ignored — its paired scene changed (reorder broke adjacency)`)
    } else if (effectiveCut === 'j_cut' && prevScene?.is_manual_offset) {
      console.warn(`[Documentary] scene ${prevScene.scene_id}: manual j_cut offset ignored — its paired scene changed (reorder broke adjacency)`)
    }

    let overlapSec
    if (effectiveCut === 'hard') {
      overlapSec = 0
    } else if (manualOverlapSec !== null) {
      // Defensive re-clamp against actual audio durations in case persisted data is stale —
      // 0.0 is intentionally allowed through untouched (no forced 0.8s floor like automatic).
      const boundaryScene = effectiveCut === 'l_cut' ? scene     : prevScene
      const partnerScene  = effectiveCut === 'l_cut' ? nextScene : scene
      const maxAllowed = Math.max(0, Math.min(
        Number(boundaryScene?.audio_duration) || 0,
        Number(partnerScene?.audio_duration)  || 0
      ) - BOUNDARY_SAFETY_MARGIN_SECONDS)
      overlapSec = Math.min(Math.max(manualOverlapSec, 0), maxAllowed)
      if (overlapSec !== manualOverlapSec) {
        console.warn(`[Documentary] scene ${boundaryScene?.scene_id}: manual ${effectiveCut} offset ${manualOverlapSec}s clamped to ${overlapSec}s (audio duration safety margin)`)
      }
    } else {
      const rawOverlapSec = Number(scene.audio_overlap_seconds) || 1.0
      overlapSec = Math.max(rawOverlapSec, 0.8)
    }
    const overlapFr = Math.round(overlapSec * fps)

    let narrationStart, sequenceDuration

    if (effectiveCut === 'j_cut') {
      narrationStart   = Math.max(0, sceneStart - overlapFr)
      sequenceDuration = sceneEnd - narrationStart
    } else if (effectiveCut === 'l_cut') {
      narrationStart   = sceneStart + inDelay
      sequenceDuration = sceneEnd + overlapFr - narrationStart
    } else {
      narrationStart   = sceneStart + inDelay
      sequenceDuration = sceneEnd - narrationStart
    }

    sequenceDuration = Math.max(sequenceDuration, 1)

    const localSceneEnd = sceneEnd - narrationStart

    // Fine-Tune per-scene narration level override — optional, defaults to full volume
    // (matches the literal 1.0 this multiplies against previously). Music/ambient overrides
    // are stored on the scene but have no corresponding render-time track yet.
    const narrationVol = scene.audio_mix_override?.narration ?? 1.0

    let volumeFn
    if (effectiveCut === 'j_cut') {
      const fadeOutStart = localSceneEnd - outT.outgoingFade - 9
      volumeFn = (frame) => {
        if (frame < 6) return interpolate(frame, [0, 6], [0, narrationVol], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        if (frame >= fadeOutStart) return interpolate(frame, [fadeOutStart, localSceneEnd], [narrationVol, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        return narrationVol
      }
    } else if (effectiveCut === 'l_cut') {
      const localNarrationEnd  = localSceneEnd + overlapFr
      const localFadeOutStart  = localNarrationEnd - 6
      volumeFn = (frame) => {
        if (frame >= localFadeOutStart) return interpolate(frame, [localFadeOutStart, localNarrationEnd], [narrationVol, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        return narrationVol
      }
    } else {
      const fadeOutStart = localSceneEnd - outT.outgoingFade - 9
      volumeFn = (frame) => {
        if (frame >= fadeOutStart) return interpolate(frame, [fadeOutStart, localSceneEnd], [narrationVol, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        return narrationVol
      }
    }

    return { key: `narr-${scene.scene_id}`, narrationStart, sequenceDuration, narrationUrl, volumeFn }
  }).filter(Boolean), [uniqueScenes, audioSpecMap, sceneStartFrames, fps])

  // Regression guard: warn if any narration URL appears more than once (runs once when tracks change)
  useMemo(() => {
    const counts = {}
    narrationTracks.forEach(t => { counts[t.narrationUrl] = (counts[t.narrationUrl] || 0) + 1 })
    Object.entries(counts).forEach(([url, count]) => {
      if (count > 1) console.warn(`[Documentary] DUPLICATE NARRATION: "${url}" renders ${count}×`)
    })
  }, [narrationTracks])

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
