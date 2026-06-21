import { useMemo } from 'react'
import { Player } from '@remotion/player'
import { Documentary, calculateDocumentaryDuration } from '@remotion-compositions/compositions/Documentary'

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

  if (!scenes?.length) return null

  return (
    <Player
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
      numberOfSharedAudioTags={256}
      acknowledgeRemotionLicense
      {...(initialFrame !== undefined ? { initialFrame } : {})}
    />
  )
}
