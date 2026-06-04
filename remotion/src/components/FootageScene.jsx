import { AbsoluteFill, Video } from 'remotion'
import FilmLook from './overlays/FilmLook'

// Renders a selected clip file as a full-frame video with FilmLook on top.
// clip: { file, duration, mood, ... }
export default function FootageScene({ clip }) {
  if (!clip?.file) {
    return (
      <AbsoluteFill style={{ background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#333', fontSize: 14, fontFamily: 'sans-serif' }}>no clip selected</div>
      </AbsoluteFill>
    )
  }

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Video
        src={clip.file}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <FilmLook grade="cool_blue" grainIntensity={0.08} vignetteIntensity={0.35} />
    </AbsoluteFill>
  )
}
