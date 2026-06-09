export function WizardNav({ wizard }) {
  const { steps, currentStep, isComplete, isAccessible, goTo } = wizard

  return (
    <div style={{
      display:     'flex',
      alignItems:  'center',
      padding:     '12px 24px',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      background:  'rgba(0,0,0,0.4)',
      overflowX:   'auto',
      flexShrink:  0,
    }}>
      {steps.map((step, index) => {
        const isCurrent = step.id === currentStep
        const isDone    = isComplete(step.id)
        const isLocked  = !isAccessible(step.id)
        const isLast    = index === steps.length - 1

        return (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <button
              onClick={() => !isLocked && goTo(step.id)}
              disabled={isLocked}
              style={{
                display:    'flex',
                alignItems: 'center',
                gap:         8,
                padding:    '7px 12px',
                borderRadius: 8,
                border:     isCurrent
                  ? '1px solid rgba(59,130,246,0.5)'
                  : isDone
                    ? '1px solid rgba(34,197,94,0.3)'
                    : '1px solid rgba(255,255,255,0.06)',
                background: isCurrent
                  ? 'rgba(59,130,246,0.12)'
                  : isDone
                    ? 'rgba(34,197,94,0.06)'
                    : 'transparent',
                cursor:     isLocked ? 'not-allowed' : 'pointer',
                opacity:    isLocked ? 0.35 : 1,
                transition: 'all 0.15s',
              }}
            >
              <div style={{
                width:         22,
                height:        22,
                borderRadius:  '50%',
                display:       'flex',
                alignItems:    'center',
                justifyContent: 'center',
                fontSize:      11,
                background:    isCurrent ? '#3b82f6' : isDone ? '#22c55e' : 'rgba(255,255,255,0.08)',
                color:         'white',
                flexShrink:    0,
                fontWeight:    600,
              }}>
                {isDone ? '✓' : index + 1}
              </div>

              <div style={{ textAlign: 'left' }}>
                <div style={{
                  color:      isCurrent ? 'white' : isDone ? '#4ade80' : 'rgba(255,255,255,0.4)',
                  fontSize:   13,
                  fontWeight: isCurrent ? 600 : 400,
                  lineHeight: 1.2,
                }}>
                  {step.label}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.22)', fontSize: 10 }}>
                  {step.description}
                </div>
              </div>
            </button>

            {!isLast && (
              <div style={{
                width:      28,
                height:     1,
                margin:     '0 2px',
                background: isDone ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.08)',
                flexShrink: 0,
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
