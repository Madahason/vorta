import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, Trash2, Plus, RefreshCw } from 'lucide-react'

// Client copy of DEFAULT_STYLE_LOCK — keep in sync with server/config/styleDefaults.js.
// Used by the "Reset to default" button; resolveStyleLock on the server falls back to the
// same string when no usable visual_signature exists.
const DEFAULT_STYLE_LOCK = 'dark cinematic grade, shallow depth of field, documentary'

const BANNED_SIGNATURE_TERMS = ['8k', 'ultra-detailed', 'masterpiece', 'award-winning', 'trending']
const SIGNATURE_MAX_WORDS = 20

// Staged loading messages for the single long treatment call (~30-90s)
const LOADING_STAGES = [
  { at: 0,     text: 'Reading the full script…' },
  { at: 12000, text: 'Identifying acts and turning points…' },
  { at: 25000, text: 'Building the style bible…' },
  { at: 40000, text: 'Locking continuity entities…' },
]

const ENTITY_TYPE_COLORS = {
  person:       { bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.4)',  text: '#93c5fd' },
  location:     { bg: 'rgba(34,197,94,0.13)',   border: 'rgba(34,197,94,0.38)',  text: '#86efac' },
  organisation: { bg: 'rgba(168,85,247,0.14)',  border: 'rgba(168,85,247,0.4)',  text: '#d8b4fe' },
  object:       { bg: 'rgba(245,158,11,0.13)',  border: 'rgba(245,158,11,0.38)', text: '#fcd34d' },
}

const CLAIM_TYPE_COLORS = {
  statistic: '#93c5fd', date: '#86efac', financial: '#fcd34d', quote: '#d8b4fe', event: '#fda4af',
}

// Same merge semantics as the server's PATCH route: objects merge recursively,
// arrays and scalars replace wholesale.
function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }
function deepMerge(target, patch) {
  const out = { ...target }
  for (const [key, value] of Object.entries(patch)) {
    out[key] = (isPlainObject(value) && isPlainObject(out[key])) ? deepMerge(out[key], value) : value
  }
  return out
}

function signatureWarnings(sig) {
  const warnings = []
  const words = (sig || '').trim().split(/\s+/).filter(Boolean).length
  if (words > SIGNATURE_MAX_WORDS) {
    warnings.push(`Signature is ${words} words — keep it under ${SIGNATURE_MAX_WORDS} so prompts stay compact.`)
  }
  const lower = (sig || '').toLowerCase()
  const hit = BANNED_SIGNATURE_TERMS.filter(t => lower.includes(t))
  if (hit.length) {
    warnings.push(`Avoid generic quality terms: ${hit.join(', ')} — they degrade image prompts.`)
  }
  return warnings
}

// Collapsible panel shell
function Panel({ title, subtitle, open, onToggle, children }) {
  return (
    <div className="vorta-direction-panel">
      <button className="vorta-direction-panel-header" onClick={onToggle}>
        <span>
          {title}
          {subtitle && (
            <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.35)' }}>
              {subtitle}
            </span>
          )}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="vorta-direction-panel-body">{children}</div>}
    </div>
  )
}

function SectionTitle({ children, onRegenerate, busy, disabled }) {
  return (
    <div className="vorta-direction-section-title">
      <span>{children}</span>
      {onRegenerate && (
        <button
          className="vorta-btn vorta-btn-ghost vorta-btn-sm"
          onClick={onRegenerate}
          disabled={busy || disabled}
          title="Regenerate only this section — one scoped Claude call, other sections untouched"
        >
          <RefreshCw size={10} style={busy ? { animation: 'spin 1s linear infinite' } : undefined} />
          {busy ? 'Regenerating…' : 'Regenerate this section'}
        </button>
      )}
    </div>
  )
}

export function DirectionStep({
  scriptText,
  projectMetadata,
  projectId,
  ensureProjectId,
  direction,
  onDirectionChange,
  onAnalyze,      // DD-3: runs the treatment-aware scene analysis
  isAnalyzing,    // DD-3: loading state shared with the Script step's analyze
  analyzeError,   // DD-3: surfaced next to the footer when analysis fails
  wizard,
}) {
  const treatment = direction?.treatment || null

  const [isGenerating, setIsGenerating] = useState(false)
  const [loadingMsg, setLoadingMsg]     = useState(LOADING_STAGES[0].text)
  const [genError, setGenError]         = useState(null)

  // 'idle' | 'saving' | 'saved' | 'error'
  const [saveState, setSaveState] = useState('idle')
  const [saveError, setSaveError] = useState(null)
  const [savedFading, setSavedFading] = useState(false)

  const [openPanels, setOpenPanels] = useState([true, false, false])
  // 'full' | null — only the FULL regenerate needs confirmation (DD-3: per-section
  // regeneration is cheap and reversible, so sections fire immediately)
  const [confirmRegen, setConfirmRegen] = useState(null)
  // DD-3: which section is currently regenerating (null when none)
  const [regeneratingSection, setRegeneratingSection] = useState(null)
  const [sectionError, setSectionError] = useState(null)

  const pendingPatchRef = useRef({})
  const debounceRef     = useRef(null)
  const savedTimersRef  = useRef([])
  const flushRef        = useRef(null)

  const hasScript = typeof scriptText === 'string' && scriptText.trim().length > 0

  // ── Loading message rotation (plain timeouts — one long call, not a stream).
  // The 0s message is set in handleGenerate; this only schedules the later stages. ──
  useEffect(() => {
    if (!isGenerating) return
    const timers = LOADING_STAGES.slice(1).map(s =>
      setTimeout(() => setLoadingMsg(s.text), s.at)
    )
    return () => timers.forEach(clearTimeout)
  }, [isGenerating])

  // Flush any pending edits when the step unmounts (e.g. navigating away inside the
  // debounce window) — otherwise up to 800ms of typing would never reach the server.
  useEffect(() => () => {
    clearTimeout(debounceRef.current)
    savedTimersRef.current.forEach(clearTimeout)
    flushRef.current?.()
  }, [])

  // ── Autosave: debounce 800ms, accumulate one pending patch, single PATCH ──
  const flushPatch = useCallback(async () => {
    const patch = pendingPatchRef.current
    pendingPatchRef.current = {}
    if (!Object.keys(patch).length) return
    const pid = projectId
    if (!pid) return
    setSaveState('saving')
    try {
      const res = await fetch(`/api/director/${pid}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Save failed (${res.status})`)
      }
      setSaveError(null)
      setSaveState('saved')
      setSavedFading(false)
      savedTimersRef.current.forEach(clearTimeout)
      savedTimersRef.current = [
        setTimeout(() => setSavedFading(true), 2000),
        setTimeout(() => setSaveState('idle'), 2600),
      ]
    } catch (err) {
      // Local value is already applied optimistically — never discard the user's typing.
      // Re-queue the failed patch (under anything typed since) so the next edit retries it.
      pendingPatchRef.current = deepMerge(patch, pendingPatchRef.current)
      setSaveState('error')
      setSaveError(err.message)
    }
  }, [projectId])
  useEffect(() => { flushRef.current = flushPatch }, [flushPatch])

  const applyTreatmentPatch = useCallback((patch) => {
    // Optimistic local update + localStorage mirror (via onDirectionChange)
    onDirectionChange(prev => prev
      ? { ...prev, treatment: deepMerge(prev.treatment || {}, patch) }
      : prev
    )
    // Accumulate into the pending PATCH body and (re)start the debounce window
    pendingPatchRef.current = deepMerge(pendingPatchRef.current, patch)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(flushPatch, 800)
  }, [onDirectionChange, flushPatch])

  // ── Generate / regenerate treatment ──
  const handleGenerate = async () => {
    if (!hasScript) return
    const pid = projectId || ensureProjectId()
    setLoadingMsg(LOADING_STAGES[0].text)
    setIsGenerating(true)
    setGenError(null)
    setConfirmRegen(null)
    try {
      const res = await fetch('/api/director/treatment', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId: pid, scriptText, metadata: projectMetadata || {} }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.error || 'Treatment generation failed')

      // Re-GET so local state matches the authoritative stored direction.json
      const stored = await fetch(`/api/director/${pid}`).then(r => r.json()).catch(() => null)
      onDirectionChange(stored?.direction || { version: 1, updatedAt: new Date().toISOString(), treatment: data.treatment, audit: null })
      setOpenPanels([true, false, false])
    } catch (err) {
      setGenError(err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  // ── DD-3: per-section regeneration — one scoped Claude call, no confirm ──
  const handleSectionRegenerate = async (section) => {
    if (regeneratingSection || !projectId) return
    setRegeneratingSection(section)
    setSectionError(null)
    try {
      const res = await fetch(`/api/director/${projectId}/regenerate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ section, scriptText, metadata: projectMetadata || {} }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.error || 'Section regeneration failed')
      onDirectionChange(prev => prev
        ? { ...prev, treatment: data.treatment, updatedAt: data.updatedAt }
        : prev)
    } catch (err) {
      setSectionError(`Couldn't regenerate ${section.replace(/_/g, ' ')}: ${err.message}`)
    } finally {
      setRegeneratingSection(null)
    }
  }

  // ── Entity helpers (arrays replace wholesale on PATCH) ──
  const entities = treatment?.continuity_entities || []
  const updateEntity = (idx, field, value) => {
    const next = entities.map((e, i) => i === idx ? { ...e, [field]: value } : e)
    applyTreatmentPatch({ continuity_entities: next })
  }
  const deleteEntity = (idx) => {
    applyTreatmentPatch({ continuity_entities: entities.filter((_, i) => i !== idx) })
  }
  const addEntity = () => {
    applyTreatmentPatch({
      continuity_entities: [...entities, {
        id: `ent_${Date.now()}`,
        type: 'person',
        name: '',
        locked_descriptor: '',
        prohibited_variations: '',
      }],
    })
    setOpenPanels(p => [p[0], p[1], true])
  }

  const motifs = treatment?.recurring_motifs || []
  const updateMotif = (idx, field, value) => {
    applyTreatmentPatch({ recurring_motifs: motifs.map((m, i) => i === idx ? { ...m, [field]: value } : m) })
  }

  const togglePanel = (i) =>
    setOpenPanels(p => p.map((v, idx) => idx === i ? !v : v))

  const sig = treatment?.style_bible?.visual_signature ?? ''
  const sigWarnings = signatureWarnings(sig)

  // ─────────────────────────── State B — generating ───────────────────────────
  if (isGenerating) {
    return (
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: '#a78bfa', margin: '0 auto' }} />
        <h2 style={{ color: 'white', fontSize: 18, fontWeight: 600, marginTop: 20 }}>Generating Direction</h2>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 10, minHeight: 20 }}>
          {loadingMsg}
        </p>
        <p className="vorta-hint" style={{ marginTop: 16 }}>
          One full-script pass — this usually takes 30–90 seconds.
        </p>
      </div>
    )
  }

  // ─────────────────────────── State A — empty ────────────────────────────────
  if (!treatment) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 30, marginBottom: 14 }}>🧭</div>
        <h2 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: 0 }}>Documentary Direction</h2>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, lineHeight: 1.65, marginTop: 12 }}>
          The treatment defines the visual thesis, style signature, recurring motifs, and
          continuity rules that every scene inherits. Generating it once produces more
          consistent imagery across the whole video.
        </p>

        {genError && (
          <div style={{
            marginTop: 16, padding: '10px 16px', textAlign: 'left',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 8, color: '#f87171', fontSize: 13,
          }}>
            {genError}
          </div>
        )}

        <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <span title={hasScript ? undefined : 'Paste a script in the Script step first — the treatment is generated from the full script.'}>
            <button
              className="vorta-btn vorta-btn-primary"
              style={{ padding: '11px 26px', fontSize: 14 }}
              disabled={!hasScript}
              onClick={handleGenerate}
            >
              Generate Direction →
            </button>
          </span>
          <p className="vorta-hint" style={{ margin: 0 }}>
            Skipping uses the default visual style. You can generate direction later.
          </p>
          <button
            onClick={() => { wizard.skipStep('direction'); wizard.goTo('scenes') }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.45)', fontSize: 13, textDecoration: 'underline',
              textUnderlineOffset: 3, fontFamily: 'inherit',
            }}
          >
            Skip for now →
          </button>
        </div>
      </div>
    )
  }

  // ─────────────────────────── State C — treatment loaded ─────────────────────
  const ae = treatment.audience_experience || {}
  const sb = treatment.style_bible || {}
  const sd = treatment.sound_direction || {}
  const ps = treatment.pacing_strategy || {}

  const styleBibleFields = [
    ['colour_direction',    'Colour direction'],
    ['lighting_approach',   'Lighting approach'],
    ['realism_level',       'Realism level'],
    ['typography',          'Typography'],
    ['graphics_treatment',  'Graphics treatment'],
    ['map_style',           'Map style'],
    ['data_viz_style',      'Data viz style'],
    ['document_treatment',  'Document treatment'],
    ['archival_treatment',  'Archival treatment'],
    ['transition_language', 'Transition language'],
  ]

  const regenConfirmStrip = confirmRegen && (
    <div className="vorta-direction-confirm-strip" style={{ marginBottom: 14 }}>
      <span style={{ flex: 1 }}>
        Regenerating the full treatment discards all manual edits. Continue?
      </span>
      <button className="vorta-btn vorta-btn-danger vorta-btn-sm" onClick={handleGenerate}>
        Regenerate
      </button>
      <button className="vorta-btn vorta-btn-secondary vorta-btn-sm" onClick={() => setConfirmRegen(null)}>
        Cancel
      </button>
    </div>
  )

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 24px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
        <div>
          <h2 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: 0 }}>Documentary Direction</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13.5, marginTop: 6 }}>
            The unifying creative plan every scene inherits. Edits save automatically.
          </p>
        </div>
        <div style={{ flexShrink: 0, minHeight: 18, paddingTop: 6 }}>
          {saveState === 'saving' && <span className="vorta-hint">Saving…</span>}
          {saveState === 'saved' && (
            <span className="vorta-direction-saved" style={{ opacity: savedFading ? 0 : 1 }}>✓ Saved</span>
          )}
          {saveState === 'error' && (
            <span className="vorta-direction-save-error">
              Couldn't save — your edits are kept locally. {saveError}
            </span>
          )}
        </div>
      </div>

      {genError && (
        <div style={{
          marginBottom: 14, padding: '10px 16px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 8, color: '#f87171', fontSize: 13,
        }}>
          {genError}
        </div>
      )}

      {regenConfirmStrip}

      {/* ── Panel 1 — Treatment ── */}
      <Panel title="Treatment" subtitle="thesis, acts, pacing, sound" open={openPanels[0]} onToggle={() => togglePanel(0)}>
        <div className="vorta-direction-section">
          <SectionTitle onRegenerate={() => handleSectionRegenerate('visual_thesis')} busy={regeneratingSection === 'visual_thesis'} disabled={!!regeneratingSection}>Visual thesis</SectionTitle>
          <textarea
            className="vorta-textarea"
            rows={2}
            value={treatment.visual_thesis || ''}
            onChange={e => applyTreatmentPatch({ visual_thesis: e.target.value })}
          />
        </div>

        <div className="vorta-direction-section">
          <SectionTitle onRegenerate={() => handleSectionRegenerate('audience_experience')} busy={regeneratingSection === 'audience_experience'} disabled={!!regeneratingSection}>Audience experience</SectionTitle>
          <div className="vorta-direction-grid-2">
            {['opening', 'setup', 'escalation', 'reveal', 'conclusion'].map(k => (
              <div key={k} className="vorta-field" style={k === 'conclusion' ? { gridColumn: '1 / -1' } : undefined}>
                <label className="vorta-label">{k}</label>
                <textarea
                  className="vorta-textarea"
                  rows={2}
                  value={ae[k] || ''}
                  onChange={e => applyTreatmentPatch({ audience_experience: { [k]: e.target.value } })}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="vorta-direction-section">
          <SectionTitle onRegenerate={() => handleSectionRegenerate('acts')} busy={regeneratingSection === 'acts'} disabled={!!regeneratingSection}>Acts</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(treatment.acts || []).map(act => (
              <div key={act.act_number} className="vorta-direction-card">
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{
                    color: '#a78bfa', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                    textTransform: 'uppercase', flexShrink: 0,
                  }}>
                    Act {act.act_number}
                  </span>
                  <span style={{ color: 'white', fontSize: 14, fontWeight: 600 }}>{act.title}</span>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12.5, lineHeight: 1.55, margin: '8px 0 0' }}>
                  {act.purpose}
                </p>
                <div style={{ marginTop: 8, fontSize: 11.5, color: 'rgba(255,255,255,0.32)', lineHeight: 1.6 }}>
                  <div>Opens: “{act.opening_line}”</div>
                  <div>Closes: “{act.closing_line}”</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="vorta-direction-section">
          <SectionTitle onRegenerate={() => handleSectionRegenerate('pacing_strategy')} busy={regeneratingSection === 'pacing_strategy'} disabled={!!regeneratingSection}>Pacing strategy</SectionTitle>
          <div className="vorta-direction-grid-2">
            {[['fast_sections', 'Fast'], ['controlled_sections', 'Controlled'], ['reflective_sections', 'Reflective'], ['attention_resets', 'Attention resets']].map(([k, label]) => (
              <div key={k}>
                <label className="vorta-label">{label}</label>
                <div>
                  {(ps[k] || []).length
                    ? (ps[k] || []).map((item, i) => <span key={i} className="vorta-direction-tag">{item}</span>)
                    : <span className="vorta-hint">—</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="vorta-direction-section">
          <SectionTitle onRegenerate={() => handleSectionRegenerate('sound_direction')} busy={regeneratingSection === 'sound_direction'} disabled={!!regeneratingSection}>Sound direction</SectionTitle>
          <div className="vorta-direction-grid-2">
            {[['music', 'Music'], ['ambience', 'Ambience'], ['silence_moments', 'Silence moments'], ['impact_moments', 'Impact moments'], ['transition_audio', 'Transition audio']].map(([k, label]) => (
              <div key={k} className="vorta-field" style={k === 'transition_audio' ? { gridColumn: '1 / -1' } : undefined}>
                <label className="vorta-label">{label}</label>
                <textarea
                  className="vorta-textarea"
                  rows={2}
                  value={sd[k] || ''}
                  onChange={e => applyTreatmentPatch({ sound_direction: { [k]: e.target.value } })}
                />
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {/* ── Panel 2 — Style Bible ── */}
      <Panel title="Style Bible" subtitle="visual signature, grade, motifs" open={openPanels[1]} onToggle={() => togglePanel(1)}>
        <div className="vorta-direction-section">
          <div className="vorta-direction-signature-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
              <label className="vorta-label" style={{ margin: 0, color: '#c4b5fd' }}>
                Visual Signature — appended to every image prompt
              </label>
              <button
                className="vorta-btn vorta-btn-ghost vorta-btn-sm"
                onClick={() => applyTreatmentPatch({ style_bible: { visual_signature: DEFAULT_STYLE_LOCK } })}
              >
                Reset to default
              </button>
            </div>
            <input
              type="text"
              className="vorta-input"
              value={sig}
              onChange={e => applyTreatmentPatch({ style_bible: { visual_signature: e.target.value } })}
            />
            <div className="vorta-hint" style={{ marginTop: 6 }}>
              {sig.length} chars · {sig.trim().split(/\s+/).filter(Boolean).length} words
            </div>
            <div className="vorta-direction-preview">
              Every image prompt will end with: …, {sig.trim() || DEFAULT_STYLE_LOCK}
            </div>
            {sigWarnings.map((w, i) => (
              <div key={i} className="vorta-direction-warning">⚠ {w}</div>
            ))}
          </div>
        </div>

        <div className="vorta-direction-section">
          <SectionTitle onRegenerate={() => handleSectionRegenerate('style_bible')} busy={regeneratingSection === 'style_bible'} disabled={!!regeneratingSection}>Style bible</SectionTitle>
          <div className="vorta-direction-grid-2">
            {styleBibleFields.map(([k, label]) => (
              <div key={k} className="vorta-field">
                <label className="vorta-label">{label}</label>
                <textarea
                  className="vorta-textarea"
                  rows={2}
                  value={sb[k] || ''}
                  onChange={e => applyTreatmentPatch({ style_bible: { [k]: e.target.value } })}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="vorta-direction-section">
          <SectionTitle onRegenerate={() => handleSectionRegenerate('recurring_motifs')} busy={regeneratingSection === 'recurring_motifs'} disabled={!!regeneratingSection}>Recurring motifs</SectionTitle>
          <div className="vorta-direction-grid-2">
            {motifs.map((m, i) => (
              <div key={m.id || i} className="vorta-direction-card">
                <input
                  type="text"
                  className="vorta-input"
                  style={{ fontWeight: 600 }}
                  value={m.name || ''}
                  placeholder="Motif name"
                  onChange={e => updateMotif(i, 'name', e.target.value)}
                />
                <textarea
                  className="vorta-textarea"
                  rows={3}
                  style={{ marginTop: 8 }}
                  value={m.description || ''}
                  placeholder="Description"
                  onChange={e => updateMotif(i, 'description', e.target.value)}
                />
                {m.reinforces && (
                  <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
                    Reinforces: {m.reinforces}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {/* ── Panel 3 — Continuity Entities ── */}
      <Panel title="Continuity Entities" subtitle="locked descriptors + evidence claims" open={openPanels[2]} onToggle={() => togglePanel(2)}>
        <div className="vorta-direction-section">
          <SectionTitle
            onRegenerate={() => handleSectionRegenerate('continuity_entities')}
            busy={regeneratingSection === 'continuity_entities'}
            disabled={!!regeneratingSection}
          >
            Continuity entities
          </SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {entities.map((ent, i) => {
              const colors = ENTITY_TYPE_COLORS[ent.type] || ENTITY_TYPE_COLORS.object
              return (
                <div key={ent.id || i} className="vorta-direction-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <select
                      className="vorta-select"
                      style={{ width: 140, flexShrink: 0 }}
                      value={ent.type || 'person'}
                      onChange={e => updateEntity(i, 'type', e.target.value)}
                    >
                      {Object.keys(ENTITY_TYPE_COLORS).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <span
                      className="vorta-direction-type-badge"
                      style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text, flexShrink: 0 }}
                    >
                      {ent.type || 'object'}
                    </span>
                    <input
                      type="text"
                      className="vorta-input"
                      style={{ fontWeight: 600 }}
                      placeholder="Entity name"
                      value={ent.name || ''}
                      onChange={e => updateEntity(i, 'name', e.target.value)}
                    />
                    <button
                      className="vorta-btn vorta-btn-danger vorta-btn-sm"
                      style={{ flexShrink: 0 }}
                      title="Delete entity"
                      onClick={() => deleteEntity(i)}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <div className="vorta-field" style={{ marginTop: 10 }}>
                    <label className="vorta-label">Locked descriptor — injected verbatim into prompts</label>
                    <textarea
                      className="vorta-textarea"
                      rows={2}
                      value={ent.locked_descriptor || ''}
                      onChange={e => updateEntity(i, 'locked_descriptor', e.target.value)}
                    />
                  </div>
                  <div className="vorta-field" style={{ marginTop: 8 }}>
                    <label className="vorta-label">Prohibited variations</label>
                    <input
                      type="text"
                      className="vorta-input"
                      value={ent.prohibited_variations || ''}
                      onChange={e => updateEntity(i, 'prohibited_variations', e.target.value)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <button className="vorta-btn vorta-btn-secondary vorta-btn-sm" style={{ marginTop: 12 }} onClick={addEntity}>
            <Plus size={11} /> Add entity
          </button>
        </div>

        <div className="vorta-direction-section">
          <SectionTitle>Evidence claims</SectionTitle>
          <p className="vorta-hint" style={{ marginBottom: 10 }}>
            These claims will be checked for visual support in the Director Review.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: 0.75 }}>
            {(treatment.evidence_claims || []).map((c, i) => (
              <div key={c.id || i} className="vorta-direction-card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span
                  className="vorta-direction-type-badge"
                  style={{
                    flexShrink: 0, marginTop: 2,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: CLAIM_TYPE_COLORS[c.type] || 'rgba(255,255,255,0.6)',
                  }}
                >
                  {c.type}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12.5, lineHeight: 1.5 }}>{c.claim}</div>
                  {c.preferred_evidence && (
                    <div style={{ color: 'rgba(255,255,255,0.32)', fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
                      Preferred evidence: {c.preferred_evidence}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {/* ── Section / analysis errors surfaced above the footer ── */}
      {(sectionError || analyzeError) && (
        <div style={{
          margin: '0 0 12px', padding: '10px 16px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 8, color: '#f87171', fontSize: 13,
        }}>
          {sectionError || analyzeError}
        </div>
      )}

      {/* ── Sticky footer ── */}
      <div className="vorta-direction-footer">
        <button className="vorta-btn vorta-btn-ghost" onClick={() => wizard.goBack()} disabled={isAnalyzing}>
          ← Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isAnalyzing && (
            <span className="vorta-hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
              Breaking the script into treatment-aware scenes…
            </span>
          )}
          <button
            className="vorta-btn vorta-btn-secondary"
            onClick={() => setConfirmRegen('full')}
            disabled={isAnalyzing}
          >
            <RefreshCw size={12} /> Regenerate Direction
          </button>
          {/* DD-3: runs the treatment-aware analysis (handleAnalyze reads direction.json
              server-side); on success handleAnalyze marks this step complete and advances */}
          <button
            className="vorta-btn vorta-btn-primary"
            onClick={() => onAnalyze({ script: scriptText, metadata: projectMetadata || {} })}
            disabled={isAnalyzing || !hasScript}
          >
            {isAnalyzing ? 'Analyzing…' : 'Generate Scene Direction →'}
          </button>
        </div>
      </div>
    </div>
  )
}
