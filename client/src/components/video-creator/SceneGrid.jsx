import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2, RefreshCw, CheckCircle, XCircle,
  ChevronDown, ChevronUp, Copy, Code2, Eye, ImageIcon, Film,
  X, Mic,
} from 'lucide-react'
import { buildPreviewHTML } from '../../utils/buildPreviewHTML'
import { GradeSelector } from '../ui/GradeSelector'
import { MotionSelector } from '../ui/MotionSelector'
import { CompositionSelector } from '../ui/CompositionSelector'
import { InfoTip } from '../ui/Tooltip'

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
}) {
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [promptDraft,   setPromptDraft]   = useState(scene.higgsfield_prompt)
  const [codeExpanded,  setCodeExpanded]  = useState(false)
  const [copied,        setCopied]        = useState(false)

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
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded text-red-400 transition-colors shrink-0"
                >
                  <RefreshCw size={10} /> Retry
                </button>
              )}
            </div>
          )}

        </div>

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
