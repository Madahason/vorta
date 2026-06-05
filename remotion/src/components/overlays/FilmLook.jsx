import { useCurrentFrame } from 'remotion'
import { useEffect, useRef } from 'react'

const GRADE_COLOR = {
  cool_blue:  'rgba(20, 40, 80, 0.12)',
  warm_amber: 'rgba(100, 60, 10, 0.10)',
}

// Sparse random grain drawn per-frame using Math.random() seeded by frame.
// Each pixel is independently decided — avoids correlated hash patterns
// that produce vertical / horizontal strip artefacts.
function Grain({ intensity = 0.06 }) {
  const frame      = useCurrentFrame()
  const canvasRef  = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    const imageData = ctx.createImageData(width, height)
    const data      = imageData.data

    for (let i = 0; i < data.length; i += 4) {
      const noise = Math.random() * 255
      // Only ~intensity fraction of pixels are lit; rest are fully transparent
      const alpha = Math.random() < intensity ? Math.floor(noise * intensity * 1.5) : 0
      data[i]     = 200   // R
      data[i + 1] = 200   // G
      data[i + 2] = 200   // B
      data[i + 3] = alpha // A
    }

    ctx.putImageData(imageData, 0, 0)
  }, [frame, intensity])  // re-draw every frame so grain animates

  return (
    <canvas
      ref={canvasRef}
      width={1920}
      height={1080}
      style={{
        position: 'absolute',
        top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
        mixBlendMode: 'overlay',
      }}
    />
  )
}

export default function FilmLook({
  grade            = 'cool_blue',
  grainIntensity   = 0.06,
  vignetteIntensity = 0.45,
}) {
  const wrapperFilter = grade === 'desaturated' ? 'saturate(0.55)' : 'none'

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', filter: wrapperFilter }}>
      {/* Animated grain — skip entirely when intensity is 0 */}
      {grainIntensity > 0 && <Grain intensity={grainIntensity} />}

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,0,${vignetteIntensity}) 100%)`,
      }} />

      {/* Color grade tint */}
      {(grade === 'cool_blue' || grade === 'warm_amber') && (
        <div style={{
          position: 'absolute', inset: 0,
          background: GRADE_COLOR[grade],
          mixBlendMode: 'multiply',
        }} />
      )}
    </div>
  )
}
