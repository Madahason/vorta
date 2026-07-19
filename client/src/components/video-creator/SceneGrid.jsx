import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2, RefreshCw, CheckCircle, XCircle,
  ChevronDown, ChevronUp, Copy, Code2, Eye, ImageIcon, Film,
  X, Mic, Lock, Unlock, MoreVertical, Trash2, Scissors, GitMerge, Files,
  CheckCircle2,
} from 'lucide-react'
import { buildPreviewHTML } from '../../utils/buildPreviewHTML'
import { GradeSelector } from '../ui/GradeSelector'
import { MotionSelector } from '../ui/MotionSelector'
import { CompositionSelector } from '../ui/CompositionSelector'
import { InfoTip } from '../ui/Tooltip'
import { DirectionTab } from './DirectionTab'
import { hasDirectionData, pushFieldHistory } from '../../utils/sceneDirection'

const SERVER_URL = 'http://localhost:3001'

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
const GRADE_TYPES     = ['cool_blue', 'warm_amber', 'desaturated', 'neutral', 'magnates', 'high_contrast']

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
  voiceoverStatuses = {},
  onOpenVoiceover,
  onOpenStockSearch,
  overlaysVisible = false,
  onAcceptSceneOverlays,
  onRejectSceneOverlays,
  // DD-4: Direction tab data + scene-array-level actions (structural — operate on the
  // whole scenes array, so they're implemented one level up and just invoked here)
  treatment = null,
  projectId = null,
  direction = null,
  onDuplicateScene,
  onSplitScene,
  onMergeSceneWithNext,
  onDeleteScene,
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
        {scenes.map((scene, i) => {
          if (scene.shot_type === 'real_footage') {
            console.log('[CLIP DEBUG 5] real_footage scene', scene.scene_id, 'clipMatch from dict:', clipMatches[scene.scene_id])
          }
          return (
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
              onOpenStockSearch={onOpenStockSearch ? () => onOpenStockSearch(scene) : null}
              onPreview={() => onPreviewScene?.(scene)}
              voiceoverStatus={voiceoverStatuses[scene.scene_id] || null}
              onOpenVoiceover={onOpenVoiceover ? () => onOpenVoiceover(scene) : null}
              overlaysVisible={overlaysVisible}
              onAcceptSceneOverlays={onAcceptSceneOverlays ? () => onAcceptSceneOverlays(scene.scene_id) : null}
              onRejectSceneOverlays={onRejectSceneOverlays ? () => onRejectSceneOverlays(scene.scene_id) : null}
              treatment={treatment}
              projectId={projectId}
              direction={direction}
              prevScene={scenes[i - 1] || null}
              nextScene={scenes[i + 1] || null}
              isLast={i === scenes.length - 1}
              onDuplicate={onDuplicateScene ? () => onDuplicateScene(scene.scene_id) : null}
              onSplit={onSplitScene ? (caretIndex) => onSplitScene(scene.scene_id, caretIndex) : null}
              onMergeNext={onMergeSceneWithNext ? () => onMergeSceneWithNext(scene.scene_id) : null}
              onDelete={onDeleteScene ? () => onDeleteScene(scene.scene_id) : null}
            />
          )
        })}
      </div>

    </div>
  )
}

// ─── SceneCard ────────────────────────────────────────────────────────────────

function SceneCard({
  scene, index, onChange, genStatus, onRetry,
  motionStatus, onBuildComponent,
  clipMatch, selectedClip, onSelectClip, onConvertToImage, onManualMatch, onOpenLibrary, onOpenStockSearch, onPreview,
  voiceoverStatus, onOpenVoiceover,
  overlaysVisible, onAcceptSceneOverlays, onRejectSceneOverlays,
  // DD-4
  treatment, projectId, direction, prevScene, nextScene, isLast,
  onDuplicate, onSplit, onMergeNext, onDelete,
}) {
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [promptDraft,   setPromptDraft]   = useState(scene.higgsfield_prompt)
  const [codeExpanded,  setCodeExpanded]  = useState(false)
  const [copied,        setCopied]        = useState(false)

  // DD-4: per-card tab state — never persisted across reloads (fresh on every mount)
  const [activeTab, setActiveTab] = useState('visual')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [splitModalOpen, setSplitModalOpen] = useState(false)

  const locked = scene.locked === true
  const showDirectionTab = hasDirectionData(scene)

  // DD-4: "visual_concept" per-field regenerate — the only Direction-endpoint field that
  // lives on the Visual tab, since it rewrites higgsfield_prompt + subject_anchors together.
  const [regeneratingConcept, setRegeneratingConcept] = useState(false)
  const [conceptError, setConceptError] = useState(null)
  const regenerateVisualConcept = async () => {
    if (locked || regeneratingConcept) return
    setRegeneratingConcept(true)
    setConceptError(null)
    try {
      const res = await fetch(`${SERVER_URL}/api/director/scene/regenerate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          projectId, scene, field: 'visual_concept', direction,
          neighbors: { prev: prevScene?.script_excerpt || null, next: nextScene?.script_excerpt || null },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.error || `Regeneration failed (${res.status})`)
      let history = scene.field_history || {}
      Object.keys(data.patch || {}).forEach(f => {
        history = { ...history, [f]: pushFieldHistory({ field_history: history }, f, scene[f])[f] }
      })
      onChange({ ...data.patch, field_history: history })
    } catch (err) {
      setConceptError(err.message)
    } finally {
      setRegeneratingConcept(false)
    }
  }

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

  const borderClass = locked
    ? 'border-amber-400/40'
    : isGenerating
    ? 'border-blue-500/40'
    : isDone    ? 'border-green-500/30'
    : isFailed  ? 'border-red-500/30'
    : 'border-white/[0.06] hover:border-white/[0.1]'

  return (
    <div className={`rounded-xl border bg-white/[0.02] transition-colors relative ${borderClass}`}>
      {locked && (
        <div className="absolute inset-0 rounded-xl pointer-events-none" style={{ background: 'rgba(251,191,36,0.03)' }} />
      )}
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
            {scene.asset_found && (
              <span title="Asset found"><CheckCircle2 size={13} className="text-green-400" /></span>
            )}

            {/* Voiceover mic — opens VoiceoverPanel focused on this scene */}
            {onOpenVoiceover && (
              <button
                onClick={onOpenVoiceover}
                className="p-1 transition-colors"
                style={{
                  color: voiceoverStatus?.status === 'done'      ? 'rgba(74,222,128,0.65)'
                       : voiceoverStatus?.status === 'generating' ? 'rgba(59,130,246,0.65)'
                       : voiceoverStatus?.status === 'error'      ? 'rgba(239,68,68,0.65)'
                       : scene.audio_path                         ? 'rgba(74,222,128,0.50)'
                       : 'rgba(255,255,255,0.20)',
                }}
                title={
                  voiceoverStatus?.status === 'done' || scene.audio_path
                    ? `Voiceover ready${voiceoverStatus?.duration ? ` (${voiceoverStatus.duration.toFixed(1)}s)` : ''} — open panel`
                    : 'Generate voiceover for this scene'
                }
              >
                <Mic size={12} />
              </button>
            )}
            {scene.audio_duration > 0 && (
              <span className="text-[9px] font-mono" style={{ color: 'rgba(74,222,128,0.50)' }}>
                {scene.audio_duration.toFixed(1)}s
              </span>
            )}

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
              disabled={isGenerating || locked}
              className={`text-[11px] px-2 py-1 rounded-md border font-medium bg-transparent cursor-pointer focus:outline-none disabled:opacity-50 ${TYPE_STYLES[scene.shot_type]}`}
            >
              {SHOT_TYPES.map(t => (
                <option key={t} value={t} className="bg-[#1a1a1a] text-white">{TYPE_LABEL[t]}</option>
              ))}
            </select>

            {/* DD-4: lock toggle — stays clickable even when the card is locked */}
            <button
              onClick={() => onChange({ locked: !locked })}
              className="p-1 transition-colors"
              style={{ color: locked ? 'rgba(251,191,36,0.85)' : 'rgba(255,255,255,0.2)' }}
              title={locked ? 'Unlock scene' : 'Lock scene'}
            >
              {locked ? <Lock size={13} /> : <Unlock size={13} />}
            </button>

            {/* DD-4: overflow menu — Duplicate / Split / Merge with next / Delete */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="p-1 text-white/20 hover:text-white/55 transition-colors"
                title="Scene actions"
              >
                <MoreVertical size={13} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div
                    className="absolute right-0 mt-1 rounded-lg border border-white/10 bg-[#161616] shadow-xl z-20 overflow-hidden"
                    style={{ minWidth: 168 }}
                  >
                    <button
                      onClick={() => { setMenuOpen(false); onDuplicate?.() }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-white/60 hover:bg-white/[0.06] transition-colors"
                    >
                      <Files size={12} /> Duplicate
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); setSplitModalOpen(true) }}
                      disabled={locked}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-white/60 hover:bg-white/[0.06] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Scissors size={12} /> Split
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); onMergeNext?.() }}
                      disabled={isLast || locked}
                      title={isLast ? 'Last scene — nothing to merge with' : locked ? 'Unlock to merge' : undefined}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-white/60 hover:bg-white/[0.06] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <GitMerge size={12} /> Merge with next
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); setConfirmDelete(true) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-red-400/70 hover:bg-red-500/[0.08] transition-colors"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* DD-4: delete confirmation */}
        {confirmDelete && (
          <div className="ml-10 mb-3 flex items-center gap-3 rounded-lg border border-red-500/25 bg-red-500/[0.06] px-3 py-2">
            <span className="flex-1 text-[11px] text-red-300/80">Delete this scene? This cannot be undone.</span>
            <button
              onClick={() => { setConfirmDelete(false); onDelete?.() }}
              className="text-[11px] px-2.5 py-1 bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 rounded text-red-300 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-[11px] px-2.5 py-1 text-white/40 hover:text-white/70 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* DD-4: split modal */}
        {splitModalOpen && (
          <SplitModal
            scene={scene}
            onCancel={() => setSplitModalOpen(false)}
            onConfirm={(caretIndex) => { setSplitModalOpen(false); onSplit?.(caretIndex) }}
          />
        )}

        {/* ── Metadata ── */}
        <div className="flex items-center gap-3 mb-3 ml-10 text-[11px] text-white/25">
          <span>mood: <span className="text-white/40">{scene.mood}</span></span>
          <span>·</span>
          <span style={scene.duration_seconds >= 45 ? { color: 'rgba(251,191,36,0.7)' } : undefined}>{scene.duration_seconds}s</span>
          {scene.clip_search_tags?.length > 0 && (
            <><span>·</span><span className="text-amber-400/50">{scene.clip_search_tags.slice(0, 3).join(', ')}</span></>
          )}
        </div>

        {/* ── DD-4: Visual / Direction tabs — hidden entirely when the scene has no
             direction data, so a pre-DD-3 scene renders with no tab bar at all ── */}
        {showDirectionTab && (
          <div className="ml-10 flex items-center gap-1 mb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {['visual', 'direction'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="text-[11px] px-3 py-1.5 capitalize transition-colors"
                style={{
                  color: activeTab === tab ? 'white' : 'rgba(255,255,255,0.35)',
                  borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
                  background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: activeTab === tab ? 600 : 400,
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        )}

        {showDirectionTab && activeTab === 'direction' && (
          <div className="ml-10" style={{ padding: '4px 0 8px' }}>
            <DirectionTab
              scene={scene}
              onChange={onChange}
              locked={locked}
              treatment={treatment}
              projectId={projectId}
              direction={direction}
              prevScene={prevScene}
              nextScene={nextScene}
            />
          </div>
        )}

        {/* ── Content (Visual tab) — unaltered from pre-DD-4, just gated behind the tab
             when a Direction tab exists. Read-only as a whole when the scene is locked,
             except the retry button below which needs its own tooltip text. ── */}
        <div
          className="ml-10 space-y-2"
          style={{
            display: showDirectionTab && activeTab !== 'visual' ? 'none' : 'block',
            pointerEvents: locked ? 'none' : 'auto',
            opacity: locked ? 0.6 : 1,
          }}
        >

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
                      whiteSpace: 'pre',
                    }}>
                      {scene.motion_component.split('\n').slice(0, 5).join('\n')}
                    </pre>
                    <AnimatePresence>
                      {codeExpanded && (
                        <motion.div
                          key="code-expand"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          style={{ overflow: 'hidden' }}
                        >
                          <pre style={{
                            fontFamily: '"JetBrains Mono","Fira Code","Cascadia Code","Consolas",monospace',
                            fontSize: '11px', lineHeight: '1.6', padding: '0 12px 12px',
                            color: 'rgba(178,255,236,0.5)', overflowX: 'auto',
                            maxHeight: '480px', overflowY: 'auto', whiteSpace: 'pre',
                          }}>
                            {scene.motion_component.split('\n').slice(5).join('\n')}
                          </pre>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════ REAL FOOTAGE ══════════════════════════════════════════════════ */}
          {scene.shot_type === 'real_footage' && (() => {
            console.log('[MATCH DEBUG 5] card rendering scene', scene.scene_id, 'clipMatch prop:', clipMatch)
            return (
              <ClipMatchSection
                scene={scene}
                clipMatch={clipMatch}
                selectedClip={selectedClip}
                onSelectClip={onSelectClip}
                onConvertToImage={onConvertToImage}
                onManualMatch={onManualMatch}
                onOpenStockSearch={onOpenStockSearch}
              />
            )
          })()}

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
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => { setPromptDraft(scene.higgsfield_prompt); setEditingPrompt(true) }}
                    disabled={isGenerating}
                    className="flex-1 text-left text-[11px] text-white/35 bg-white/[0.02] hover:bg-white/[0.05] disabled:cursor-default rounded-lg px-3 py-2 font-mono leading-relaxed transition-colors border border-transparent hover:border-white/[0.06]"
                    title="Click to edit prompt"
                  >
                    {scene.higgsfield_prompt || <span className="text-white/15 italic">No prompt generated</span>}
                  </button>
                  {/* DD-4: per-field regenerate — rewrites higgsfield_prompt + subject_anchors */}
                  {showDirectionTab && (
                    <button
                      onClick={regenerateVisualConcept}
                      disabled={locked || regeneratingConcept}
                      title={locked ? 'Unlock to regenerate' : 'Regenerate visual concept (prompt + subject anchors)'}
                      style={{ pointerEvents: 'auto' }}
                      className="shrink-0 mt-1 flex items-center justify-center w-6 h-6 rounded-md bg-white/[0.05] border border-white/[0.12] text-white/50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <RefreshCw size={11} className={regeneratingConcept ? 'animate-spin' : undefined} />
                    </button>
                  )}
                </div>
              )}
              {conceptError && (
                <p className="text-[10.5px] text-red-400/70 mt-1">{conceptError}</p>
              )}
            </>
          )}

          {/* ════ CINEMATIC SELECTORS (image scenes) ════════════════════════════ */}
          {scene.shot_type === 'image' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>

              <GradeSelector
                value={scene.grade || 'cool_blue'}
                onChange={(grade) => onChange({ grade })}
              />

              <MotionSelector
                motion={scene.motion || { type: 'push_in', intensity: 'subtle' }}
                mood={scene.mood}
                onChange={(motion) => onChange({ motion })}
              />

              <CompositionSelector
                value={scene.composition || 'medium'}
                onChange={(composition) => onChange({ composition })}
              />

              {/* Letterbox toggle */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Letterbox Bars
                    </span>
                    <InfoTip position="right" content={
                      <div>
                        <div style={{ color: 'white', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Letterbox Bars</div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, lineHeight: 1.5 }}>Black bars create a 2.35:1 cinematic ratio — used in feature films and high-end documentaries.</div>
                        <div style={{ color: '#4ade80', fontSize: 10, marginTop: 6 }}>✓ Keep ON for image and footage scenes</div>
                        <div style={{ color: '#f87171', fontSize: 10, marginTop: 2 }}>✗ Turn OFF for motion graphics — bars cut off chart data</div>
                      </div>
                    } />
                  </div>
                  <button
                    onClick={() => onChange({ letterbox: !(scene.letterbox !== false) })}
                    style={{ width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', background: scene.letterbox !== false ? '#3b82f6' : 'rgba(255,255,255,0.15)' }}
                  >
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'white', position: 'absolute', top: 3, left: scene.letterbox !== false ? 18 : 3, transition: 'left 0.2s' }} />
                  </button>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>
                  {scene.letterbox !== false ? '✓ Cinematic 2.35:1 bars active' : 'Bars hidden — full frame'}
                </div>
              </div>
            </div>
          )}

          {/* ════ GRADE SELECTOR (real_footage scenes) ══════════════════════════ */}
          {scene.shot_type === 'real_footage' && (
            <div style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <GradeSelector
                value={scene.grade || 'cool_blue'}
                onChange={(grade) => onChange({ grade })}
              />
            </div>
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
                  disabled={locked}
                  title={locked ? 'Unlock to regenerate' : undefined}
                  style={{ pointerEvents: 'auto' }}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded text-red-400 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RefreshCw size={10} /> Retry
                </button>
              )}
            </div>
          )}

        </div>

        {/* ── Overlay suggestion / accepted badges — gated behind Visuals-complete ── */}
        {overlaysVisible && (() => {
          const suggested = (scene.overlays || []).filter(o => o.status === 'suggested')
          const accepted  = (scene.overlays || []).filter(o => o.status === 'accepted')
          if (suggested.length === 0 && accepted.length === 0) return null
          return (
            <div className="mt-3 ml-10 pt-3 border-t border-white/[0.04] flex items-center gap-3 flex-wrap">
              {suggested.length > 0 && (
                <div style={{
                  display: 'flex', gap: 4, alignItems: 'center',
                  padding: '2px 7px',
                  background: 'rgba(59,130,246,0.10)',
                  border: '1px solid rgba(59,130,246,0.25)',
                  borderRadius: 4,
                }}>
                  <span style={{ color: '#93c5fd', fontSize: 10 }}>
                    ✨ {suggested.length} suggestion{suggested.length > 1 ? 's' : ''}
                  </span>
                  {onAcceptSceneOverlays && (
                    <button
                      onClick={onAcceptSceneOverlays}
                      style={{ color: '#4ade80', fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 4px' }}
                    >
                      Accept
                    </button>
                  )}
                  {onRejectSceneOverlays && (
                    <button
                      onClick={onRejectSceneOverlays}
                      style={{ color: '#f87171', fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      Reject
                    </button>
                  )}
                </div>
              )}
              {accepted.length > 0 && (
                <div style={{
                  padding: '2px 7px',
                  background: 'rgba(34,197,94,0.08)',
                  border: '1px solid rgba(34,197,94,0.2)',
                  borderRadius: 4,
                }}>
                  <span style={{ color: '#4ade80', fontSize: 10 }}>
                    ✓ {accepted.length} overlay{accepted.length > 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>
          )
        })()}

      </div>
    </div>
  )
}

// ─── ClipMatchSection ─────────────────────────────────────────────────────────

function ClipMatchSection({ scene, clipMatch, selectedClip, onSelectClip, onConvertToImage, onManualMatch, onOpenStockSearch }) {
  const loading = clipMatch?.loading ?? false
  const matches = Array.isArray(clipMatch?.matches) ? clipMatch.matches : []

  console.log('[CLIP DEBUG 6] ClipMatchSection', scene.scene_id, 'clipMatch:', clipMatch, 'loading:', loading, 'matches:', matches.length)

  return (
    <div className="space-y-2">

      {/* Search tags */}
      {scene.clip_search_tags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {scene.clip_search_tags.map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/[0.06] text-amber-400/50 border border-amber-500/[0.10]">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-[11px] text-amber-400/40">
          <Loader2 size={11} className="animate-spin" />
          Searching clip library…
        </div>
      )}

      {/* Selected clip */}
      {!loading && selectedClip && (
        <div className="flex items-center justify-between rounded-lg bg-amber-500/[0.06] border border-amber-500/[0.15] px-3 py-2">
          <div className="flex items-center gap-2">
            <Film size={11} className="text-amber-400/60" />
            <span className="text-[11px] text-amber-300/70 font-mono">{selectedClip.clip_id || selectedClip.filename || 'clip'}</span>
            <span className="text-[11px] text-white/30">{selectedClip.title || selectedClip.description}</span>
          </div>
          <div className="flex items-center gap-2">
            {onOpenStockSearch && (
              <button onClick={onOpenStockSearch} className="text-[10px] text-blue-400/50 hover:text-blue-300 transition-colors">
                Replace stock
              </button>
            )}
            <button onClick={() => onSelectClip(null)} className="text-[10px] text-white/20 hover:text-white/45 transition-colors">
              Change
            </button>
          </div>
        </div>
      )}

      {/* Clip candidates */}
      {!loading && !selectedClip && matches.length > 0 && (
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
                <p className="text-[11px] text-white/40 truncate">{clip.title || clip.description || '—'}</p>
                {(clip.tags || []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {clip.tags.slice(0, 4).map(t => (
                      <span key={t} className="text-[9px] px-1 py-0 rounded bg-white/[0.04] text-white/25">{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => onSelectClip(clip)} className="ml-3 shrink-0 text-[11px] px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg text-amber-300 transition-colors">
                Select
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Searched but no matches */}
      {!loading && !selectedClip && clipMatch && matches.length === 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-3 space-y-2">
          <p className="text-[11px] text-white/30">No matching clips in library for these tags.</p>
          <div className="flex flex-wrap gap-2">
            {onOpenStockSearch && (
              <button onClick={onOpenStockSearch} className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-blue-300 transition-colors">
                🔍 Search stock footage
              </button>
            )}
            {onManualMatch && (
              <button onClick={onManualMatch} className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg text-amber-300 transition-colors">
                <RefreshCw size={11} />
                Rematch library
              </button>
            )}
            <button onClick={onConvertToImage} className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg text-white/40 transition-colors">
              <ImageIcon size={11} />
              Convert to image
            </button>
          </div>
        </div>
      )}

      {/* Not yet searched */}
      {!loading && !clipMatch && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-white/20 italic">No clip matches yet</span>
          <div className="flex gap-2">
            {onOpenStockSearch && (
              <button onClick={onOpenStockSearch} className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded text-blue-300 transition-colors">
                🔍 Stock footage
              </button>
            )}
            {onManualMatch && (
              <button onClick={onManualMatch} className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded text-amber-300 transition-colors">
                <RefreshCw size={10} />
                Find in library
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

// ─── DD-4: SplitModal ─────────────────────────────────────────────────────────
// A small modal for picking a caret position inside script_excerpt. Clicking anywhere in
// the text sets the split point; the two resulting halves are previewed live below.

function SplitModal({ scene, onCancel, onConfirm }) {
  const text = scene.script_excerpt || ''
  const [caret, setCaret] = useState(Math.floor(text.length / 2))
  const textRef = useRef(null)

  const pickCaretFromClick = (e) => {
    const el = textRef.current
    if (!el) return
    // Approximate: walk character offsets via a temporary range using the click x/y.
    const range = document.caretRangeFromPoint
      ? document.caretRangeFromPoint(e.clientX, e.clientY)
      : null
    if (range && el.contains(range.startContainer)) {
      // Compute the offset of range.startContainer within the full text node
      let offset = range.startOffset
      let node = el.firstChild
      let total = 0
      while (node && node !== range.startContainer) {
        total += node.textContent?.length || 0
        node = node.nextSibling
      }
      setCaret(Math.max(1, Math.min(total + offset, text.length - 1)))
    }
  }

  const left  = text.slice(0, caret).trim()
  const right = text.slice(caret).trim()
  const invalid = !left || !right

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.75)' }}
    >
      <div className="w-full rounded-xl border border-white/10 bg-[#141414] p-5" style={{ maxWidth: 560 }}>
        <div className="text-sm font-semibold text-white mb-1">Split scene {scene.scene_id}</div>
        <p className="text-[11px] text-white/40 mb-3">Click inside the text to choose where it splits.</p>

        <div
          ref={textRef}
          onClick={pickCaretFromClick}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-[13px] leading-relaxed text-white/80 cursor-text select-none"
        >
          {text.slice(0, caret)}
          <span style={{ display: 'inline-block', width: 2, height: 16, background: '#3b82f6', verticalAlign: 'middle', margin: '0 1px' }} />
          {text.slice(caret)}
        </div>

        <div className="mt-3 flex gap-3 text-[11px]">
          <div className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5">
            <div className="text-white/25 uppercase tracking-wider mb-1" style={{ fontSize: 9.5 }}>Scene A</div>
            <div className="text-white/60">{left || <em className="text-red-400/60">empty</em>}</div>
          </div>
          <div className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5">
            <div className="text-white/25 uppercase tracking-wider mb-1" style={{ fontSize: 9.5 }}>Scene B</div>
            <div className="text-white/60">{right || <em className="text-red-400/60">empty</em>}</div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="text-[12px] px-3 py-1.5 text-white/40 hover:text-white/70 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(caret)}
            disabled={invalid}
            className="text-[12px] px-4 py-1.5 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/25 rounded-lg text-blue-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Split
          </button>
        </div>
      </div>
    </div>
  )
}
