import { useState, useRef, useEffect } from 'react'
import {
  Loader2, RefreshCw, CheckCircle, XCircle, SkipForward,
  ChevronDown, ChevronUp, Copy, Code2, Eye, ImageIcon, Film,
  Layers, X, AlignLeft, Calendar, Zap, Circle, Sparkles, Palette, Plus,
} from 'lucide-react'
import { buildPreviewHTML } from '../../utils/buildPreviewHTML'
import ScenePreviewModal from './ScenePreviewModal'

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
}) {
  const [previewIndex, setPreviewIndex] = useState(null)

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
            onPreview={() => setPreviewIndex(i)}
          />
        ))}
      </div>

      {previewIndex !== null && (
        <ScenePreviewModal
          scene={scenes[previewIndex]}
          sceneIndex={previewIndex}
          totalScenes={scenes.length}
          genStatus={sceneStatuses[scenes[previewIndex]?.scene_id] || null}
          onClose={() => setPreviewIndex(null)}
          onPrev={() => setPreviewIndex(i => Math.max(0, i - 1))}
          onNext={() => setPreviewIndex(i => Math.min(scenes.length - 1, i + 1))}
        />
      )}
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
              onSelectClip={onSelectClip}
              onConvertToImage={onConvertToImage}
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
  const [addDropdownOpen, setAddDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Close add dropdown when clicking outside
  useEffect(() => {
    const handler = e => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setAddDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const overlays = scene.overlays || []
  const existingTypes = new Set(overlays.map(o => o.type))

  const addOverlay = (type) => {
    setAddDropdownOpen(false)
    const defaults = OVERLAY_DEFAULTS[type]
    const singleton = OVERLAY_TYPES.find(o => o.type === type)?.singleton
    // Prevent duplicate singletons
    if (singleton && existingTypes.has(type)) return
    const next = [...overlays, { type, ...defaults }]
    const patch = { overlays: next }
    // Sync grade field for color_grade
    if (type === 'color_grade') patch.grade = defaults.grade
    onChange(patch)
  }

  const updateOverlay = (i, patch) => {
    const next = overlays.map((o, idx) => idx === i ? { ...o, ...patch } : o)
    const upd = { overlays: next }
    // Sync grade field when color_grade changes
    if (overlays[i]?.type === 'color_grade' && patch.grade) upd.grade = patch.grade
    onChange(upd)
  }

  const removeOverlay = (i) => {
    const next = overlays.filter((_, idx) => idx !== i)
    onChange({ overlays: next })
  }

  const panelStyle = {
    background: '#111111',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    borderBottomLeftRadius: '12px',
    borderBottomRightRadius: '12px',
    padding: '16px',
  }

  const sectionHeaderStyle = {
    fontSize: '11px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    marginBottom: '10px',
  }

  const inputStyle = {
    background: '#1a1a1a',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    color: 'rgba(255,255,255,0.75)',
    fontSize: '13px',
    padding: '5px 8px',
    outline: 'none',
    width: '100%',
  }

  const selectStyle = {
    ...inputStyle,
    cursor: 'pointer',
  }

  return (
    <div style={panelStyle}>

      {/* ── Overlays section ── */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={sectionHeaderStyle}>Overlays</span>

          {/* Add Overlay dropdown */}
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
                    <button
                      key={type}
                      onClick={() => !disabled && addOverlay(type)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        width: '100%', textAlign: 'left',
                        fontSize: '12px',
                        color: disabled ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.60)',
                        padding: '6px 10px', borderRadius: '5px',
                        background: 'transparent', cursor: disabled ? 'not-allowed' : 'pointer',
                        border: 'none',
                      }}
                      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <Icon size={12} />
                      {label}
                      {disabled && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', marginLeft: 'auto' }}>added</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Overlay list */}
        {overlays.length === 0 && (
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.20)', fontStyle: 'italic' }}>
            No overlays assigned. Use "Add Overlay" to add one.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {overlays.map((overlay, i) => (
            <OverlayRow
              key={i}
              overlay={overlay}
              scene={scene}
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
              value={scene.motion?.type || 'push_in'}
              onChange={e => onChange({ motion: { ...(scene.motion || {}), type: e.target.value } })}
              style={selectStyle}
            >
              {MOTION_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          {(scene.motion?.type || 'push_in') !== 'static' && (
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)', display: 'block', marginBottom: '4px' }}>Intensity</label>
              <select
                value={scene.motion?.intensity || 'subtle'}
                onChange={e => onChange({ motion: { ...(scene.motion || {}), intensity: e.target.value } })}
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
          value={scene.transition_out || 'dissolve'}
          onChange={e => onChange({ transition_out: e.target.value })}
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
            type="number"
            min={2} max={30}
            value={scene.duration_seconds || 5}
            onChange={e => {
              const v = Math.min(30, Math.max(2, Number(e.target.value)))
              onChange({ duration_seconds: v })
            }}
            style={{ ...inputStyle, width: '72px', textAlign: 'center' }}
          />
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.30)' }}>seconds</span>
        </div>
      </div>

    </div>
  )
}

// ─── OverlayRow ───────────────────────────────────────────────────────────────

function OverlayRow({ overlay, scene, onUpdate, onRemove, inputStyle, selectStyle }) {
  const meta = OVERLAY_TYPES.find(o => o.type === overlay.type)
  const Icon = meta?.icon || Layers

  const rowStyle = {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '8px',
    padding: '10px 12px',
  }
  const labelStyle = {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.30)',
    display: 'block',
    marginBottom: '4px',
  }
  const fieldRowStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    alignItems: 'flex-end',
  }

  return (
    <div style={rowStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>
          <Icon size={12} />
          {meta?.label || overlay.type}
        </div>
        <button
          onClick={onRemove}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.20)', padding: '2px',
            display: 'flex', alignItems: 'center',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'rgba(239,68,68,0.7)'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.20)'}
          title="Remove overlay"
        >
          <X size={12} />
        </button>
      </div>

      {/* lower_third fields */}
      {overlay.type === 'lower_third' && (
        <div style={fieldRowStyle}>
          <div style={{ flex: '1 1 160px' }}>
            <label style={labelStyle}>Line 1</label>
            <input type="text" value={overlay.line1 || ''} placeholder="Steve Jobs"
              onChange={e => onUpdate({ line1: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label style={labelStyle}>Line 2</label>
            <input type="text" value={overlay.line2 || ''} placeholder="Apple CEO · 1997"
              onChange={e => onUpdate({ line2: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ flex: '0 0 90px' }}>
            <label style={labelStyle}>Appear at (s)</label>
            <input type="number" min={0} max={scene.duration_seconds || 10} step={0.1}
              value={overlay.appearAt ?? 0.7}
              onChange={e => onUpdate({ appearAt: parseFloat(e.target.value) })}
              style={{ ...inputStyle, textAlign: 'center' }} />
          </div>
        </div>
      )}

      {/* date_stamp fields */}
      {overlay.type === 'date_stamp' && (
        <div style={fieldRowStyle}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={labelStyle}>Text</label>
            <input type="text" value={overlay.text || ''} placeholder="San Francisco · 2007"
              onChange={e => onUpdate({ text: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ flex: '0 0 90px' }}>
            <label style={labelStyle}>Appear at (s)</label>
            <input type="number" min={0} max={scene.duration_seconds || 10} step={0.1}
              value={overlay.appearAt ?? 0.7}
              onChange={e => onUpdate({ appearAt: parseFloat(e.target.value) })}
              style={{ ...inputStyle, textAlign: 'center' }} />
          </div>
        </div>
      )}

      {/* kinetic_text fields */}
      {overlay.type === 'kinetic_text' && (
        <div style={fieldRowStyle}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={labelStyle}>Text (max 8 words)</label>
            <input type="text" value={overlay.text || ''} placeholder="$0 to $3 trillion"
              onChange={e => onUpdate({ text: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ flex: '0 0 110px' }}>
            <label style={labelStyle}>Style</label>
            <select value={overlay.style || 'center'} onChange={e => onUpdate({ style: e.target.value })} style={selectStyle}>
              <option value="center">center</option>
              <option value="bottom">bottom</option>
            </select>
          </div>
          <div style={{ flex: '0 0 90px' }}>
            <label style={labelStyle}>Appear at (s)</label>
            <input type="number" min={0} max={scene.duration_seconds || 10} step={0.1}
              value={overlay.appearAt ?? 1.0}
              onChange={e => onUpdate({ appearAt: parseFloat(e.target.value) })}
              style={{ ...inputStyle, textAlign: 'center' }} />
          </div>
        </div>
      )}

      {/* vignette fields */}
      {overlay.type === 'vignette' && (
        <div style={fieldRowStyle}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Intensity — {(overlay.intensity ?? 0.45).toFixed(2)}</label>
            <input
              type="range" min={0.1} max={0.8} step={0.05}
              value={overlay.intensity ?? 0.45}
              onChange={e => onUpdate({ intensity: parseFloat(e.target.value) })}
              style={{ width: '100%', accentColor: '#3b82f6', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'rgba(255,255,255,0.20)', marginTop: '2px' }}>
              <span>0.10</span><span>0.80</span>
            </div>
          </div>
        </div>
      )}

      {/* grain fields */}
      {overlay.type === 'grain' && (
        <div style={fieldRowStyle}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Intensity — {(overlay.intensity ?? 0.12).toFixed(2)}</label>
            <input
              type="range" min={0.05} max={0.30} step={0.01}
              value={overlay.intensity ?? 0.12}
              onChange={e => onUpdate({ intensity: parseFloat(e.target.value) })}
              style={{ width: '100%', accentColor: '#3b82f6', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'rgba(255,255,255,0.20)', marginTop: '2px' }}>
              <span>0.05</span><span>0.30</span>
            </div>
          </div>
        </div>
      )}

      {/* color_grade fields */}
      {overlay.type === 'color_grade' && (
        <div style={fieldRowStyle}>
          <div style={{ flex: '0 0 180px' }}>
            <label style={labelStyle}>Grade</label>
            <select value={overlay.grade || 'cool_blue'} onChange={e => onUpdate({ grade: e.target.value })} style={selectStyle}>
              {GRADE_TYPES.map(g => <option key={g} value={g}>{g.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </div>
      )}

    </div>
  )
}

// ─── ClipMatchSection ─────────────────────────────────────────────────────────

function ClipMatchSection({ scene, clipMatch, onSelectClip, onConvertToImage }) {
  const loading   = clipMatch?.loading ?? false
  const matches   = clipMatch?.matches ?? []
  const noMatches = clipMatch && !loading && matches.length === 0
  const isSelected = !!scene.selected_clip

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
            <span className="text-[11px] text-amber-300/70 font-mono">{scene.selected_clip.clip_id}</span>
            <span className="text-[11px] text-white/30">{scene.selected_clip.description}</span>
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
          <button onClick={onConvertToImage} className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-blue-300 transition-colors">
            <ImageIcon size={11} />
            Convert to image
          </button>
        </div>
      )}

      {!clipMatch && !loading && (
        <div className="text-[11px] text-white/20 italic">Clip matching will run automatically on analysis</div>
      )}
    </div>
  )
}
