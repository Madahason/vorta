import { Player } from '@remotion/player'
import { Documentary } from '@remotion-compositions/compositions/Documentary'

// imagePaths: { [scene_id]: url_string } — derived from sceneStatuses in VideoCreator
// selectedClips: { [scene_id]: clip_object }
export function VideoPlayer({ scenes, imagePaths, selectedClips, style }) {
  const fps = 30

  if (!scenes?.length) return null

  const totalFrames = Math.max(
    scenes.reduce((sum, s) => sum + (s.duration_seconds || 5) * fps, 0),
    30
  )

  return (
    <Player
      component={Documentary}
      inputProps={{
        scenes,
        imagePaths:    imagePaths    || {},
        selectedClips: selectedClips || {},
      }}
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
      loop={false}
      clickToPlay
      doubleClickToFullscreen
    />
  )
}
