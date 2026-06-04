import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion'

// Simple SVG world map with a highlighted region shown as a pulsing dot + label.
// Props: region (string), lat (number -90..90), lng (number -180..180), label (string)
// For a real project this would use a GeoJSON renderer; this version uses a
// stylised world outline + positioned marker as a clean documentary lower-third style.

const WORLD_VIEWBOX = '0 0 1000 500'

// Simplified world silhouette paths (rough approximations)
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

// Convert lat/lng to SVG x/y in our 1000x500 viewbox
function latLngToXY(lat, lng) {
  const x = ((lng + 180) / 360) * 1000
  const y = ((90 - lat) / 180) * 500
  return { x, y }
}

export default function MapHighlight({ region = 'New York', lat = 40.7, lng = -74.0, label = '' }) {
  const frame = useCurrentFrame()

  const { x, y } = latLngToXY(lat, lng)

  // Map fade in
  const mapOpacity = interpolate(frame, [0, 20], [0, 0.4], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  // Dot pulse
  const pulseScale = 1 + 0.4 * Math.sin(frame * 0.15)
  const dotOpacity = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  // Label fade
  const labelOpacity = interpolate(frame, [25, 45], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })
  const labelY = interpolate(frame, [25, 45], [6, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  // Region text at top
  const regionOpacity = interpolate(frame, [5, 22], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{
      background: '#0a0a0a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
    }}>
      {/* Region label top */}
      <div style={{
        position: 'absolute',
        top: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: 18,
        fontWeight: 400,
        color: 'rgba(255,255,255,0.30)',
        letterSpacing: 5,
        textTransform: 'uppercase',
        opacity: regionOpacity,
        whiteSpace: 'nowrap',
      }}>
        {region}
      </div>

      {/* SVG map */}
      <svg
        viewBox={WORLD_VIEWBOX}
        style={{
          width: '80%',
          height: 'auto',
          opacity: mapOpacity,
        }}
      >
        <path
          d={LAND_PATH}
          fill="rgba(255,255,255,0.18)"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />

        {/* Highlight ring */}
        <circle
          cx={x} cy={y}
          r={18 * pulseScale}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="1"
          opacity={dotOpacity}
        />

        {/* Marker dot */}
        <circle
          cx={x} cy={y}
          r={6}
          fill="rgba(255,255,255,0.85)"
          opacity={dotOpacity}
        />
      </svg>

      {/* Floating label near dot */}
      {label && (
        <div style={{
          position: 'absolute',
          // Rough SVG-to-screen mapping for 80% width, centered
          left: `calc(10% + ${(x / 1000) * 80}%)`,
          top:  `calc(50% - ${((500 - y) / 500) * 40}% + 24px)`,
          transform: `translate(-50%, ${labelY}px)`,
          fontSize: 13,
          fontWeight: 500,
          color: 'rgba(255,255,255,0.55)',
          letterSpacing: 2,
          textTransform: 'uppercase',
          opacity: labelOpacity,
          whiteSpace: 'nowrap',
          background: 'rgba(0,0,0,0.6)',
          padding: '3px 8px',
          borderRadius: 3,
        }}>
          {label}
        </div>
      )}
    </AbsoluteFill>
  )
}
