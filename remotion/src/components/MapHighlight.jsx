import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion'

// Props: region (string), lat (number), lng (number), label (string)
// Backward compat: coordinates=[lat,lng] accepted instead of lat/lng
const WORLD_VIEWBOX = '0 0 1000 500'

const LAND_PATH = `
  M 80 120 L 120 100 L 160 110 L 180 140 L 160 170 L 120 160 Z
  M 150 110 L 200 90 L 240 100 L 260 130 L 240 150 L 200 140 Z
  M 220 100 L 320 80 L 380 100 L 400 130 L 380 160 L 320 150 L 260 140 Z
  M 370 90 L 460 70 L 520 90 L 540 130 L 520 160 L 460 150 L 390 130 Z
  M 480 80 L 560 60 L 620 80 L 650 120 L 630 160 L 560 150 L 490 130 Z
  M 600 70 L 700 60 L 760 80 L 780 120 L 760 160 L 700 150 L 610 130 Z
  M 700 80 L 800 70 L 860 90 L 880 120 L 860 155 L 800 145 L 710 130 Z
  M 820 75 L 900 65 L 940 85 L 950 115 L 930 140 L 880 145 L 830 125 Z
  M 80 170 L 130 165 L 160 185 L 150 220 L 110 230 L 80 210 Z
  M 140 170 L 230 160 L 280 180 L 290 220 L 260 250 L 200 255 L 150 240 L 130 210 Z
  M 250 185 L 320 175 L 360 200 L 365 240 L 340 270 L 290 265 L 255 240 Z
  M 320 180 L 420 165 L 470 190 L 480 240 L 450 275 L 390 280 L 330 255 L 315 215 Z
  M 440 175 L 530 168 L 580 190 L 590 240 L 565 270 L 510 270 L 455 245 L 435 205 Z
  M 520 175 L 610 162 L 660 185 L 670 230 L 650 265 L 600 268 L 535 245 L 515 205 Z
  M 630 168 L 720 155 L 770 178 L 780 225 L 760 260 L 710 262 L 645 240 L 625 200 Z
  M 730 158 L 820 148 L 870 172 L 880 215 L 860 248 L 810 250 L 745 228 L 725 190 Z
  M 840 145 L 930 138 L 960 158 L 965 200 L 945 230 L 900 235 L 848 215 L 833 178 Z
  M 130 275 L 210 268 L 250 290 L 255 340 L 220 370 L 170 370 L 125 345 Z
  M 200 280 L 280 272 L 320 295 L 325 345 L 290 375 L 245 376 L 205 350 L 193 310 Z
  M 270 290 L 350 280 L 390 305 L 390 355 L 355 385 L 305 384 L 274 358 L 262 318 Z
`

function latLngToXY(lat, lng) {
  const x = ((lng + 180) / 360) * 1000
  const y = ((90 - lat) / 180) * 500
  return { x, y }
}

export default function MapHighlight({ region = 'New York', lat, lng, coordinates, label = '' }) {
  const frame = useCurrentFrame()

  // Backward compat: accept coordinates=[lat,lng] or lat/lng props
  const resolvedLat = lat ?? (Array.isArray(coordinates) ? coordinates[0] : 40.7)
  const resolvedLng = lng ?? (Array.isArray(coordinates) ? coordinates[1] : -74.0)

  const { x, y } = latLngToXY(resolvedLat, resolvedLng)

  const mapOp = interpolate(frame, [0, 22], [0, 0.35], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  // Ripple pulse
  const pulseScale = 1 + 0.5 * Math.sin(frame * 0.12)
  const dotOp = interpolate(frame, [18, 32], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  const regionOp = interpolate(frame, [4, 20], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })
  const regionY = interpolate(frame, [4, 20], [-8, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  const labelOp = interpolate(frame, [28, 44], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })
  const labelY = interpolate(frame, [28, 44], [6, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{
      background: '#080808',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
    }}>
      {/* Region name — top left */}
      <div style={{
        position: 'absolute',
        top: 72,
        left: 100,
        fontSize: 13,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.28)',
        letterSpacing: 5,
        textTransform: 'uppercase',
        opacity: regionOp,
        transform: `translateY(${regionY}px)`,
        whiteSpace: 'nowrap',
      }}>
        {region}
      </div>

      {/* Thin separator */}
      <div style={{
        position: 'absolute',
        top: 100,
        left: 100,
        width: interpolate(frame, [10, 30], [0, 48], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        height: 1,
        background: 'rgba(255,255,255,0.18)',
      }} />

      {/* SVG map */}
      <svg viewBox={WORLD_VIEWBOX} style={{ width: '78%', height: 'auto', opacity: mapOp }}>
        <path
          d={LAND_PATH}
          fill="rgba(255,255,255,0.12)"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="0.8"
        />

        {/* Outer ripple */}
        <circle
          cx={x} cy={y}
          r={22 * pulseScale}
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="1"
          opacity={dotOp}
        />

        {/* Inner ring */}
        <circle
          cx={x} cy={y}
          r={10}
          fill="none"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="1"
          opacity={dotOp}
        />

        {/* Marker */}
        <circle
          cx={x} cy={y}
          r={4}
          fill="#ffffff"
          opacity={dotOp}
        />
      </svg>

      {/* Floating label */}
      {label && (
        <div style={{
          position: 'absolute',
          left: `calc(11% + ${(x / 1000) * 78}%)`,
          top: `calc(50% - ${((500 - y) / 500) * 38}% + 20px)`,
          transform: `translate(-50%, ${labelY}px)`,
          fontSize: 11,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.50)',
          letterSpacing: 3,
          textTransform: 'uppercase',
          opacity: labelOp,
          whiteSpace: 'nowrap',
          background: 'rgba(0,0,0,0.55)',
          padding: '3px 8px',
          borderRadius: 2,
        }}>
          {label}
        </div>
      )}
    </AbsoluteFill>
  )
}
