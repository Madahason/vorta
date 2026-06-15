import { useState } from 'react';
import { COMPOSITION_TIPS } from '../../config/effectTips';
import { InfoTip } from './Tooltip';

export const CompositionSelector = ({ value = 'medium', onChange }) => {
  const [hovered, setHovered] = useState(null);
  const activeTip = COMPOSITION_TIPS[hovered || value];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Composition</label>
        <InfoTip position="right" content={
          <div>
            <div style={{ color: 'white', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Composition</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, lineHeight: 1.5 }}>Controls the camera angle and framing of the generated image.</div>
          </div>
        } />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginBottom: 8 }}>
        {Object.entries(COMPOSITION_TIPS).map(([key, tip]) => {
          const isActive = value === key;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              onMouseEnter={() => setHovered(key)}
              onMouseLeave={() => setHovered(null)}
              style={{
                padding: '5px 4px', borderRadius: 5, textAlign: 'center', cursor: 'pointer', fontSize: 9, lineHeight: 1.3, transition: 'all 0.15s',
                border: `1px solid ${isActive ? '#8b5cf6' : 'rgba(255,255,255,0.08)'}`,
                background: isActive ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.02)',
                color: isActive ? '#a78bfa' : 'rgba(255,255,255,0.35)'
              }}
            >
              <div style={{ fontSize: 14, marginBottom: 2 }}>{tip.icon}</div>
              {tip.label}
            </button>
          );
        })}
      </div>

      {activeTip && (
        <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 1.4, marginBottom: 3 }}>{activeTip.description}</div>
          <div style={{ color: '#4ade80', fontSize: 10 }}>✓ {activeTip.bestFor}</div>
          {activeTip.avoid && <div style={{ color: '#f87171', fontSize: 10, marginTop: 2 }}>✗ {activeTip.avoid}</div>}
        </div>
      )}
    </div>
  );
};

export default CompositionSelector;
