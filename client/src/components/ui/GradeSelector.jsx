import { useState } from 'react';
import { GRADE_TIPS } from '../../config/effectTips';
import { InfoTip } from './Tooltip';

export const GradeSelector = ({ value, onChange }) => {
  const [hovered, setHovered] = useState(null);
  const activeTip = GRADE_TIPS[hovered || value];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Color Grade
        </label>
        <InfoTip position="right" content={
          <div>
            <div style={{ color: 'white', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Color Grade</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, lineHeight: 1.5 }}>Hover each option to see when to use it.</div>
          </div>
        } />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {Object.entries(GRADE_TIPS).map(([key, tip]) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            onMouseEnter={() => setHovered(key)}
            onMouseLeave={() => setHovered(null)}
            style={{
              padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: value === key ? 600 : 400, transition: 'all 0.15s',
              border: `1px solid ${value === key ? tip.tagColor : 'rgba(255,255,255,0.1)'}`,
              background: value === key ? `${tip.tagColor}22` : 'rgba(255,255,255,0.03)',
              color: value === key ? tip.tagColor : 'rgba(255,255,255,0.4)'
            }}
          >
            {tip.label}
          </button>
        ))}
      </div>

      {activeTip && (
        <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${activeTip.tagColor}30`, borderLeft: `3px solid ${activeTip.tagColor}`, borderRadius: 6, transition: 'all 0.15s' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: `${activeTip.tagColor}22`, color: activeTip.tagColor }}>
              {activeTip.tag}
            </span>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 1.5, marginBottom: 5 }}>{activeTip.description}</div>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, lineHeight: 1.4 }}>
            <span style={{ color: '#4ade80' }}>✓ Best for:</span> {activeTip.bestFor}
          </div>
          {activeTip.avoid && (
            <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, marginTop: 3 }}>
              <span style={{ color: '#f87171' }}>✗ Avoid:</span> {activeTip.avoid}
            </div>
          )}
          {activeTip.example && (
            <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, marginTop: 3, fontStyle: 'italic' }}>{activeTip.example}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default GradeSelector;
