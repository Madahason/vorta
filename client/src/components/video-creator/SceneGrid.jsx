import { useState, useRef, useEffect } from 'react'
import {
  Loader2, RefreshCw, CheckCircle, XCircle,
  ChevronDown, ChevronUp, Copy, Code2, Eye, ImageIcon, Film,
  Layers, X, AlignLeft, Calendar, Zap, Circle, Sparkles, Palette, Plus,
} from 'lucide-react'
import { buildPreviewHTML } from '../../utils/buildPreviewHTML'

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_STYLES = {
  image:          'bg-blue-500/15 text-blue-300 border-blue-500/25',
  motion_graphic: 'bg-teal-500/15 text-teal-300 border-teal-500/25',
  real_footage:   'bg-amber-500/15 text-amber-300 border-amber-500/25',
}
const TYPE_LABEL = {
  image:          'image',
  motion_graphic: 'motion graphic',
  real_footage:   'real footage',
}
const SHOT_TYPES      = ['image', 'motion_graphic', 'real_footage']
const MOTION_TYPES    = ['push_in', 'pull_out', 'drift_left', 'drift_right', 'drift_up', 'static']
const MOTION_INTENS   = ['subtle', 'moderate', 'strong']
const TRANSITION_TYPES= ['dissolve', 'cut', 'dip_black', 'dip_white']
const GRADE_TYPES     = ['cool_blue', 'warm_amber', 'desaturated', 'neutral']

const OVERLAY_TYPES = [
  { type: 'lower_third', label: 'Lower Third',  icon: AlignLeft,  singleton: false },
  { type: 'date_stamp',  label: 'Date Stamp',   icon: Calendar,   singleton: false },
  { type: 'kinetic_text',label: 'Kinetic Text', icon: Zap,        singleton: false },
  { type: 'vignette',    label: 'Vignette',     icon: Circle,     singleton: true  },
  { type: 'grain',       label: 'Grain',        icon: Sparkles,   singleton: true  },
  { type: 'color_grade', label: 'Color Grade',  icon: Palette,    singleton: true  },
]

const OVERLAY_DEFAULTS = {
  lower_third:  { line1: '', line2: '', appearAt: 0.7 },
  date_stamp:   { text: '', appearAt: 0.7 },
  kinetic_text: { text: '', style: 'center', appearAt: 1.0 },
  vignette:     { intensity: 0.45 },
  grain:        { intensity: 0.12 },
  color_grade:  { grade: 'cool_blue' },
}

const MOOD_STYLES = {
  tense:    'bg-red-500/[0.07] text-red-400/60 border-red-500/[0.14]',
  formal:   'bg-slate-500/[0.07] text-slate-400/60 border-slate-500/[0.14]',
  intense:  'bg-orange-500/[0.07] text-orange-400/60 border-orange-500/[0.14]',
  neutral:  'bg-white/[0.04] text-white/30 border-white/[0.08]',
}

// ─── SceneGrid ────────────────────────────────────────────────────────────────

export default function SceneGrid({
  scenes,
  onScenesChange,
  sceneStatuses = {},
  onRetry,
  motionStatuses = {},
  onBuildComponent,
  clipMatches = {},
  selectedClips = {},
  onSelectClip,
  onConvertToImage,
  onManualMatch,
  onOpenLibrary,
  onPreviewScene,
}) {

  const updateScene = (index, patch) =>
    onScenesChange(scenes.map((s, i) => (i === index ? { ...s, ...patch } : s)))

  const imageCount   = scenes.filter(s => s.shot_type === 'image').length
  const motionCount  = scenes.filter(s => s.shot_type === 'motion_graphic').length
  const footageCount = scenes.filter(s => s.shot_type === 'real_footage').length
  const doneCount    = Object.values(sceneStatuses).filter(s => s.status === 'done').length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[11px] font-medium text-white/50 uppercase tracking-wider">
          {scenes.length} scene{scenes.length !== 1 ? 's' : ''}
          {doneCount > 0 && <span className="ml-2 text-green-400/60">· {doneCount} generated</span>}
        </h2>
        <div className="flex gap-3 text-[11px] text-white/30">
          <span className="text-blue-400/60">{imageCount} image</span>
          <span className="text-teal-400/60">{motionCount} motion</span>
          <span className="text-amber-400/60">{footageCount} footage</span>
        </div>
      </div>

      <div className="space-y-3">
        {scenes.map((scene, i) => (
          <SceneCard
            key={scene.scene_id}
            scene={scene}
            index={i}
            onChange={patch => updateScene(i, patch)}
            genStatus={sceneStatuses[scene.scene_id] || null}
            onRetry={onRetry}
            motionStatus={motionStatuses[scene.scene_id] || null}
            onBuildComponent={onBuildComponent}
            clipMatch={clipMatches[scene.scene_id]}
            selectedClip={selectedClips[scene.scene_id] || null}
            onSelectClip={clip => onSelectClip?.(scene.scene_id, clip)}
            onConvertToImage={() => onConvertToImage?.(scene.scene_id)}
            onManualMatch={() => onManualMatch?.(scene)}
            onOpenLibrary={onOpenLibrary}
            onPreview={() => onPreviewScene?.(scene)}
          />
        ))}
      </div>

    </div>
  )
}

// ─── SceneCard ────────────────────────────────────────────────────────────────

function SceneCard({
  scene, index, onChange, genStatus, onRetry,
  motionStatus, onBuildComponent,
  clipMatch, selectedClip, onSelectClip, onConvertToImage, onManualMatch, onOpenLibrary, onPreview,
}) {
  const [editingPrompt,    setEditingPrompt]    = useState(false)
  const [promptDraft,      setPromptDraft]      = useState(scene.higgsfield_prompt)
  const [codeExpanded,     setCodeExpanded]     = useState(false)
  const [copied,           setCopied]           = useState(false)
  const [overlayEditorOpen,setOverlayEditorOpen]= useState(false)

  const savePrompt   = () => { onChange({ higgsfield_prompt: promptDraft }); setEditingPrompt(false) }
  const cancelPrompt = () => { setPromptDraft(scene.higgsfield_prompt); setEditingPrompt(false) }

  const copyCode = () => {
    navigator.clipboard.writeText(scene.motion_component).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const status       = genStatus?.status || null
  const isGenerating = status === 'generating'
  const isDone       = status === 'done'
  const isFailed     = status === 'failed'
  const isPending    = status === 'pending'

  const motionBuilding = motionStatus?.status === 'generating'
  const motionFailed   = motionStatus?.status === 'failed'
  const hasComponent   = !!scene.motion_component

  const overlayCount = (scene.overlays || []).length

  const borderClass = isGenerating
    ? 'border-blue-500/40'
    : isDone    ? 'border-green-500/30'
    : isFailed  ? 'border-red-500/30'
    : 'border-white/[0.06] hover:border-white/[0.1]'

  return (
    <div className={`rounded-xl border bg-white/[0.02] transition-colors ${borderClass}`}>
      <div className="p-4">

        {/* ── Header ── */}
        <div className="flex items-start gap-3 mb-3">
          <span className="text-[11px] font-mono text-white/20 mt-0.5 shrink-0 w-7">
            {String(index + 1).padStart(3, '0')}
          </span>
          <p className="flex-1 text-sm text-white/70 leading-snug">{scene.script_excerpt}</p>
          <div className="flex items-center gap-2 shrink-0">
            {isPending    && <span className="text-[10px] text-white/25 font-mono">pending</span>}
            {isGenerating && <Loader2 size={12} className="animate-spin text-blue-400" />}
            {isDone       && <CheckCircle size={13} className="text-green-400" />}
            {isFailed     && <XCircle size={13} className="text-red-400" />}
            <button
              onClick={onPreview}
              className="p-1 text-white/20 hover:text-white/55 transition-colors"
              title="Preview scene"
            >
              <Eye size={13} />
            </button>
            <select
              value={scene.shot_type}
              onChange={e => {
                const t = e.target.value
                onChange({ shot_type: t, real_footage_flag: t === 'real_footage' })
              }}
              disabled={isGenerating}
              className={`text-[11px] px-2 py-1 rounded-md border font-medium bg-transparent cursor-pointer focus:outline-none disabled:opacity-50 ${TYPE_STYLES[scene.shot_type]}`}
            >
              {SHOT_TYPES.map(t => (
                <option key={t} value={t} className="bg-[#1a1a1a] text-white">{TYPE_LABEL[t]}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Metadata ── */}
        <div className="flex items-center gap-3 mb-3 ml-10 text-[11px] text-white/25">
          <span>mood: <span className="text-white/40">{scene.mood}</span></span>
          <span>·</span>
          <span>{scene.duration_seconds}s</span>
          {scene.clip_search_tags?.length > 0 && (
            <><span>·</span><span className="text-amber-400/50">{scene.clip_search_tags.slice(0, 3).join(', ')}</span></>
          )}
        </div>

        {/* ── Content ── */}
        <div className="ml-10 space-y-2">

          {/* ════ MOTION GRAPHIC ════════════════════════════════════════════════ */}
          {scene.shot_type === 'motion_graphic' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-teal-400/50 bg-teal-500/[0.05] rounded-lg px-3 py-2 border border-teal-500/[0.12]">
                  Template: <span className="font-mono">{scene.motion_graphic_type || 'TBD'}</span>
                </div>
                {motionBuilding ? (
                  <span className="flex items-center gap-1.5 text-[11px] text-teal-400/60">
                    <Loader2 size={11} className="animate-spin" />
                    Generating component…
                  </span>
                ) : (
                  <button
                    onClick={() => onBuildComponent(scene)}
                    className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 rounded-lg text-teal-300 transition-colors"
                  >
                    {motionFailed ? <RefreshCw size={11} /> : <Code2 size={11} />}
                    {motionFailed ? 'Retry' : hasComponent ? 'Regenerate' : 'Build Component'}
                  </button>
                )}
              </div>

              {motionFailed && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-3 py-2">
                  <p className="text-[11px] text-red-400/70">{motionStatus?.error || 'Component generation failed'}</p>
                </div>
              )}

              {hasComponent && (
                <div className="space-y-2">
                  <p className="text-[10px] text-white/25">Preview</p>
                  <div className="rounded-lg overflow-hidden border border-teal-500/[0.15]"
                       style={{ aspectRatio: '16 / 9', maxHeight: '160px', width: `${160 * 16 / 9}px`, maxWidth: '100%' }}>
                    <iframe
                      srcDoc={buildPreviewHTML(scene.motion_component, scene.motion_graphic_type)}
                      title={`preview-${scene.scene_id}`}
                      sandbox="allow-scripts"
                      className="w-full h-full border-0"
                      style={{ display: 'block' }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/[0.08] text-teal-400/50 border border-teal-500/[0.12]">
                      Remotion Component · Ready to use
                    </span>
                    <div className="flex items-center gap-3">
                      <button onClick={copyCode} className="flex items-center gap-1 text-[10px] text-teal-400/50 hover:text-teal-300 transition-colors">
                        <Copy size={9} />
                        {copied ? 'Copied!' : 'Copy Code'}
                      </button>
                      <button onClick={() => setCodeExpanded(e => !e)} className="flex items-center gap-1 text-[10px] text-teal-400/40 hover:text-teal-300 transition-colors">
                        {codeExpanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                        {codeExpanded ? 'Hide code' : 'Show full code'}
                      </button>
                    </div>
                  </div>
                  <div style={{ background: '#0d0d0d', border: '1px solid rgba(20,184,166,0.2)', borderRadius: '8px', overflow: 'hidden' }}>
                    <pre style={{
                      fontFamily: '"JetBrains Mono","Fira Code","Cascadia Code","Consolas",monospace',
                      fontSize: '11px', lineHeight: '1.6', padding: '12px',
                      color: 'rgba(178,255,236,0.5)', overflowX: 'auto',
                      overflowY: codeExpanded ? 'auto' : 'hidden',
                      maxHeight: codeExpanded ? '480px' : 'none', whiteSpace: 'pre',
                    }}>
                      {codeExpanded ? scene.motion_component : scene.motion_component.split('\n').slice(0, 5).join('\n')}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════ REAL FOOTAGE ══════════════════════════════════════════════════ */}
          {scene.shot_type === 'real_footage' && (
            <ClipMatchSection
              scene={scene}
              clipMatch={clipMatch}
              selectedClip={selectedClip}
              onSelectClip={onSelectClip}
              onConvertToImage={onConvertToImage}
              onManualMatch={onManualMatch}
            />
          )}

          {/* ════ PROMPT ════════════════════════════════════════════════════════ */}
          {(scene.shot_type === 'image' || scene.shot_type === 'real_footage') && (
            <>
              {editingPrompt ? (
                <div className="space-y-2">
                  <textarea
                    value={promptDraft}
                    onChange={e => setPromptDraft(e.target.value)}
                    rows={3}
                    autoFocus
                    className="w-full bg-white/[0.05] border border-white/[0.15] rounded-lg px-3 py-2 text-[11px] text-white/80 focus:outline-none focus:border-white/25 resize-none font-mono leading-relaxed"
                  />
                  <div className="flex gap-2">
                    <button onClick={savePrompt} className="text-[11px] px-3 py-1 bg-white/10 hover:bg-white/15 rounded text-white/70 transition-colors">Save</button>
                    <button onClick={cancelPrompt} className="text-[11px] px-3 py-1 text-white/25 hover:text-white/50 transition-colors">Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setPromptDraft(scene.higgsfield_prompt); setEditingPrompt(true) }}
                  disabled={isGenerating}
                  className="w-full text-left text-[11px] text-white/35 bg-white/[0.02] hover:bg-white/[0.05] disabled:cursor-default rounded-lg px-3 py-2 font-mono leading-relaxed transition-colors border border-transparent hover:border-white/[0.06]"
                  title="Click to edit prompt"
                >
                  {scene.higgsfield_prompt || <span className="text-white/15 italic">No prompt generated</span>}
                </button>
              )}
            </>
          )}

          {/* ════ GENERATED IMAGE ═══════════════════════════════════════════════ */}
          {isDone && genStatus.image_path && (
            <div className="mt-2 rounded-lg overflow-hidden border border-white/[0.08]">
              <img src={genStatus.image_path} alt={`Scene ${scene.scene_id}`} className="w-full object-cover max-h-48" loading="lazy" />
            </div>
          )}

          {/* ════ GENERATING PULSE ══════════════════════════════════════════════ */}
          {isGenerating && (
            <div className="h-24 rounded-lg bg-white/[0.03] border border-blue-500/[0.15] flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin text-blue-400/60" />
              <span className="text-[11px] text-blue-400/50">Generating with Higgsfield…</span>
            </div>
          )}

          {/* ════ IMAGE FAILED ══════════════════════════════════════════════════ */}
          {isFailed && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-3 py-2.5 flex items-start justify-between gap-3">
              <p className="text-[11px] text-red-400/80 leading-relaxed flex-1">{genStatus.error || 'Generation failed'}</p>
              {onRetry && (
                <button
                  onClick={() => onRetry(scene.scene_id, scene.higgsfield_prompt)}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded text-red-400 transition-colors shrink-0"
                >
                  <RefreshCw size={10} /> Retry
                </button>
              )}
            </div>
          )}

        </div>

        {/* ── Card footer — Overlays toggle ── */}
        <div className="mt-3 ml-10 pt-3 border-t border-white/[0.04] flex items-center">
          <button
            onClick={() => setOverlayEditorOpen(o => !o)}
            className={`flex items-center gap-1.5 text-[11px] transition-colors ${
              overlayEditorOpen
                ? 'text-indigo-300'
                : 'text-white/25 hover:text-white/55'
            }`}
          >
            <Layers size={12} />
            {overlayCount > 0
              ? `Overlays (${overlayCount})`
              : 'Overlays'
            }
            {overlayEditorOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        </div>
      </div>

      {/* ── Inline overlay editor panel ── */}
      {overlayEditorOpen && (
        <OverlayEditorPanel scene={scene} onChange={onChange} />
      )}
    </div>
  )
}

// ─── OverlayEditorPanel ───────────────────────────────────────────────────────

function OverlayEditorPanel({ scene, onChange }) {
  // ── Pending state — all edits accumulate here; nothing writes to scene until Apply ──
  const buildInitial = () => ({
    overlays:        [...(scene.overlays || [])],
    motion:          scene.motion ? { ...scene.motion } : null,
    transition_out:  scene.transition_out  || 'dissolve',
    duration_seconds: scene.duration_seconds || 5,
    grade:           scene.grade           || 'cool_blue',
  })

  const [pending, setPending]           = useState(buildInitial)
  const initialRef                      = useRef(JSON.stringify(buildInitial()))
  const [applied,  setApplied]          = useState(false)
  const [addDropdownOpen, setAddDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  const isDirty = JSON.stringify(pending) !== initialRef.current

  useEffect(() => {
    const handler = e => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setAddDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Overlay mutations (update pending, not scene) ────────────────────────
  const existingTypes = new Set(pending.overlays.map(o => o.type))

  const addOverlay = (type) => {
    setAddDropdownOpen(false)
    const defaults  = OVERLAY_DEFAULTS[type]
    const singleton = OVERLAY_TYPES.find(o => o.type === type)?.singleton
    if (singleton && existingTypes.has(type)) return
    setPending(prev => ({
      ...prev,
      ...(type === 'color_grade' ? { grade: defaults.grade } : {}),
      overlays: [...prev.overlays, { type, ...defaults }],
    }))
  }

  const updateOverlay = (i, patch) => {
    setPending(prev => ({
      ...prev,
      ...(prev.overlays[i]?.type === 'color_grade' && patch.grade ? { grade: patch.grade } : {}),
      overlays: prev.overlays.map((o, idx) => idx === i ? { ...o, ...patch } : o),
    }))
  }

  const removeOverlay = (i) => {
    setPending(prev => ({ ...prev, overlays: prev.overlays.filter((_, idx) => idx !== i) }))
  }

  // ── Apply / Reset ────────────────────────────────────────────────────────
  const handleApply = () => {
    onChange(pending)
    initialRef.current = JSON.stringify(pending)
    setApplied(true)
    setTimeout(() => setApplied(false), 1500)
  }

  const handleReset = () => setPending(JSON.parse(initialRef.current))

  // ── Styles ───────────────────────────────────────────────────────────────
  const panelStyle = {
    background: '#111111',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    borderBottomLeftRadius: '12px',
    borderBottomRightRadius: '12px',
    padding: '16px',
  }
  const sectionHeaderStyle = {
    fontSize: '11px', fontWeight: 500,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px',
  }
  const inputStyle = {
    background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px', color: 'rgba(255,255,255,0.75)',
    fontSize: '13px', padding: '5px 8px', outline: 'none', width: '100%',
  }
  const selectStyle = { ...inputStyle, cursor: 'pointer' }

  return (
    <div style={panelStyle}>

      {/* ── Overlays section ── */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={sectionHeaderStyle}>Overlays</span>

          <div style={{ position: 'relative' }} ref={dropdownRef}>
            <button
              onClick={() => setAddDropdownOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                fontSize: '11px', color: 'rgba(255,255,255,0.50)',
                border: '1px dashed rgba(255,255,255,0.15)',
                borderRadius: '6px', padding: '4px 10px',
                background: 'transparent', cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.75)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.50)'}
            >
              <Plus size={10} /> Add Overlay
            </button>

            {addDropdownOpen && (
              <div style={{
                position: 'absolute', right: 0, top: '28px', zIndex: 30,
                background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px', padding: '4px', minWidth: '160px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}>
                {OVERLAY_TYPES.map(({ type, label, icon: Icon, singleton }) => {
                  const disabled = singleton && existingTypes.has(type)
                  return (
                    <button key={type} onClick={() => !disabled && addOverlay(type)} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      width: '100%', textAlign: 'left', fontSize: '12px',
                      color: disabled ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.60)',
                      padding: '6px 10px', borderRadius: '5px',
                      background: 'transparent', cursor: disabled ? 'not-allowed' : 'pointer', border: 'none',
                    }}
                      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <Icon size={12} /> {label}
                      {disabled && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', marginLeft: 'auto' }}>added</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {pending.overlays.length === 0 && (
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.20)', fontStyle: 'italic' }}>
            No overlays assigned. Use "Add Overlay" to add one.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {pending.overlays.map((overlay, i) => (
            <OverlayRow
              key={i}
              overlay={overlay}
              scene={{ duration_seconds: pending.duration_seconds }}
              onUpdate={patch => updateOverlay(i, patch)}
              onRemove={() => removeOverlay(i)}
              inputStyle={inputStyle}
              selectStyle={selectStyle}
            />
          ))}
        </div>
      </div>

      {/* ── Motion section ── */}
      <div style={{ marginBottom: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={sectionHeaderStyle}>Motion</p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)', display: 'block', marginBottom: '4px' }}>Type</label>
            <select
              value={pending.motion?.type || 'push_in'}
              onChange={e => setPending(prev => ({ ...prev, motion: { ...(prev.motion || {}), type: e.target.value } }))}
              style={selectStyle}
            >
              {MOTION_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          {(pending.motion?.type || 'push_in') !== 'static' && (
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)', display: 'block', marginBottom: '4px' }}>Intensity</label>
              <select
                value={pending.motion?.intensity || 'subtle'}
                onChange={e => setPending(prev => ({ ...prev, motion: { ...(prev.motion || {}), intensity: e.target.value } }))}
                style={selectStyle}
              >
                {MOTION_INTENS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── Transition section ── */}
      <div style={{ marginBottom: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={sectionHeaderStyle}>Transition Out</p>
        <select
          value={pending.transition_out}
          onChange={e => setPending(prev => ({ ...prev, transition_out: e.target.value }))}
          style={{ ...selectStyle, maxWidth: '200px' }}
        >
          {TRANSITION_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {/* ── Duration section ── */}
      <div style={{ paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={sectionHeaderStyle}>Duration</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="number" min={2} max={30}
            value={pending.duration_seconds}
            onChange={e => setPending(prev => ({
              ...prev,
              duration_seconds: Math.min(30, Math.max(2, Number(e.target.value))),
            }))}
            style={{ ...inputStyle, width: '72px', textAlign: 'center' }}
          />
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.30)' }}>seconds</span>
        </div>
      </div>

      {/* ── Apply / Reset ── */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={handleReset}
          disabled={!isDirty}
          style={{
            flex: '0 0 auto', height: '36px', padding: '0 16px',
            fontSize: '13px', cursor: isDirty ? 'pointer' : 'not-allowed',
            color: isDirty ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)',
            background: 'transparent',
            border: '1px solid ' + (isDirty ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)'),
            borderRadius: '6px',
          }}
        >
          Reset
        </button>
        <button
          onClick={handleApply}
          disabled={!isDirty && !applied}
          style={{
            flex: 1, height: '36px',
            fontSize: '13px', fontWeight: 500,
            cursor: isDirty ? 'pointer' : 'not-allowed',
            color: '#fff',
            background: applied ? '#16a34a' : (isDirty ? '#3b82f6' : 'rgba(255,255,255,0.08)'),
            border: 'none', borderRadius: '6px',
            transition: 'background 0.2s',
          }}
        >
          {applied ? '✓ Applied' : 'Apply changes'}
        </button>
      </div>

    </div>
  )
}

// ─── Overlay sub-section constants ───────────────────────────────────────────

const FONT_FAMILIES = ['Inter','Helvetica Neue','Georgia','Courier New','Bebas Neue','Playfair Display','Montserrat','DM Sans']
const FONT_WEIGHTS  = [
  { v: '300', l: '300 Light' }, { v: '400', l: '400 Regular' }, { v: '500', l: '500 Medium' },
  { v: '600', l: '600 SemiBold' }, { v: '700', l: '700 Bold' }, { v: '800', l: '800 ExtraBold' },
]
const TEXT_TRANSFORMS   = ['none','uppercase','lowercase','capitalize']
const ENTER_ANIMS_LT    = ['slide_left','slide_right','slide_up','slide_down','fade','scale_up']
const ENTER_ANIMS_KT    = ['fade','word_by_word','slide_up','scale_in','typewriter']
const EXIT_ANIMS_KT     = ['fade','slide_down','scale_out','instant']
const GRAIN_PATTERNS    = ['random','horizontal_bias','diagonal']
const GRADE_TRANSITIONS = ['instant','fade_in']
const EASINGS           = ['spring','linear','ease_out','ease_in_out']

// ─── SubSection ──────────────────────────────────────────────────────────────

function SubSection({ title, open, onToggle, children }) {
  return (
    <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
      <button onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
      }}>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</span>
        {open ? <ChevronUp size={10} color="rgba(255,255,255,0.28)" /> : <ChevronDown size={10} color="rgba(255,255,255,0.28)" />}
      </button>
      {open && <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>{children}</div>}
    </div>
  )
}

// ─── ColorInput ──────────────────────────────────────────────────────────────

function ColorInput({ label, hex, onHex, opacity, onOpacity, inputStyle }) {
  return (
    <div>
      {label && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)', marginBottom: '4px' }}>{label}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input type="color" value={hex || '#000000'} onChange={e => onHex(e.target.value)}
          style={{ width: 28, height: 28, padding: 2, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, background: 'transparent', cursor: 'pointer', flexShrink: 0 }} />
        <input type="text" value={hex || '#000000'}
          onChange={e => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) onHex(e.target.value) }}
          style={{ ...inputStyle, width: '84px', flexShrink: 0 }} />
        {onOpacity !== undefined && <>
          <input type="range" min={0} max={1} step={0.05} value={opacity ?? 1}
            onChange={e => onOpacity(parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: '#3b82f6', cursor: 'pointer' }} />
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.40)', width: 28, textAlign: 'right' }}>{(opacity ?? 1).toFixed(2)}</span>
        </>}
      </div>
    </div>
  )
}

// ─── SliderRow ───────────────────────────────────────────────────────────────

function SliderRow({ label, min, max, step, value, onChange, unit = '' }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)', marginBottom: '4px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: '#3b82f6', cursor: 'pointer' }} />
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.50)', width: 40, textAlign: 'right' }}>
          {typeof value === 'number' ? value.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0) : value}{unit}
        </span>
      </div>
    </div>
  )
}

// ─── OverlayRow ───────────────────────────────────────────────────────────────

function OverlayRow({ overlay, scene, onUpdate, onRemove, inputStyle, selectStyle }) {
  const [colorOpen, setColorOpen] = useState(false)
  const [fontOpen,  setFontOpen]  = useState(false)
  const [animOpen,  setAnimOpen]  = useState(false)

  const meta = OVERLAY_TYPES.find(o => o.type === overlay.type)
  const Icon = meta?.icon || Layers

  const c = overlay.color    || {}
  const f = overlay.font     || {}
  const a = overlay.animation || {}

  const updColor = patch => onUpdate({ color:     { ...c, ...patch } })
  const updFont  = patch => onUpdate({ font:      { ...f, ...patch } })
  const updAnim  = patch => onUpdate({ animation: { ...a, ...patch } })

  const isTextType = ['lower_third','date_stamp','kinetic_text'].includes(overlay.type)
  const labelStyle = { fontSize: '11px', color: 'rgba(255,255,255,0.30)', display: 'block', marginBottom: '4px' }
  const fieldRow   = { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end' }

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px', padding: '10px 12px' }}>

      {/* ── Row header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>
          <Icon size={12} /> {meta?.label || overlay.type}
        </div>
        <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.20)', padding: '2px', display: 'flex' }}
          onMouseEnter={e => e.currentTarget.style.color = 'rgba(239,68,68,0.7)'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.20)'}
          title="Remove overlay">
          <X size={12} />
        </button>
      </div>

      {/* ── Core fields ── */}
      {overlay.type === 'lower_third' && (
        <div style={fieldRow}>
          <div style={{ flex: '1 1 150px' }}>
            <label style={labelStyle}>Line 1</label>
            <input type="text" value={overlay.line1 || ''} placeholder="Steve Jobs" onChange={e => onUpdate({ line1: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label style={labelStyle}>Line 2</label>
            <input type="text" value={overlay.line2 || ''} placeholder="Apple CEO · 1997" onChange={e => onUpdate({ line2: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ flex: '0 0 80px' }}>
            <label style={labelStyle}>Appear (s)</label>
            <input type="number" min={0} max={scene.duration_seconds || 10} step={0.1} value={overlay.appearAt ?? 0.7} onChange={e => onUpdate({ appearAt: parseFloat(e.target.value) })} style={{ ...inputStyle, textAlign: 'center' }} />
          </div>
        </div>
      )}

      {overlay.type === 'date_stamp' && (
        <div style={fieldRow}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={labelStyle}>Text</label>
            <input type="text" value={overlay.text || ''} placeholder="San Francisco · 2007" onChange={e => onUpdate({ text: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ flex: '0 0 80px' }}>
            <label style={labelStyle}>Appear (s)</label>
            <input type="number" min={0} max={scene.duration_seconds || 10} step={0.1} value={overlay.appearAt ?? 0.7} onChange={e => onUpdate({ appearAt: parseFloat(e.target.value) })} style={{ ...inputStyle, textAlign: 'center' }} />
          </div>
        </div>
      )}

      {overlay.type === 'kinetic_text' && (
        <div style={fieldRow}>
          <div style={{ flex: '1 1 180px' }}>
            <label style={labelStyle}>Text (max 8 words)</label>
            <input type="text" value={overlay.text || ''} placeholder="$0 to $3 trillion" onChange={e => onUpdate({ text: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ flex: '0 0 100px' }}>
            <label style={labelStyle}>Position</label>
            <select value={overlay.style || 'center'} onChange={e => onUpdate({ style: e.target.value })} style={selectStyle}>
              <option value="center">center</option>
              <option value="bottom">bottom</option>
            </select>
          </div>
          <div style={{ flex: '0 0 80px' }}>
            <label style={labelStyle}>Appear (s)</label>
            <input type="number" min={0} max={scene.duration_seconds || 10} step={0.1} value={overlay.appearAt ?? 1.0} onChange={e => onUpdate({ appearAt: parseFloat(e.target.value) })} style={{ ...inputStyle, textAlign: 'center' }} />
          </div>
        </div>
      )}

      {overlay.type === 'vignette' && (
        <SliderRow label={`Intensity — ${(overlay.intensity ?? 0.45).toFixed(2)}`} min={0.1} max={0.8} step={0.05} value={overlay.intensity ?? 0.45} onChange={v => onUpdate({ intensity: v })} />
      )}

      {overlay.type === 'grain' && (
        <SliderRow label={`Intensity — ${(overlay.intensity ?? 0.06).toFixed(2)}`} min={0.01} max={0.3} step={0.01} value={overlay.intensity ?? 0.06} onChange={v => onUpdate({ intensity: v })} />
      )}

      {overlay.type === 'color_grade' && (
        <div style={{ flex: '0 0 180px' }}>
          <label style={labelStyle}>Grade preset</label>
          <select value={overlay.grade || 'cool_blue'} onChange={e => onUpdate({ grade: e.target.value })} style={selectStyle}>
            {GRADE_TYPES.map(g => <option key={g} value={g}>{g.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      )}

      {/* ── Color sub-section ── */}
      <SubSection title="Color" open={colorOpen} onToggle={() => setColorOpen(o => !o)}>
        {overlay.type === 'lower_third' && <>
          <ColorInput label="Background" hex={c.background || '#000000'} onHex={v => updColor({ background: v })} opacity={c.backgroundOpacity ?? 0.65} onOpacity={v => updColor({ backgroundOpacity: v })} inputStyle={inputStyle} />
          <ColorInput label="Accent (left border)" hex={c.accent || '#3b82f6'} onHex={v => updColor({ accent: v })} inputStyle={inputStyle} />
          <ColorInput label="Primary text" hex={c.textPrimary || '#f0f0f0'} onHex={v => updColor({ textPrimary: v })} inputStyle={inputStyle} />
          <ColorInput label="Secondary text" hex={c.textSecondary || '#a0aec0'} onHex={v => updColor({ textSecondary: v })} inputStyle={inputStyle} />
        </>}
        {overlay.type === 'date_stamp' && <>
          <ColorInput label="Background" hex={c.background || '#000000'} onHex={v => updColor({ background: v })} opacity={c.backgroundOpacity ?? 0.55} onOpacity={v => updColor({ backgroundOpacity: v })} inputStyle={inputStyle} />
          <ColorInput label="Text" hex={c.textColor || '#ffffff'} onHex={v => updColor({ textColor: v })} inputStyle={inputStyle} />
        </>}
        {overlay.type === 'kinetic_text' && <>
          <ColorInput label="Text color" hex={c.textColor || '#ffffff'} onHex={v => updColor({ textColor: v })} inputStyle={inputStyle} />
        </>}
        {overlay.type === 'vignette' && (
          <ColorInput label="Vignette color" hex={c.color || '#000000'} onHex={v => updColor({ color: v })} inputStyle={inputStyle} />
        )}
        {overlay.type === 'grain' && (
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>Grain uses adaptive neutral color — no tint control.</div>
        )}
        {overlay.type === 'color_grade' && <>
          <ColorInput label="Custom tint" hex={c.tintColor || '#143c8c'} onHex={v => updColor({ tintColor: v })} inputStyle={inputStyle} />
          <SliderRow label="Tint strength" min={0.05} max={0.30} step={0.01} value={c.tintOpacity ?? 0.12} onChange={v => updColor({ tintOpacity: v })} />
        </>}
      </SubSection>

      {/* ── Font sub-section (text overlays only) ── */}
      {isTextType && (
        <SubSection title="Font" open={fontOpen} onToggle={() => setFontOpen(o => !o)}>
          <div>
            <label style={labelStyle}>Family</label>
            <select value={f.family || 'Inter'} onChange={e => updFont({ family: e.target.value })} style={selectStyle}>
              {FONT_FAMILIES.map(ff => <option key={ff} value={ff}>{ff}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {overlay.type === 'lower_third' ? <>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Size primary</label>
                <input type="number" min={8} max={120} value={f.sizePrimary || 15} onChange={e => updFont({ sizePrimary: Number(e.target.value) })} style={{ ...inputStyle, textAlign: 'center' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Size secondary</label>
                <input type="number" min={8} max={120} value={f.sizeSecondary || 12} onChange={e => updFont({ sizeSecondary: Number(e.target.value) })} style={{ ...inputStyle, textAlign: 'center' }} />
              </div>
            </> : (
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Size</label>
                <input type="number" min={8} max={120} value={f.size || (overlay.type === 'kinetic_text' ? 52 : 11)} onChange={e => updFont({ size: Number(e.target.value) })} style={{ ...inputStyle, textAlign: 'center' }} />
              </div>
            )}
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Weight</label>
              <select value={f.weight || '500'} onChange={e => updFont({ weight: e.target.value })} style={selectStyle}>
                {FONT_WEIGHTS.map(w => <option key={w.v} value={w.v}>{w.l}</option>)}
              </select>
            </div>
          </div>
          <SliderRow label="Letter spacing" min={-0.05} max={0.30} step={0.01} value={f.letterSpacing || 0} onChange={v => updFont({ letterSpacing: v })} unit="em" />
          <div>
            <label style={labelStyle}>Text transform</label>
            <select value={f.transform || 'none'} onChange={e => updFont({ transform: e.target.value })} style={selectStyle}>
              {TEXT_TRANSFORMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {overlay.type === 'lower_third' && (
            <SliderRow label="Line height" min={0.8} max={2.0} step={0.05} value={f.lineHeight || 1.2} onChange={v => updFont({ lineHeight: v })} />
          )}
        </SubSection>
      )}

      {/* ── Animation sub-section ── */}
      <SubSection title="Animation" open={animOpen} onToggle={() => setAnimOpen(o => !o)}>
        {(overlay.type === 'lower_third' || overlay.type === 'date_stamp') && <>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Enter</label>
              <select value={a.enter || 'slide_left'} onChange={e => updAnim({ enter: e.target.value })} style={selectStyle}>
                {ENTER_ANIMS_LT.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Exit</label>
              <select value={a.exit || 'slide_left'} onChange={e => updAnim({ exit: e.target.value })} style={selectStyle}>
                {ENTER_ANIMS_LT.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
              </select>
            </div>
          </div>
          <SliderRow label="Duration (frames)" min={6} max={40} step={1} value={a.duration || 18} onChange={v => updAnim({ duration: v })} />
          <div>
            <label style={labelStyle}>Easing</label>
            <select value={a.easing || 'spring'} onChange={e => updAnim({ easing: e.target.value })} style={selectStyle}>
              {EASINGS.map(e => <option key={e} value={e}>{e.replace(/_/g,' ')}</option>)}
            </select>
          </div>
        </>}
        {overlay.type === 'kinetic_text' && <>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Enter</label>
              <select value={a.enter || 'fade'} onChange={e => updAnim({ enter: e.target.value })} style={selectStyle}>
                {ENTER_ANIMS_KT.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Exit</label>
              <select value={a.exit || 'fade'} onChange={e => updAnim({ exit: e.target.value })} style={selectStyle}>
                {EXIT_ANIMS_KT.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
              </select>
            </div>
          </div>
          <SliderRow label="Duration (frames)" min={10} max={60} step={1} value={a.duration || 20} onChange={v => updAnim({ duration: v })} />
          <div>
            <label style={labelStyle}>Easing</label>
            <select value={a.easing || 'linear'} onChange={e => updAnim({ easing: e.target.value })} style={selectStyle}>
              {EASINGS.map(e => <option key={e} value={e}>{e.replace(/_/g,' ')}</option>)}
            </select>
          </div>
        </>}
        {overlay.type === 'grain' && <>
          <div>
            <label style={labelStyle}>Pattern</label>
            <select value={a.pattern || 'random'} onChange={e => updAnim({ pattern: e.target.value })} style={selectStyle}>
              {GRAIN_PATTERNS.map(p => <option key={p} value={p}>{p.replace(/_/g,' ')}</option>)}
            </select>
          </div>
        </>}
        {overlay.type === 'color_grade' && (
          <div>
            <label style={labelStyle}>Transition</label>
            <select value={a.transition || 'instant'} onChange={e => updAnim({ transition: e.target.value })} style={selectStyle}>
              {GRADE_TRANSITIONS.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
            </select>
          </div>
        )}
        {overlay.type === 'vignette' && (
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>Vignette is always present — no enter/exit animation.</div>
        )}
      </SubSection>

    </div>
  )
}

// ─── ClipMatchSection ─────────────────────────────────────────────────────────

function ClipMatchSection({ scene, clipMatch, selectedClip, onSelectClip, onConvertToImage, onManualMatch }) {
  const loading    = clipMatch?.loading ?? false
  const matches    = clipMatch?.matches ?? []
  const noMatches  = clipMatch && !loading && matches.length === 0
  const isSelected = !!selectedClip

  return (
    <div className="space-y-2">
      {scene.clip_search_tags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {scene.clip_search_tags.map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/[0.06] text-amber-400/50 border border-amber-500/[0.10]">
              {tag}
            </span>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-[11px] text-amber-400/40">
          <Loader2 size={11} className="animate-spin" />
          Searching clip library…
        </div>
      )}

      {isSelected && (
        <div className="flex items-center justify-between rounded-lg bg-amber-500/[0.06] border border-amber-500/[0.15] px-3 py-2">
          <div className="flex items-center gap-2">
            <Film size={11} className="text-amber-400/60" />
            <span className="text-[11px] text-amber-300/70 font-mono">{selectedClip.clip_id}</span>
            <span className="text-[11px] text-white/30">{selectedClip.description}</span>
          </div>
          <button onClick={() => onSelectClip(null)} className="text-[10px] text-white/20 hover:text-white/45 transition-colors">
            Change
          </button>
        </div>
      )}

      {!loading && !isSelected && matches.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-white/25 uppercase tracking-wider">
            {matches.length} match{matches.length !== 1 ? 'es' : ''} found
          </p>
          {matches.map(clip => (
            <div key={clip.clip_id} className="flex items-center justify-between rounded-lg border border-amber-500/[0.08] bg-amber-500/[0.02] hover:bg-amber-500/[0.05] px-3 py-2 transition-colors">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-amber-400/50">{clip.clip_id}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border ${MOOD_STYLES[clip.mood] || MOOD_STYLES.neutral}`}>{clip.mood}</span>
                  <span className="text-[10px] text-white/25">{clip.duration}s</span>
                </div>
                <p className="text-[11px] text-white/40 truncate">{clip.description}</p>
                <div className="flex flex-wrap gap-1">
                  {clip.tags.slice(0, 4).map(t => (
                    <span key={t} className="text-[9px] px-1 py-0 rounded bg-white/[0.04] text-white/25">{t}</span>
                  ))}
                </div>
              </div>
              <button onClick={() => onSelectClip(clip)} className="ml-3 shrink-0 text-[11px] px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg text-amber-300 transition-colors">
                Select
              </button>
            </div>
          ))}
        </div>
      )}

      {noMatches && !isSelected && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-3 space-y-2">
          <p className="text-[11px] text-white/30">No matching clips in library for these tags.</p>
          <div className="flex gap-2">
            {onManualMatch && (
              <button onClick={onManualMatch} className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg text-amber-300 transition-colors">
                <RefreshCw size={11} />
                Rematch
              </button>
            )}
            <button onClick={onConvertToImage} className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-blue-300 transition-colors">
              <ImageIcon size={11} />
              Convert to image
            </button>
          </div>
        </div>
      )}

      {!clipMatch && !loading && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-white/20 italic">No clip matches yet</span>
          {onManualMatch && (
            <button onClick={onManualMatch} className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded text-amber-300 transition-colors">
              <RefreshCw size={10} />
              Find clips
            </button>
          )}
        </div>
      )}
    </div>
  )
}
