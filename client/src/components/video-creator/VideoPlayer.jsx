import { useMemo } from 'react'
import { Player } from '@remotion/player'
import { Documentary, calculateDocumentaryDuration } from '@remotion-compositions/compositions/Documentary'

// imagePaths: { [scene_id]: url_string } — derived from sceneStatuses in VideoCreator
// selectedClips: { [scene_id]: clip_object }
// audioSpecs: [{ scene_id, music, ambient, sting }] — from AudioPanel
export function VideoPlayer({ scenes, imagePaths, selectedClips, globalSettings, audioSpecs, style, autoPlay = false, loop = false, initialFrame }) {
  const fps = 30

  // Spread each scene to guarantee a new reference — Remotion's Player compares inputProps
  // with reference equality; without this, overlay edits made in OverlayStudio don't re-render
  // the composition even though the scenes state actually changed.
  const inputProps = useMemo(() => ({
    scenes: (scenes || []).map(s => ({ ...s })),
    imagePaths:     imagePaths     || {},
    selectedClips:  selectedClips  || {},
    globalSettings: globalSettings || {},
    audioSpecs:     audioSpecs     || [],
  }), [scenes, imagePaths, selectedClips, globalSettings, audioSpecs])

  const totalFrames = useMemo(
    () => scenes?.length ? Math.max(calculateDocumentaryDuration(scenes), 30) : 30,
    [scenes],
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
      {...(initialFrame !== undefined ? { initialFrame } : {})}
    />
  )
}
