import { useState } from 'react';

export const Tooltip = ({ content, children, position = 'top' }) => {
  const [visible, setVisible] = useState(false);
  const POS = {
    top:    { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 8 },
    bottom: { top: '100%',    left: '50%', transform: 'translateX(-50%)', marginTop: 8 },
    left:   { right: '100%', top: '50%',  transform: 'translateY(-50%)', marginRight: 8 },
    right:  { left: '100%',  top: '50%',  transform: 'translateY(-50%)', marginLeft: 8 }
  };
  const ARROW = {
    top:    { bottom: -5, left: '50%', transform: 'translateX(-50%)', borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid rgba(255,255,255,0.12)' },
    bottom: { top: -5,    left: '50%', transform: 'translateX(-50%)', borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '5px solid rgba(255,255,255,0.12)' },
    right:  { left: -5,  top: '50%',  transform: 'translateY(-50%)', borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderRight: '5px solid rgba(255,255,255,0.12)' },
    left:   { right: -5, top: '50%',  transform: 'translateY(-50%)', borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '5px solid rgba(255,255,255,0.12)' }
  };
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && content && (
        <div style={{ position: 'absolute', ...POS[position], zIndex: 1000, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '10px 12px', width: 220, boxShadow: '0 8px 24px rgba(0,0,0,0.6)', pointerEvents: 'none' }}>
          {content}
          <div style={{ position: 'absolute', width: 0, height: 0, ...ARROW[position] }} />
        </div>
      )}
    </div>
  );
};

export const InfoTip = ({ content, position = 'top' }) => (
  <Tooltip content={content} position={position}>
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.35)', fontSize: 9, fontWeight: 700, cursor: 'help', flexShrink: 0, marginLeft: 4 }}>?</span>
  </Tooltip>
);
