import { useCurrentFrame, useVideoConfig } from 'remotion'
import { useEffect, useRef } from 'react'

// Full-size overlay: animated grain + vignette + color grade tint.
// Sits on top of every image scene via AbsoluteFill with pointerEvents: none.
export default function FilmLook({
  grade = 'cool_blue',
  grainIntensity = 0.12,
  vignetteIntensity = 0.45,
}) {
  const frame = useCurrentFrame()
  const canvasRef = useRef(null)

  // Fixed grain texture size — scaled up via CSS for performance
  const GRAIN_W = 512
  const GRAIN_H = 512

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const imageData = ctx.createImageData(GRAIN_W, GRAIN_H)
    const data = imageData.data
    // Frame-based seed so grain animates each frame like real film
    const seed = (frame * 2654435761) >>> 0

    for (let i = 0; i < data.length; i += 4) {
      const p = (i / 4 + seed) & 0xffffffff
      // Fast integer hash
      const h = (Math.imul(p ^ (p >>> 16), 0x45d9f3b) >>> 0) % 256
      const bright = h > 128 ? 255 : 0
      data[i]     = bright
      data[i + 1] = bright
      data[i + 2] = bright
      data[i + 3] = Math.floor(h * grainIntensity)
    }
    ctx.putImageData(imageData, 0, 0)
  })  // runs every render (every frame)

  const gradeColor = {
    cool_blue:  'rgba(20, 40, 80, 0.12)',
    warm_amber: 'rgba(100, 60, 10, 0.10)',
  }

  // desaturated grade is applied as a CSS filter on the outer wrapper
  const wrapperFilter = grade === 'desaturated' ? 'saturate(0.55)' : 'none'

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', filter: wrapperFilter }}>
      {/* Animated grain */}
      <canvas
        ref={canvasRef}
        width={GRAIN_W}
        height={GRAIN_H}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />

      {/* Vignette */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,0,${vignetteIntensity}) 100%)`,
      }} />

      {/* Color grade tint — multiply blend for cool_blue / warm_amber */}
      {(grade === 'cool_blue' || grade === 'warm_amber') && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: gradeColor[grade],
          mixBlendMode: 'multiply',
        }} />
      )}
    </div>
  )
}
