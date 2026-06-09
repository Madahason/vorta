import { useState } from 'react'
import { Audio } from 'remotion'

export function SafeAudio({ src, volume, loop }) {
  const [failed, setFailed] = useState(false)
  if (failed || !src) return null
  return (
    <Audio
      src={src}
      volume={volume}
      loop={loop}
      onError={() => {
        console.warn('[SafeAudio] failed to load:', src)
        setFailed(true)
      }}
    />
  )
}
