import { useState } from 'react'
import { Video, staticFile, AbsoluteFill } from 'remotion'
import FilmLook from './overlays/FilmLook'
import PlaceholderScene from './PlaceholderScene'

export default function FootageScene({ clip, scene }) {
  const [error, setError] = useState(false)

  // Extract just the filename so staticFile() can resolve it from remotion/public/clips/.
  // clip.file may arrive as /library/clips/name.mp4 or http://localhost:3001/library/clips/name.mp4
  const filename = clip?.file
    ? clip.file.split('/').pop().split('\\').pop()
    : null

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
      <FilmLook grade="neutral" grainIntensity={0.04} vignetteIntensity={0.35} />
    </AbsoluteFill>
  )
}
