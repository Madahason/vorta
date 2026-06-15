import { useState } from 'react'

const ARROW = {
  top:    { bottom: -5, left: '50%', transform: 'translateX(-50%)', borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid rgba(30,30,40,0.97)' },
  bottom: { top: -5,   left: '50%', transform: 'translateX(-50%)', borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '5px solid rgba(30,30,40,0.97)' },
  left:   { right: -5, top: '50%',  transform: 'translateY(-50%)', borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '5px solid rgba(30,30,40,0.97)' },
  right:  { left: -5,  top: '50%',  transform: 'translateY(-50%)', borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderRight: '5px solid rgba(30,30,40,0.97)' },
}

const TOOLTIP_POS = {
  top:    { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' },
  bottom: { top: 'calc(100% + 8px)',    left: '50%', transform: 'translateX(-50%)' },
  left:   { right: 'calc(100% + 8px)', top: '50%',  transform: 'translateY(-50%)' },
  right:  { left: 'calc(100% + 8px)',  top: '50%',  transform: 'translateY(-50%)' },
}

export const Tooltip = ({ content, children, position = 'top' }) => {
  const [visible, setVisible] = useState(false)
  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div style={{
          position: 'absolute',
          ...TOOLTIP_POS[position],
          zIndex: 200,
          background: 'rgba(30,30,40,0.97)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          padding: '7px 10px',
          fontSize: 11,
          color: 'rgba(255,255,255,0.75)',
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap',
          maxWidth: 240,
          pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          {content}
          <div style={{ position: 'absolute', width: 0, height: 0, ...ARROW[position] }} />
        </div>
      )}
    </span>
  )
}

export const InfoTip = ({ content, position = 'top' }) => (
  <Tooltip content={content} position={position}>
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 14, height: 14, borderRadius: '50%',
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.15)',
      color: 'rgba(255,255,255,0.4)',
      fontSize: 9, fontWeight: 700,
      cursor: 'default', marginLeft: 4,
      flexShrink: 0,
    }}>?</span>
  </Tooltip>
)
