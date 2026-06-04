import { AbsoluteFill } from 'remotion'

const TYPE_COLOR = {
  image:          '#3b82f6',
  motion_graphic: '#14b8a6',
  real_footage:   '#f59e0b',
}

// Two usage modes:
//   <PlaceholderScene scene={scene} />           — scene card placeholder
//   <PlaceholderScene label="X" sublabel="Y" />  — generic error/missing state
export default function PlaceholderScene({ scene, label, sublabel }) {
  const isGeneric = !!label

  const num    = scene?.scene_id || ''
  const type   = scene?.shot_type || 'unknown'
  const color  = TYPE_COLOR[type] || '#555'
  const text   = isGeneric ? label : (scene?.script_excerpt || '')
  const badge  = isGeneric ? null : type.replace(/_/g, ' ')

  return (
    <AbsoluteFill style={{
      background: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
      fontFamily: "'Helvetica Neue', sans-serif",
    }}>
      {/* Scene number (scene mode only) */}
      {!isGeneric && num && (
        <div style={{
          fontSize: 120,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.06)',
          lineHeight: 1,
          letterSpacing: -6,
        }}>
          {num}
        </div>
      )}

      {/* Label / script excerpt */}
      {text && (
        <div style={{
          color: isGeneric ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.28)',
          fontSize: isGeneric ? 22 : 18,
          maxWidth: 600,
          textAlign: 'center',
          lineHeight: 1.6,
          padding: '0 40px',
        }}>
          {text}
        </div>
      )}

      {/* Sublabel (generic mode) */}
      {isGeneric && sublabel && (
        <div style={{
          color: 'rgba(255,255,255,0.18)',
          fontSize: 13,
          fontFamily: 'monospace',
          textAlign: 'center',
        }}>
          {sublabel}
        </div>
      )}

      {/* Shot type badge (scene mode only) */}
      {badge && (
        <div style={{
          position: 'absolute',
          bottom: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: color,
          border: `1px solid ${color}44`,
          background: `${color}11`,
          borderRadius: 20,
          padding: '5px 16px',
        }}>
          {badge}
        </div>
      )}
    </AbsoluteFill>
  )
}
