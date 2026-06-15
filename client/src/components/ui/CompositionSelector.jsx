import { COMPOSITION_TIPS } from '../../config/effectTips'
import { InfoTip } from './Tooltip'

const COMPOSITIONS = Object.keys(COMPOSITION_TIPS)

export default function CompositionSelector({ value, onChange }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Composition</span>
        <InfoTip content="Shot framing affects emotional distance and power dynamics. Choose based on dramatic purpose." position="right" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
        {COMPOSITIONS.map(c => {
          const t = COMPOSITION_TIPS[c]
          const active = c === value
          return (
            <button
              key={c}
              onClick={() => onChange(c)}
              title={`${t.description}\n\nBest for: ${t.bestFor}`}
              style={{
                padding: '5px 4px',
                fontSize: 10,
                borderRadius: 5,
                border: `1px solid ${active ? '#8b5cf6' : 'rgba(255,255,255,0.08)'}`,
                background: active ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.02)',
                color: active ? '#c4b5fd' : 'rgba(255,255,255,0.4)',
                cursor: 'pointer',
                transition: 'all 0.12s',
                fontWeight: active ? 600 : 400,
                textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}
            >
              <span style={{ fontSize: 13 }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
