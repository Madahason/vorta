import { useRef, useEffect, useState, useCallback } from 'react'

export function WizardNav({ wizard, scenes = [], onPreview }) {
  const { steps, currentStep, isComplete, isAccessible, goTo } = wizard
  const [width, setWidth]       = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1024))
  const [canScrollL, setCanScrollL] = useState(false)
  const [canScrollR, setCanScrollR] = useState(false)
  const scrollRef = useRef(null)
  const activeRef = useRef(null)

  useEffect(() => {
    const handler = () => setWidth(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const updateArrows = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollL(el.scrollLeft > 4)
    setCanScrollR(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateArrows()
    el.addEventListener('scroll', updateArrows)
    const ro = new ResizeObserver(updateArrows)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', updateArrows); ro.disconnect() }
  }, [updateArrows])

  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [currentStep])

  const scroll = (dir) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * 180, behavior: 'smooth' })
  }

  const isCompact  = width < 520
  const hidDesc    = width < 800
  const hasScenes  = scenes.length > 0

  const arrowBtn = (dir, enabled) => (
    <button
      onClick={() => scroll(dir)}
      disabled={!enabled}
      style={{
        flexShrink:     0,
        width:          28,
        height:         '100%',
        minHeight:      44,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        background:     enabled ? 'rgba(255,255,255,0.06)' : 'transparent',
        border:         'none',
        borderRight:    dir === -1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
        borderLeft:     dir ===  1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
        cursor:         enabled ? 'pointer' : 'default',
        opacity:        enabled ? 1 : 0.2,
        transition:     'opacity 0.15s, background 0.15s',
        color:          'rgba(255,255,255,0.7)',
        fontSize:       14,
      }}
    >
      {dir === -1 ? '‹' : '›'}
    </button>
  )

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', alignItems: 'stretch' }}>
      {arrowBtn(-1, canScrollL)}

      <div
        ref={scrollRef}
        className="wizard-nav-scroll"
        style={{
          flex:                     1,
          minWidth:                 0,
          display:                  'flex',
          alignItems:               'center',
          padding:                  isCompact ? '10px 8px' : '12px 16px',
          overflowX:                'auto',
          overflowY:                'hidden',
          gap:                       4,
          scrollbarWidth:           'none',
          msOverflowStyle:          'none',
          WebkitOverflowScrolling:  'touch',
        }}
      >
        {steps.map((step, index) => {
          const isCurrent = step.id === currentStep
          const isDone    = isComplete(step.id)
          const isLocked  = !isAccessible(step.id)
          const isLast    = index === steps.length - 1

          return (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <button
                ref={isCurrent ? activeRef : null}
                onClick={() => !isLocked && goTo(step.id)}
                disabled={isLocked}
                title={step.label}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:           isCompact ? 0 : 8,
                  padding:      isCompact ? '5px 6px' : '7px 12px',
                  borderRadius:  8,
                  border:       isCurrent
                    ? '1px solid rgba(59,130,246,0.5)'
                    : isDone
                      ? '1px solid rgba(34,197,94,0.3)'
                      : '1px solid rgba(255,255,255,0.06)',
                  background:   isCurrent
                    ? 'rgba(59,130,246,0.12)'
                    : isDone
                      ? 'rgba(34,197,94,0.06)'
                      : 'transparent',
                  cursor:       isLocked ? 'not-allowed' : 'pointer',
                  opacity:      isLocked ? 0.35 : 1,
                  transition:   'all 0.15s',
                  whiteSpace:   'nowrap',
                }}
              >
                <div style={{
                  width:          isCompact ? 26 : 22,
                  height:         isCompact ? 26 : 22,
                  borderRadius:   '50%',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  fontSize:       isCompact ? 12 : 11,
                  fontWeight:     600,
                  background:     isCurrent ? '#3b82f6' : isDone ? '#22c55e' : 'rgba(255,255,255,0.08)',
                  color:          'white',
                  flexShrink:     0,
                }}>
                  {isDone ? '✓' : index + 1}
                </div>

                {!isCompact && (
                  <div style={{ textAlign: 'left' }}>
                    <div style={{
                      color:      isCurrent ? 'white' : isDone ? '#4ade80' : 'rgba(255,255,255,0.4)',
                      fontSize:   13,
                      fontWeight: isCurrent ? 600 : 400,
                      lineHeight: 1.2,
                    }}>
                      {step.label}
                    </div>
                    {!hidDesc && (
                      <div style={{
                        color:        'rgba(255,255,255,0.22)',
                        fontSize:     10,
                        maxWidth:     140,
                        overflow:     'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace:   'nowrap',
                      }}>
                        {step.description}
                      </div>
                    )}
                  </div>
                )}
              </button>

              {!isLast && (
                <div style={{
                  width:      isCompact ? 10 : 24,
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

      {arrowBtn(1, canScrollR)}

      {hasScenes && onPreview && (
        <button
          onClick={onPreview}
          style={{
            flexShrink:   0,
            display:      'flex',
            alignItems:   'center',
            gap:           6,
            padding:      '8px 14px',
            margin:       '8px 12px',
            borderRadius:  8,
            border:       '1px solid rgba(59,130,246,0.4)',
            background:   'rgba(59,130,246,0.1)',
            color:        '#60a5fa',
            cursor:       'pointer',
            fontSize:      13,
            fontWeight:    500,
            whiteSpace:   'nowrap',
            transition:   'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background   = 'rgba(59,130,246,0.2)'
            e.currentTarget.style.borderColor  = 'rgba(59,130,246,0.6)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background   = 'rgba(59,130,246,0.1)'
            e.currentTarget.style.borderColor  = 'rgba(59,130,246,0.4)'
          }}
        >
          <span style={{ fontSize: 13 }}>▶</span>
          Preview
        </button>
      )}
    </div>
  )
}
