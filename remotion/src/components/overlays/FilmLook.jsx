import { useCurrentFrame } from 'remotion'
import { useEffect, useRef } from 'react'

const GRADE_COLOR = {
  cool_blue:  'rgba(20, 40, 80, 0.12)',
  warm_amber: 'rgba(100, 60, 10, 0.10)',
}

// Sparse random grain drawn per-frame.
// pattern: 'random' | 'horizontal_bias' | 'diagonal'
function Grain({ intensity = 0.06, pattern = 'random' }) {
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
      const pixelIdx = i / 4
      const x = pixelIdx % width
      const y = Math.floor(pixelIdx / width)

      // Pattern bias: subtle directional weighting
      let bias = 0
      if (pattern === 'horizontal_bias') bias = Math.sin(y * 0.08) * 0.25 * intensity
      else if (pattern === 'diagonal')   bias = Math.sin((x + y) * 0.04) * 0.20 * intensity

      const effectiveIntensity = Math.min(1, intensity + bias)
      const noise = Math.random() * 255
      const alpha = Math.random() < effectiveIntensity ? Math.floor(noise * effectiveIntensity * 1.5) : 0
      data[i]     = 200
      data[i + 1] = 200
      data[i + 2] = 200
      data[i + 3] = alpha
    }

    ctx.putImageData(imageData, 0, 0)
  }, [frame, intensity, pattern])  // re-draw every frame

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
  grade             = 'cool_blue',
  grainIntensity    = 0.06,
  grainPattern      = 'random',
  vignetteIntensity = 0.45,
}) {
  const wrapperFilter = grade === 'desaturated' ? 'saturate(0.55)' : 'none'

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', filter: wrapperFilter }}>
      {/* Animated grain — skip entirely when intensity is 0 */}
      {grainIntensity > 0 && <Grain intensity={grainIntensity} pattern={grainPattern} />}

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
