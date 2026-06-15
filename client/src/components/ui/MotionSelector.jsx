import { useState } from 'react'
import { MOTION_TIPS, INTENSITY_TIPS } from '../../config/effectTips'
import { InfoTip } from './Tooltip'

const MOTIONS = Object.keys(MOTION_TIPS)

export default function MotionSelector({ value, intensity, mood, onChange, onIntensityChange }) {
  const [hovered, setHovered] = useState(null)

  return (
    <div style={{ marginTop: 8 }}>
      {/* Motion type */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Motion</span>
        <InfoTip content="Ken Burns effect applied to the image. Mood-matched options are highlighted." position="right" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
        {MOTIONS.map(m => {
          const t = MOTION_TIPS[m]
          const active    = m === value
          const moodMatch = mood && t.moodMatch?.includes(mood)
          const isHovered = m === hovered

          return (
            <button
              key={m}
              onClick={() => onChange(m)}
              onMouseEnter={() => setHovered(m)}
              onMouseLeave={() => setHovered(null)}
              title={t.description}
              style={{
                padding: '5px 6px',
                fontSize: 10,
                borderRadius: 5,
                border: `1px solid ${active ? '#22c55e' : moodMatch ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.08)'}`,
                background: active
                  ? 'rgba(34,197,94,0.12)'
                  : isHovered ? 'rgba(255,255,255,0.05)'
                  : moodMatch ? 'rgba(34,197,94,0.04)'
                  : 'rgba(255,255,255,0.02)',
                color: active ? '#4ade80' : moodMatch ? 'rgba(74,222,128,0.65)' : 'rgba(255,255,255,0.4)',
                cursor: 'pointer',
                transition: 'all 0.12s',
                fontWeight: active ? 600 : 400,
                textAlign: 'center',
              }}
            >
              {t.label}
              {moodMatch && !active && <span style={{ display: 'block', fontSize: 8, color: 'rgba(74,222,128,0.45)', marginTop: 1 }}>mood match</span>}
            </button>
          )
        })}
      </div>

      {/* proTip for static */}
      {value === 'static' && MOTION_TIPS.static.proTip && (
        <div style={{
          marginTop: 6, padding: '6px 8px',
          background: 'rgba(139,92,246,0.08)',
          border: '1px solid rgba(139,92,246,0.2)',
          borderRadius: 5, fontSize: 10,
          color: 'rgba(167,139,250,0.8)',
        }}>
          💡 {MOTION_TIPS.static.proTip}
        </div>
      )}

      {/* Intensity row */}
      {value !== 'static' && onIntensityChange && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Intensity</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {INTENSITY_TIPS.map(({ value: v, label, tip }) => {
              const active = intensity === v
              return (
                <button
                  key={v}
                  onClick={() => onIntensityChange(v)}
                  title={tip}
                  style={{
                    flex: 1, padding: '4px 6px', fontSize: 10, borderRadius: 4,
                    border: `1px solid ${active ? '#3b82f6' : 'rgba(255,255,255,0.08)'}`,
                    background: active ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.02)',
                    color: active ? '#93c5fd' : 'rgba(255,255,255,0.35)',
                    cursor: 'pointer', transition: 'all 0.12s',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
