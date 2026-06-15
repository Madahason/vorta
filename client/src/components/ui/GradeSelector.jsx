import { useState } from 'react'
import { GRADE_TIPS } from '../../config/effectTips'
import { InfoTip } from './Tooltip'

const GRADES = Object.keys(GRADE_TIPS)

export default function GradeSelector({ value, onChange }) {
  const [hovered, setHovered] = useState(null)
  const tip = GRADE_TIPS[hovered || value]

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Grade</span>
        <InfoTip content="Color grade shapes the emotional tone of the scene. Different grades work for different narrative moods." position="right" />
      </div>

      {/* Button row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {GRADES.map(g => {
          const t = GRADE_TIPS[g]
          const active = g === value
          const isHovered = g === hovered
          return (
            <button
              key={g}
              onClick={() => onChange(g)}
              onMouseEnter={() => setHovered(g)}
              onMouseLeave={() => setHovered(null)}
              style={{
                padding: '3px 9px',
                fontSize: 10,
                borderRadius: 4,
                border: `1px solid ${active || isHovered ? t.tagColor : 'rgba(255,255,255,0.1)'}`,
                background: active
                  ? `${t.tagColor}22`
                  : isHovered
                    ? `${t.tagColor}11`
                    : 'rgba(255,255,255,0.03)',
                color: active ? t.tagColor : isHovered ? t.tagColor : 'rgba(255,255,255,0.45)',
                cursor: 'pointer',
                transition: 'all 0.12s',
                fontWeight: active ? 600 : 400,
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Live tip card */}
      {tip && (
        <div style={{
          marginTop: 7,
          padding: '8px 10px',
          background: 'rgba(255,255,255,0.025)',
          border: `1px solid ${tip.tagColor}33`,
          borderRadius: 6,
          animation: 'slideIn 0.15s ease-out',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{
              fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
              color: tip.tagColor, padding: '1px 5px', borderRadius: 3,
              background: `${tip.tagColor}18`, border: `1px solid ${tip.tagColor}30`,
            }}>
              {tip.tag}
            </span>
          </div>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.4, margin: 0 }}>{tip.description}</p>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 3, margin: '3px 0 0' }}>
            Best for: {tip.bestFor}
          </p>
        </div>
      )}
    </div>
  )
}
