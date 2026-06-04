import { AbsoluteFill, useVideoConfig } from 'remotion'

const TYPE_COLOR = {
  image:          '#3b82f6',
  motion_graphic: '#14b8a6',
  real_footage:   '#f59e0b',
}

// Shown when a scene has no resolved asset yet.
export default function PlaceholderScene({ scene }) {
  const { width, height } = useVideoConfig()
  const num   = scene?.scene_id   || '???'
  const type  = scene?.shot_type  || 'unknown'
  const color = TYPE_COLOR[type]  || '#555'

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
      {/* Scene number */}
      <div style={{
        fontSize: 120,
        fontWeight: 700,
        color: 'rgba(255,255,255,0.06)',
        lineHeight: 1,
        letterSpacing: -6,
      }}>
        {num}
      </div>

      {/* Script excerpt */}
      {scene?.script_excerpt && (
        <div style={{
          color: 'rgba(255,255,255,0.28)',
          fontSize: 18,
          maxWidth: 600,
          textAlign: 'center',
          lineHeight: 1.6,
          padding: '0 40px',
        }}>
          {scene.script_excerpt}
        </div>
      )}

      {/* Shot type badge */}
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
        {type.replace(/_/g, ' ')}
      </div>
    </AbsoluteFill>
  )
}
