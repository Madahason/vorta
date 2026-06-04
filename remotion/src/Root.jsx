import { Composition } from 'remotion'
import { Documentary, calculateDocumentaryDuration } from './compositions/Documentary'

export function RemotionRoot() {
  return (
    <Composition
      id="Documentary"
      component={Documentary}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ scenes: [], imagePaths: {} }}
      calculateMetadata={({ props }) => ({
        durationInFrames: calculateDocumentaryDuration(props.scenes),
      })}
    />
  )
}
