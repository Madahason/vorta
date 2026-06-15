import { useState } from 'react';
import { MOTION_TIPS, INTENSITY_TIPS } from '../../config/effectTips';
import { InfoTip, Tooltip } from './Tooltip';

export const MotionSelector = ({ motion = { type: 'push_in', intensity: 'subtle' }, mood, onChange }) => {
  const [hovered, setHovered] = useState(null);
  const activeTip = MOTION_TIPS[hovered || motion.type];
  const isMoodMatch = (type) => MOTION_TIPS[type]?.moodMatch?.includes(mood);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Camera Motion</label>
        <InfoTip position="right" content={
          <div>
            <div style={{ color: 'white', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Camera Motion</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, lineHeight: 1.5 }}>Green options are recommended for this scene's mood.</div>
          </div>
        } />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 8 }}>
        {Object.entries(MOTION_TIPS).map(([key, tip]) => {
          const isActive = motion.type === key;
          const moodMatch = isMoodMatch(key);
          return (
            <button
              key={key}
              onClick={() => onChange({ ...motion, type: key })}
              onMouseEnter={() => setHovered(key)}
              onMouseLeave={() => setHovered(null)}
              style={{
                padding: '5px 4px', borderRadius: 5, cursor: 'pointer', fontSize: 10, textAlign: 'center', lineHeight: 1.2, transition: 'all 0.15s',
                border: `1px solid ${isActive ? '#3b82f6' : moodMatch ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.08)'}`,
                background: isActive ? 'rgba(59,130,246,0.15)' : moodMatch ? 'rgba(74,222,128,0.04)' : 'rgba(255,255,255,0.02)',
                color: isActive ? '#60a5fa' : moodMatch ? '#4ade80' : 'rgba(255,255,255,0.4)'
              }}
            >
              {tip.label}
              {moodMatch && !isActive && <div style={{ fontSize: 7, color: '#4ade80', marginTop: 1 }}>✓ mood match</div>}
            </button>
          );
        })}
      </div>

      {activeTip && (
        <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, marginBottom: 8 }}>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 1.4, marginBottom: 4 }}>{activeTip.description}</div>
          <div style={{ color: '#4ade80', fontSize: 10 }}>✓ {activeTip.bestFor}</div>
          {activeTip.proTip && (
            <div style={{ marginTop: 6, padding: '5px 8px', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 4, color: '#a78bfa', fontSize: 10, lineHeight: 1.4 }}>
              💡 {activeTip.proTip}
            </div>
          )}
        </div>
      )}

      <div>
        <label style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, display: 'block', marginBottom: 4 }}>Intensity</label>
        <div style={{ display: 'flex', gap: 4 }}>
          {INTENSITY_TIPS.map(opt => (
            <Tooltip key={opt.value} position="top" content={<div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{opt.tip}</div>}>
              <button
                onClick={() => onChange({ ...motion, intensity: opt.value })}
                style={{
                  flex: 1, padding: '4px 6px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
                  border: `1px solid ${motion.intensity === opt.value ? '#3b82f6' : 'rgba(255,255,255,0.08)'}`,
                  background: motion.intensity === opt.value ? 'rgba(59,130,246,0.15)' : 'transparent',
                  color: motion.intensity === opt.value ? '#60a5fa' : 'rgba(255,255,255,0.35)'
                }}
              >
                {opt.label}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MotionSelector;
