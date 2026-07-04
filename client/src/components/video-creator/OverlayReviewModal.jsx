export function OverlayReviewModal({
  scenes,
  onAcceptOverlay,
  onRejectOverlay,
  onAcceptScene,
  onRejectScene,
  onAcceptAll,
  onClose,
}) {
  const scenesWithSuggestions = scenes.filter(s =>
    s.overlays?.some(o => o.status === 'suggested')
  )

  const remainingSuggestions = scenes.flatMap(s =>
    s.overlays?.filter(o => o.status === 'suggested') || []
  ).length

  const TYPE_COLOR = {
    lower_third:      '#93c5fd',
    date_stamp:       '#6ee7b7',
    kinetic_text:     '#fde68a',
    stat_callout:     '#f9a8d4',
    chapter_title:    '#c4b5fd',
    background_overlay: '#94a3b8',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.94)',
      zIndex: 300,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ color: 'white', fontSize: 16, fontWeight: 600 }}>
            Overlay Suggestions Review
          </div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }}>
            {remainingSuggestions} suggestion{remainingSuggestions !== 1 ? 's' : ''} remaining across {scenesWithSuggestions.length} scene{scenesWithSuggestions.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onAcceptAll}
            style={{ padding: '8px 16px', background: '#3b82f6', border: 'none', borderRadius: 6, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Accept all remaining
          </button>
          <button
            onClick={onClose}
            style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'white', fontSize: 13, cursor: 'pointer' }}
          >
            Done
          </button>
        </div>
      </div>

      {/* Scene list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {scenesWithSuggestions.map(scene => (
          <div key={scene.scene_id} style={{
            marginBottom: 16,
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            overflow: 'hidden',
          }}>
            {/* Scene header */}
            <div style={{
              padding: '12px 16px',
              background: 'rgba(255,255,255,0.03)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Scene {scene.scene_id}</span>
                <span style={{ color: 'white', fontSize: 13, marginLeft: 12 }}>
                  {(scene.script_excerpt || '').slice(0, 80)}{scene.script_excerpt?.length > 80 ? '…' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => onRejectScene(scene.scene_id)}
                  style={{ padding: '4px 10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4, color: '#f87171', fontSize: 11, cursor: 'pointer' }}
                >
                  Reject all for scene
                </button>
                <button
                  onClick={() => onAcceptScene(scene.scene_id)}
                  style={{ padding: '4px 10px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 4, color: '#4ade80', fontSize: 11, cursor: 'pointer' }}
                >
                  Accept all for scene
                </button>
              </div>
            </div>

            {/* Overlay suggestions for this scene */}
            {scene.overlays?.filter(o => o.status === 'suggested').map(overlay => (
              <div key={overlay.id} style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}>
                {/* Type badge */}
                <div style={{
                  padding: '3px 8px',
                  background: 'rgba(59,130,246,0.12)',
                  border: `1px solid ${(TYPE_COLOR[overlay.type] || '#93c5fd')}40`,
                  borderRadius: 4,
                  color: TYPE_COLOR[overlay.type] || '#93c5fd',
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>
                  {overlay.type.replace(/_/g, ' ')}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'white', fontSize: 13, fontWeight: 500 }}>
                    {overlay.text?.line1 || overlay.line1 || overlay.text}
                    {(overlay.text?.line2 || overlay.line2) && (
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 400, marginLeft: 8 }}>
                        · {overlay.text?.line2 || overlay.line2}
                      </span>
                    )}
                  </div>
                  {overlay.reason && (
                    <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 3 }}>
                      {overlay.reason}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                    {overlay.confidence != null && (
                      <span style={{
                        fontSize: 10,
                        color: overlay.confidence >= 0.9 ? '#4ade80'
                          : overlay.confidence >= 0.7 ? '#fbbf24' : '#f87171',
                      }}>
                        {Math.round(overlay.confidence * 100)}% confidence
                      </span>
                    )}
                    {overlay.template && (
                      <>
                        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>·</span>
                        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>
                          Template: {overlay.template}
                        </span>
                      </>
                    )}
                    {overlay.timing?.appearAt != null && (
                      <>
                        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>·</span>
                        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>
                          Appears at {overlay.timing.appearAt}s
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => onRejectOverlay(scene.scene_id, overlay.id)}
                    style={{ padding: '5px 10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4, color: '#f87171', fontSize: 11, cursor: 'pointer' }}
                  >
                    ✕ Reject
                  </button>
                  <button
                    onClick={() => onAcceptOverlay(scene.scene_id, overlay.id)}
                    style={{ padding: '5px 10px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 4, color: '#4ade80', fontSize: 11, cursor: 'pointer' }}
                  >
                    ✓ Accept
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}

        {scenesWithSuggestions.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48, color: 'rgba(255,255,255,0.3)' }}>
            All suggestions reviewed
          </div>
        )}
      </div>
    </div>
  )
}
