const STYLES = [
  { id: 'documentary_explainer', name: 'Documentary Explainer', desc: 'Hook → Hidden mechanism → Lesson' },
  { id: 'rise_and_fall', name: 'Rise & Fall', desc: 'Peak → Origin → Collapse → Aftermath' },
  { id: 'business_model', name: 'Business Model', desc: 'What they sell → How they really make money' },
  { id: 'hidden_system', name: 'Hidden System', desc: 'Everyday experience → Exposed mechanism' },
  { id: 'investigative', name: 'Investigative', desc: 'Suspicious claim → Evidence → Reveal' },
  { id: 'contrarian', name: 'Contrarian Argument', desc: 'Popular belief → Proof it\'s wrong' },
  { id: 'case_study', name: 'Case Study', desc: 'Problem → Strategy → Result → Lessons' },
  { id: 'founder_psychology', name: 'Founder Psychology', desc: 'Belief → Obsession → Breakthrough or downfall' }
]

export default function StyleSelector({ value, onChange }) {
  return (
    <div className="vorta-sw-style-grid">
      {STYLES.map(style => (
        <button
          key={style.id}
          onClick={() => onChange(style.id)}
          className={`vorta-sw-style-card ${value === style.id ? 'selected' : ''}`}
        >
          <span className="vorta-sw-style-name">{style.name}</span>
          <span className="vorta-sw-style-desc">{style.desc}</span>
        </button>
      ))}
    </div>
  )
}
