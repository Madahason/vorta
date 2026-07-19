import { useState } from 'react'
import { RefreshCw, Copy, Check, AlertTriangle, ChevronDown, ChevronUp, History } from 'lucide-react'
import { Tooltip } from '../ui/Tooltip'
import {
  SCENE_TYPES, ASSET_METHODS, RETENTION_COLORS, COMPLEXITY_COLORS,
  humanizeRiskFlag, humanizeLabel, sceneTypeToShotType,
  pushFieldHistory,
} from '../../utils/sceneDirection'

const SERVER_URL = 'http://localhost:3001'

// ── Small shared bits ─────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div className="vorta-label" style={{ marginBottom: 8 }}>{children}</div>
  )
}

function Badge({ children, colors, style }) {
  const c = colors || { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.14)', text: 'rgba(255,255,255,0.6)' }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 999,
      fontSize: 10.5, fontWeight: 600, letterSpacing: '0.03em',
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      ...style,
    }}>
      {children}
    </span>
  )
}

function RegenButton({ onClick, busy, disabled, title }) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      title={disabled ? 'Unlock to regenerate' : (title || 'Regenerate')}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 20, height: 20, borderRadius: 5,
        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
        color: 'rgba(255,255,255,0.5)', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1, flexShrink: 0,
      }}
    >
      <RefreshCw size={11} style={busy ? { animation: 'spin 1s linear infinite' } : undefined} />
    </button>
  )
}

function FieldHistory({ scene, field, onRestore, locked }) {
  const [expanded, setExpanded] = useState(false)
  const entries = scene.field_history?.[field] || []
  if (!entries.length) return null
  return (
    <div style={{ marginTop: 6 }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: 10.5, padding: 0, fontFamily: 'inherit' }}
      >
        <History size={10} />
        Previous versions ({entries.length})
        {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>
      {expanded && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[...entries].reverse().map((entry, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '6px 8px', background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6,
            }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
                <div style={{ color: 'rgba(255,255,255,0.25)', marginBottom: 2 }}>
                  {new Date(entry.at).toLocaleString()}
                </div>
                <div style={{ wordBreak: 'break-word' }}>
                  {typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value)}
                </div>
              </div>
              {!locked && (
                <button
                  onClick={() => onRestore(field, entry.value)}
                  style={{ flexShrink: 0, fontSize: 10, color: '#93c5fd', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Restore
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main tab ───────────────────────────────────────────────────────────────

export function DirectionTab({ scene, onChange, locked, treatment, projectId, direction, prevScene, nextScene }) {
  const [regenerating, setRegenerating] = useState({}) // { [field]: true }
  const [fieldErrors,  setFieldErrors]  = useState({}) // { [field]: message }
  const [copiedQuery,  setCopiedQuery]  = useState(false)
  const [confirmSwap,  setConfirmSwap]  = useState(false)
  const [noteDraft,    setNoteDraft]    = useState(scene.director_note || '')

  const purpose  = scene.purpose || {}
  const strategy = scene.asset_strategy || {}
  const search   = scene.asset_search
  const alt      = scene.alternative_concept
  const risks    = scene.risk_flags || []
  const refs     = scene.continuity_refs || []
  const entities = treatment?.continuity_entities || []

  const applyPatch = (patch, historyFields) => {
    let historyPatch = {}
    if (historyFields) {
      let history = scene.field_history || {}
      historyFields.forEach(f => {
        history = { ...history, ...{ [f]: pushFieldHistory({ field_history: history }, f, scene[f])[f] } }
      })
      historyPatch = { field_history: history }
    }
    onChange({ ...patch, ...historyPatch })
  }

  const regenerateField = async (field, extraHistoryFields = []) => {
    if (locked || regenerating[field]) return
    setRegenerating(prev => ({ ...prev, [field]: true }))
    setFieldErrors(prev => ({ ...prev, [field]: null }))
    try {
      const res = await fetch(`${SERVER_URL}/api/director/scene/regenerate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          projectId, scene, field, direction,
          neighbors: { prev: prevScene?.script_excerpt || null, next: nextScene?.script_excerpt || null },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.error || `Regeneration failed (${res.status})`)
      const patchedFields = [...Object.keys(data.patch || {}), ...extraHistoryFields]
      applyPatch(data.patch, patchedFields)
    } catch (err) {
      setFieldErrors(prev => ({ ...prev, [field]: err.message }))
    } finally {
      setRegenerating(prev => ({ ...prev, [field]: false }))
    }
  }

  const restoreField = (field, value) => {
    if (locked) return
    const history = pushFieldHistory(scene, field, scene[field])
    onChange({ [field]: value, field_history: history })
  }

  const handleSceneTypeChange = (newType) => {
    if (locked) return
    const shot_type = sceneTypeToShotType(newType) || scene.shot_type
    onChange({ scene_type: newType, shot_type, real_footage_flag: shot_type === 'real_footage' })
  }

  const handleMethodChange = (method) => {
    if (locked) return
    onChange({ asset_strategy: { ...strategy, method } })
  }

  const copyQuery = () => {
    navigator.clipboard.writeText(search.query || '').catch(() => {})
    setCopiedQuery(true)
    setTimeout(() => setCopiedQuery(false), 1500)
  }

  const toggleAssetFound = () => {
    if (locked) return
    onChange({ asset_found: !scene.asset_found })
  }

  const handleSwapToAlternative = () => {
    if (!confirmSwap) { setConfirmSwap(true); return }
    setConfirmSwap(false)
    const history = pushFieldHistory(scene, 'asset_strategy', scene.asset_strategy)
    onChange({
      asset_strategy: alt ? { method: alt.method, rationale: alt.description || '' } : scene.asset_strategy,
      alternative_concept: strategy.method ? { method: strategy.method, description: strategy.rationale || '' } : null,
      field_history: history,
    })
    regenerateField('image_prompt')
  }

  const saveNote = () => {
    if (locked) return
    onChange({ director_note: noteDraft })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, opacity: locked ? 0.7 : 1 }}>

      {/* ── Purpose ── */}
      <div>
        <SectionLabel>Purpose</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {['narrative', 'informational', 'emotional'].map(k => (
            <div key={k} style={{ display: 'flex', gap: 8, fontSize: 11.5 }}>
              <span style={{ color: 'rgba(255,255,255,0.3)', width: 84, flexShrink: 0, textTransform: 'capitalize' }}>{k}</span>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>{purpose[k] || '—'}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
            <span style={{ color: 'rgba(255,255,255,0.3)', width: 84, flexShrink: 0 }}>Retention</span>
            {purpose.retention
              ? <Badge colors={RETENTION_COLORS[purpose.retention]}>{humanizeLabel(purpose.retention)}</Badge>
              : <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>}
            <RegenButton onClick={() => regenerateField('purpose')} busy={regenerating.purpose} disabled={locked} />
          </div>
        </div>
        {fieldErrors.purpose && <div className="vorta-direction-warning" style={{ marginTop: 6 }}>{fieldErrors.purpose}</div>}
        <FieldHistory scene={scene} field="purpose" onRestore={restoreField} locked={locked} />
      </div>

      {/* ── Classification ── */}
      <div>
        <SectionLabel>Classification</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Badge>Act {scene.act ?? '—'}</Badge>
          <select
            className="vorta-select"
            style={{ width: 'auto', fontSize: 11 }}
            value={scene.scene_type || ''}
            disabled={locked}
            onChange={e => handleSceneTypeChange(e.target.value)}
          >
            {!scene.scene_type && <option value="">— scene type —</option>}
            {SCENE_TYPES.map(t => <option key={t} value={t}>{humanizeLabel(t)}</option>)}
          </select>
          <RegenButton onClick={() => regenerateField('scene_type')} busy={regenerating.scene_type} disabled={locked} />
          {scene.complexity && <Badge colors={COMPLEXITY_COLORS[scene.complexity]}>{scene.complexity}</Badge>}
        </div>
        {fieldErrors.scene_type && <div className="vorta-direction-warning" style={{ marginTop: 6 }}>{fieldErrors.scene_type}</div>}
        <FieldHistory scene={scene} field="scene_type" onRestore={restoreField} locked={locked} />
      </div>

      {/* ── Asset Strategy ── */}
      <div>
        <SectionLabel>Asset Strategy</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <select
            className="vorta-select"
            style={{ width: 'auto', fontSize: 11 }}
            value={strategy.method || ''}
            disabled={locked}
            onChange={e => handleMethodChange(e.target.value)}
          >
            {!strategy.method && <option value="">— method —</option>}
            {ASSET_METHODS.map(m => <option key={m} value={m}>{humanizeLabel(m)}</option>)}
          </select>
          <RegenButton onClick={() => regenerateField('asset_strategy')} busy={regenerating.asset_strategy} disabled={locked} />
        </div>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11.5, lineHeight: 1.5, margin: 0 }}>
          {strategy.rationale || '—'}
        </p>
        {fieldErrors.asset_strategy && <div className="vorta-direction-warning" style={{ marginTop: 6 }}>{fieldErrors.asset_strategy}</div>}
        <FieldHistory scene={scene} field="asset_strategy" onRestore={restoreField} locked={locked} />
      </div>

      {/* ── Asset Search — only when populated ── */}
      {search && typeof search === 'object' && (
        <div>
          <SectionLabel>Asset Search</SectionLabel>
          <div className="vorta-direction-card" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[
              ['query', 'Query'], ['person', 'Person'], ['organisation', 'Organisation'],
              ['location', 'Location'], ['date_range', 'Date range'], ['event', 'Event'],
              ['source_category', 'Source category'], ['quality_note', 'Quality note'],
            ].filter(([k]) => search[k]).map(([k, label]) => (
              <div key={k} style={{ display: 'flex', gap: 8, fontSize: 11.5 }}>
                <span style={{ color: 'rgba(255,255,255,0.3)', width: 110, flexShrink: 0 }}>{label}</span>
                <span style={{ color: 'rgba(255,255,255,0.6)', flex: 1 }}>{search[k]}</span>
                {k === 'query' && (
                  <button onClick={copyQuery} title="Copy query" style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedQuery ? '#4ade80' : 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
                    {copiedQuery ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                )}
              </div>
            ))}
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={toggleAssetFound}
                disabled={locked}
                className={`vorta-btn vorta-btn-sm ${scene.asset_found ? 'vorta-btn-secondary' : 'vorta-btn-ghost'}`}
              >
                {scene.asset_found ? '✓ Asset found' : 'Mark asset as found'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Continuity ── */}
      {refs.length > 0 && (
        <div>
          <SectionLabel>Continuity</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {refs.map(refId => {
              const entity = entities.find(e => e.id === refId)
              if (!entity) return null
              return (
                <Tooltip key={refId} content={<div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>{entity.locked_descriptor}</div>}>
                  <span className="vorta-direction-tag" style={{ cursor: 'help' }}>{entity.name}</span>
                </Tooltip>
              )
            })}
          </div>
          {refs.filter(refId => !entities.find(e => e.id === refId)).map(refId => (
            <div key={refId} style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(252,211,77,0.75)', fontSize: 11 }}>
              <AlertTriangle size={11} />
              Entity "{refId}" no longer exists in the treatment
            </div>
          ))}
        </div>
      )}

      {/* ── Alternative Concept ── */}
      {alt && (
        <div>
          <SectionLabel>Alternative Concept</SectionLabel>
          <div className="vorta-direction-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Badge>{humanizeLabel(alt.method)}</Badge>
              <RegenButton onClick={() => regenerateField('alternative_concept')} busy={regenerating.alternative_concept} disabled={locked} />
            </div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11.5, lineHeight: 1.5, margin: 0 }}>{alt.description}</p>
            {confirmSwap ? (
              <div className="vorta-direction-confirm-strip" style={{ marginTop: 10 }}>
                <span style={{ flex: 1 }}>Swap asset strategy with this alternative and regenerate the prompt?</span>
                <button className="vorta-btn vorta-btn-danger vorta-btn-sm" onClick={handleSwapToAlternative}>Swap</button>
                <button className="vorta-btn vorta-btn-secondary vorta-btn-sm" onClick={() => setConfirmSwap(false)}>Cancel</button>
              </div>
            ) : (
              <button
                className="vorta-btn vorta-btn-secondary vorta-btn-sm"
                style={{ marginTop: 10 }}
                disabled={locked}
                onClick={handleSwapToAlternative}
              >
                Swap to alternative
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Risk Flags ── */}
      {risks.length > 0 && (
        <div>
          <SectionLabel>Risk Flags</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {risks.map(flag => (
              <span key={flag} style={{
                fontSize: 10.5, padding: '3px 9px', borderRadius: 999,
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.28)',
                color: 'rgba(252,165,165,0.9)',
              }}>
                {humanizeRiskFlag(flag)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Director Note ── */}
      <div>
        <SectionLabel>Director Note</SectionLabel>
        <textarea
          className="vorta-textarea"
          rows={2}
          placeholder="Private note — never sent to Claude"
          value={noteDraft}
          disabled={locked}
          onChange={e => setNoteDraft(e.target.value)}
          onBlur={saveNote}
        />
      </div>
    </div>
  )
}
