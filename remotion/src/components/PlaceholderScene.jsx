import { AbsoluteFill } from 'remotion'

const TYPE_COLOR = {
  image:          '#3b82f6',
  motion_graphic: '#14b8a6',
  real_footage:   '#f59e0b',
}

const TYPE_LABEL = {
  image:          'Image not generated yet',
  motion_graphic: 'Motion graphic',
  real_footage:   'No clip selected',
}

// Two usage modes:
//   <PlaceholderScene scene={scene} />           — scene placeholder (image/footage/motion)
//   <PlaceholderScene label="X" sublabel="Y" />  — generic error/missing state
export default function PlaceholderScene({ scene, label, sublabel }) {
  const isGeneric = !!label

  const type        = scene?.shot_type || 'image'
  const color       = TYPE_COLOR[type] || '#888'
  const statusLabel = isGeneric ? label : (TYPE_LABEL[type] || type)
  const excerpt     = !isGeneric ? (scene?.script_excerpt || '') : ''
  const sceneNum    = !isGeneric ? (scene?.scene_id || '') : ''

  return (
    <AbsoluteFill style={{
      background: '#111',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
    }}>
      {/* Coloured indicator ring */}
      <div style={{
        width: 56,
        height: 56,
        borderRadius: '50%',
        border: `2px solid ${color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.7,
      }}>
        {sceneNum && (
          <span style={{ color, fontSize: 16, fontWeight: 600 }}>{sceneNum}</span>
        )}
      </div>

      {/* Status label */}
      <div style={{
        color: 'rgba(255,255,255,0.65)',
        fontSize: 18,
        fontWeight: 500,
        textAlign: 'center',
      }}>
        {statusLabel}
      </div>

      {/* Script excerpt */}
      {excerpt && (
        <div style={{
          color: 'rgba(255,255,255,0.35)',
          fontSize: 14,
          maxWidth: 560,
          textAlign: 'center',
          lineHeight: 1.6,
          padding: '0 40px',
        }}>
          {excerpt}
        </div>
      )}

      {/* Sublabel (generic mode) */}
      {isGeneric && sublabel && (
        <div style={{
          color: 'rgba(255,255,255,0.30)',
          fontSize: 12,
          fontFamily: 'monospace',
          textAlign: 'center',
        }}>
          {sublabel}
        </div>
      )}

      {/* Shot type pill */}
      {!isGeneric && (
        <div style={{
          position: 'absolute',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color,
          border: `1px solid ${color}66`,
          background: `${color}18`,
          borderRadius: 20,
          padding: '4px 14px',
          whiteSpace: 'nowrap',
        }}>
          {type.replace(/_/g, ' ')}
        </div>
      )}
    </AbsoluteFill>
  )
}
