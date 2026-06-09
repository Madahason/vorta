import { useMemo } from 'react'
import { Player } from '@remotion/player'
import { Documentary, calculateDocumentaryDuration } from '@remotion-compositions/compositions/Documentary'

// imagePaths: { [scene_id]: url_string } — derived from sceneStatuses in VideoCreator
// selectedClips: { [scene_id]: clip_object }
// audioSpecs: [{ scene_id, music, ambient }] — from AudioPanel
export function VideoPlayer({ scenes, imagePaths, selectedClips, globalSettings, audioSpecs, style, autoPlay = false, loop = false, initialFrame }) {
  const fps = 30

  const inputProps = useMemo(() => {
    // Deduplicate by scene_id (keep last occurrence) before passing to Remotion.
    // Duplicate IDs cause Series to render the same sequence multiple times,
    // making scenes appear to play 4-5 times with slight visual variations.
    const seenIds     = new Set()
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
      audioSpecs:     audioSpecs     || [],
    }
  }, [scenes, imagePaths, selectedClips, globalSettings, audioSpecs])

  const totalFrames = useMemo(() => {
    if (!scenes?.length) return 30
    const TRANSITION_FRAMES = 12
    const base      = scenes.reduce((sum, s) => sum + Math.round((s.duration_seconds || 5) * fps), 0)
    const deduction = Math.max(0, scenes.length - 1) * TRANSITION_FRAMES
    const t = Math.max(base - deduction, 30)
    console.log('[VideoPlayer] scenes:', scenes?.length, 'totalFrames:', t, '(incl. crossfade deduction)')
    return t
  }, [scenes, fps])

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
      numberOfSharedAudioTags={10}
      {...(initialFrame !== undefined ? { initialFrame } : {})}
    />
  )
}
