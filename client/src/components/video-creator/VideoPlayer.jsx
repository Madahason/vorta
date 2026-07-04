import { useMemo, useRef, useEffect, useState } from 'react'
import { Player } from '@remotion/player'
import { Documentary, calculateDocumentaryDuration } from '@remotion-compositions/compositions/Documentary'

// Voiceover-repeat fix: everything that moves a scene's (and therefore every downstream
// narration Sequence's) start frame. When any of these change while the Player is PLAYING —
// a Fine-Tune duration trim, a reorder, a transition change, or VoiceoverPanel's automatic
// whole-array sync-timings refresh after a generation run — every later narration
// <Sequence from={...}> shifts under the fixed playhead, and Remotion seeks the
// currently-playing narration by the aggregate delta: backward = the last seconds audibly
// REPLAY, forward = a skip. The timeline position is meaningless across such an edit, so
// the correct behavior is to pause and let the user resume.
function timelineSignature(scenes) {
  return (scenes || []).map(s =>
    `${s.scene_id}:${s.duration_seconds}:${s.transition_out || 'dissolve'}:${s.audio_cut || 'hard'}:` +
    `${s.audio_overlap_seconds ?? ''}:${s.is_manual_offset ? `${s.jcut_offset ?? ''}/${s.lcut_offset ?? ''}` : ''}`
  ).join('|')
}

// Auto-build minimal audioSpecs from scene.audio_path when no specs have been
// applied yet. This means narration plays immediately after voiceover generation
// without requiring "Build Music Plan" first. Music/ambient layer on top when
// Build Music Plan runs and returns real specs.
function buildAutoSpecs(scenes) {
  return (scenes || []).map(scene => ({
    scene_id:       scene.scene_id,
    narration:      scene.audio_path ? { url: scene.audio_path, volume: 1.0 } : null,
    music:          null,
    ambient:        null,
    sting:          null,
    overlay_sounds: [],
  }))
}

// imagePaths: { [scene_id]: url_string } — derived from sceneStatuses in VideoCreator
// selectedClips: { [scene_id]: clip_object }
// audioSpecs: [{ scene_id, narration, music, ambient }] — from AudioPanel
export function VideoPlayer({ scenes, imagePaths, selectedClips, globalSettings, audioSpecs, style, autoPlay = false, loop = false, initialFrame }) {
  const fps = 30

  // Use real audioSpecs if available; otherwise auto-build from scene.audio_path
  // so narration plays even before "Build Music Plan" is clicked.
  const effectiveAudioSpecs = useMemo(() => {
    if (audioSpecs?.length > 0) return audioSpecs
    const auto = buildAutoSpecs(scenes)
    const withNarration = auto.filter(s => s.narration?.url).length
    if (withNarration > 0) {
      console.log('[VideoPlayer] auto-specs: using scene.audio_path for', withNarration, '/', auto.length, 'scenes')
    }
    return auto
  }, [scenes, audioSpecs])

  const inputProps = useMemo(() => {
    // Deduplicate by scene_id (keep last occurrence) before passing to Remotion.
    const seenIds      = new Set()
    const uniqueScenes = [...(scenes || [])].reverse().filter(s => {
      if (!s?.scene_id || seenIds.has(s.scene_id)) return false
      seenIds.add(s.scene_id)
      return true
    }).reverse()

    if (uniqueScenes.length !== (scenes?.length ?? 0)) {
      console.warn('[VideoPlayer] deduplicated scenes:', scenes?.length, '→', uniqueScenes.length)
    }

    return {
      // Spread each scene to guarantee a new reference — Remotion's Player compares
      // inputProps with reference equality; without this, overlay edits in OverlayStudio
      // don't re-render the composition even though the scenes state actually changed.
      scenes:         uniqueScenes.map(s => ({ ...s })),
      imagePaths:     imagePaths     || {},
      selectedClips:  selectedClips  || {},
      globalSettings: globalSettings || {},
      audioSpecs:     effectiveAudioSpecs,
    }
  }, [scenes, imagePaths, selectedClips, globalSettings, effectiveAudioSpecs])

  const totalFrames = useMemo(
    () => calculateDocumentaryDuration(inputProps.scenes, fps),
    [inputProps.scenes, fps]
  )

  // Shared audio tag pool scaled to project size (scenes.length + 2, the same pattern as
  // the earlier Html5Audio-limit fix) instead of a fixed 256. Remotion's shared-audio
  // manager iterates the ENTIRE pool on every per-frame audio prop update (volume is a
  // function, so that's every frame) — a 256-tag pool taxes the render loop constantly.
  // Frozen at first render because Remotion throws if this prop changes after mount.
  const [sharedAudioTags] = useState(() => (scenes?.length || 0) + 2)

  // Voiceover-repeat fix: pause if the timeline geometry changed while playing (see
  // timelineSignature above). Initial mount never pauses — the ref starts in sync.
  const playerRef = useRef(null)
  const signature = useMemo(() => timelineSignature(inputProps.scenes), [inputProps.scenes])
  const prevSignatureRef = useRef(signature)
  useEffect(() => {
    if (prevSignatureRef.current === signature) return
    prevSignatureRef.current = signature
    const player = playerRef.current
    if (player && player.isPlaying?.()) {
      player.pause()
      console.log('[VideoPlayer] scene timing changed during playback — paused (narration Sequences shifted under the playhead; resuming from a stale position would replay or skip audio)')
    }
  }, [signature])

  if (!scenes?.length) return null

  return (
    <Player
      ref={playerRef}
      component={Documentary}
      inputProps={inputProps}
      durationInFrames={totalFrames}
      fps={fps}
      compositionWidth={1920}
      compositionHeight={1080}
      style={style || {
        width: '100%',
        aspectRatio: '16 / 9',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
      controls
      loop={loop}
      clickToPlay={!autoPlay}
      autoPlay={autoPlay}
      doubleClickToFullscreen
      numberOfSharedAudioTags={sharedAudioTags}
      acknowledgeRemotionLicense
      {...(initialFrame !== undefined ? { initialFrame } : {})}
    />
  )
}
