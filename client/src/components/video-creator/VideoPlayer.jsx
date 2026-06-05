import { Player } from '@remotion/player'
import { Documentary, calculateDocumentaryDuration } from '@remotion-compositions/compositions/Documentary'

// imagePaths: { [scene_id]: url_string } — derived from sceneStatuses in VideoCreator
// selectedClips: { [scene_id]: clip_object }
export function VideoPlayer({ scenes, imagePaths, selectedClips, globalSettings, style }) {
  if (!scenes?.length) return null

  const fps         = 30
  const totalFrames = Math.max(calculateDocumentaryDuration(scenes), 30)

  return (
    <Player
      component={Documentary}
      inputProps={{
        scenes,
        imagePaths:    imagePaths    || {},
        selectedClips: selectedClips || {},
        globalSettings: globalSettings || {},
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
