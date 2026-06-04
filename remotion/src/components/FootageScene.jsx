import { useState } from 'react'
import { Video, staticFile, AbsoluteFill } from 'remotion'
import FilmLook from './overlays/FilmLook'
import PlaceholderScene from './PlaceholderScene'

// Converts the backend file path to a Remotion static path.
// Clips must be copied to remotion/public/clips/ for Remotion to serve them.
const getClipPath = (filePath) => {
  const filename = filePath.split('/').pop()
  return staticFile(`clips/${filename}`)
}

export default function FootageScene({ clip }) {
  const [error, setError] = useState(false)

  // Use filename field if present, fall back to deriving from file path
  const filename = clip?.filename || (clip?.file ? clip.file.split('/').pop() : null)

  if (error || !filename) {
    return (
      <PlaceholderScene
        label={filename ? 'Clip not found' : 'No clip selected'}
        sublabel={filename}
      />
    )
  }

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Video
        src={staticFile(`clips/${filename}`)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        onError={() => setError(true)}
      />
      <FilmLook grade="neutral" grainIntensity={0.10} vignetteIntensity={0.35} />
    </AbsoluteFill>
  )
}
