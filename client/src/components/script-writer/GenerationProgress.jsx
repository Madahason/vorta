import { Check, Loader2, Circle } from 'lucide-react'

const PASSES = [
  { id: 'research',      label: 'Research' },
  { id: 'angles',        label: 'Angles' },
  { id: 'structure',     label: 'Structure' },
  { id: 'script',        label: 'Script' },
  { id: 'retention',     label: 'Retention' },
  { id: 'humanization',  label: 'Final' },
]

function getPassStatus(passId, passLog, phase) {
  const entry = passLog.find(e => e.pass === passId)
  if (entry?.status === 'complete') return 'complete'
  if (entry?.status === 'running') return 'running'
  return 'pending'
}

function getCurrentMessage(passLog) {
  const running = passLog.filter(e => e.status === 'running')
  return running.length > 0 ? running[running.length - 1].message : ''
}

export default function GenerationProgress({ passLog, phase, angles, onChooseAngle }) {
  const currentMsg = getCurrentMessage(passLog)
  const isChoosing = phase === 'choosing_angle'

  return (
    <div className="vorta-sw-progress">
      {/* Pipeline steps */}
      <div className="vorta-sw-pass-pipeline">
        {PASSES.map((pass, i) => {
          const status = getPassStatus(pass.id, passLog, phase)
          return (
            <div key={pass.id} className="vorta-sw-pass-step-wrapper">
              <div className={`vorta-sw-pass-step ${status}`}>
                {status === 'complete' && <Check size={12} />}
                {status === 'running' && <Loader2 size={12} className="animate-spin" />}
                {status === 'pending' && <Circle size={12} />}
              </div>
              <span className={`vorta-sw-pass-label ${status}`}>{pass.label}</span>
              {i < PASSES.length - 1 && <div className={`vorta-sw-pass-connector ${status === 'complete' ? 'done' : ''}`} />}
            </div>
          )
        })}
      </div>

      {/* Current status message */}
      {currentMsg && !isChoosing && (
        <p className="vorta-sw-status-msg">{currentMsg}</p>
      )}

      {/* Angle selection */}
      {isChoosing && angles?.angles?.length > 0 && (
        <div className="vorta-sw-angle-section">
          <h3 className="text-sm font-medium text-white mb-3">Choose your story angle</h3>
          <div className="vorta-sw-angle-cards">
            {angles.angles.map(angle => (
              <button key={angle.id} className="vorta-sw-angle-card" onClick={() => onChooseAngle(angle)}>
                <h4 className="vorta-sw-angle-title">{angle.title}</h4>
                <p className="vorta-sw-angle-hook">{angle.hook}</p>
                <p className="vorta-sw-angle-desc">{angle.description}</p>
                <span className="vorta-sw-angle-journey">{angle.emotional_journey}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
