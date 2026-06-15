import { useState } from 'react'
import { Video, staticFile, AbsoluteFill } from 'remotion'
import { FilmGrain, Vignette, ColorGrade, LightLeak, LetterboxBars, SceneFade } from './effects/CinematicEffects'
import PlaceholderScene from './PlaceholderScene'

export const FootageScene = ({ clip, scene }) => {
  const [error, setError] = useState(false)

  const filename = clip?.file
    ? clip.file.split('/').pop().split('\\').pop()
    : null

  const grade   = scene?.grade   || 'cool_blue'
  const mood    = scene?.mood    || 'neutral'
  const letterbox = scene?.letterbox !== false

  if (error || !filename) {
    return (
      <PlaceholderScene
        label={filename ? 'Clip not found' : 'No clip selected'}
        sublabel={filename}
        scene={scene}
      />
    )
  }

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Video
        src={staticFile(`clips/${filename}`)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        onError={() => {
          console.error('[FootageScene] failed to load:', filename)
          setError(true)
        }}
      />
      <ColorGrade grade={grade} />
      <Vignette intensity={0.35} mood={mood} />
      <FilmGrain intensity={0.04} />
      <LightLeak mood={mood} enabled />
      <SceneFade fadeInFrames={6} fadeOutFrames={6} />
      <LetterboxBars enabled={letterbox} />
    </AbsoluteFill>
  )
}

export default FootageScene
