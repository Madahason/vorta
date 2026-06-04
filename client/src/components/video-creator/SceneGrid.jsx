import { useState } from 'react'
import {
  Loader2, RefreshCw, CheckCircle, XCircle, SkipForward,
  ChevronDown, ChevronUp, Copy, Code2, Eye, ImageIcon, Film,
} from 'lucide-react'
import { buildPreviewHTML } from '../../utils/buildPreviewHTML'
import ScenePreviewModal from './ScenePreviewModal'

// ─── Types ────────────────────────────────────────────────────────────────────

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
const SHOT_TYPES = ['image', 'motion_graphic', 'real_footage']

// ─── SceneGrid ────────────────────────────────────────────────────────────────

export default function SceneGrid({
  scenes,
  onScenesChange,
  sceneStatuses = {},
  onRetry,
  motionStatuses = {},
  onBuildComponent,
  clipMatches = {},
  onSelectClip,
  onConvertToImage,
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
            clipMatch={clipMatches[scene.scene_id] || null}
            onSelectClip={clip => onSelectClip?.(scene.scene_id, clip)}
            onConvertToImage={() => onConvertToImage?.(scene.scene_id)}
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

function SceneCard({ scene, index, onChange, genStatus, onRetry, motionStatus, onBuildComponent, clipMatch, onSelectClip, onConvertToImage, onPreview }) {
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [promptDraft, setPromptDraft]     = useState(scene.higgsfield_prompt)
  const [codeExpanded, setCodeExpanded]   = useState(false)
  const [copied, setCopied]               = useState(false)

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
  const isSkipped    = status === 'skipped'

  const motionBuilding = motionStatus?.status === 'generating'
  const motionFailed   = motionStatus?.status === 'failed'
  const hasComponent   = !!scene.motion_component

  const borderClass = isGenerating
    ? 'border-blue-500/40'
    : isDone    ? 'border-green-500/30'
    : isFailed  ? 'border-red-500/30'
    : 'border-white/[0.06] hover:border-white/[0.1]'

  return (
    <div className={`rounded-xl border bg-white/[0.02] p-4 transition-colors ${borderClass}`}>

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
          {isSkipped && scene.shot_type === 'image' && (
            <SkipForward size={13} className="text-white/20" />
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

            {/* Template label + Build/Regenerate button */}
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

            {/* Error message */}
            {motionFailed && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-3 py-2">
                <p className="text-[11px] text-red-400/70">
                  {motionStatus?.error || 'Component generation failed'}
                </p>
              </div>
            )}

            {/* Live preview + code block */}
            {hasComponent && (
              <div className="space-y-2">

                {/* ── Preview iframe ── */}
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

                {/* ── Ready badge + controls ── */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/[0.08] text-teal-400/50 border border-teal-500/[0.12]">
                    Remotion Component · Ready to use
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={copyCode}
                      className="flex items-center gap-1 text-[10px] text-teal-400/50 hover:text-teal-300 transition-colors"
                    >
                      <Copy size={9} />
                      {copied ? 'Copied!' : 'Copy Code'}
                    </button>
                    <button
                      onClick={() => setCodeExpanded(e => !e)}
                      className="flex items-center gap-1 text-[10px] text-teal-400/40 hover:text-teal-300 transition-colors"
                    >
                      {codeExpanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                      {codeExpanded ? 'Hide code' : 'Show full code'}
                    </button>
                  </div>
                </div>

                {/* ── Code block ── */}
                <div style={{
                  background: '#0d0d0d',
                  border: '1px solid rgba(20,184,166,0.2)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}>
                  <pre style={{
                    fontFamily: '"JetBrains Mono","Fira Code","Cascadia Code","Consolas",monospace',
                    fontSize: '11px',
                    lineHeight: '1.6',
                    padding: '12px',
                    color: 'rgba(178,255,236,0.5)',
                    overflowX: 'auto',
                    overflowY: codeExpanded ? 'auto' : 'hidden',
                    maxHeight: codeExpanded ? '480px' : 'none',
                    whiteSpace: 'pre',
                  }}>
                    {codeExpanded
                      ? scene.motion_component
                      : scene.motion_component.split('\n').slice(0, 5).join('\n')
                    }
                  </pre>
                </div>

              </div>
            )}
          </div>
        )}

        {/* ════ REAL FOOTAGE — clip matching ══════════════════════════════════ */}
        {scene.shot_type === 'real_footage' && (
          <ClipMatchSection
            scene={scene}
            clipMatch={clipMatch}
            onSelectClip={onSelectClip}
            onConvertToImage={onConvertToImage}
          />
        )}

        {/* ════ PROMPT (image + real_footage) ════════════════════════════════ */}
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

        {/* ════ COMPOSITION METADATA (image only) ═══════════════════════════ */}
        {scene.shot_type === 'image' && scene.motion && (
          <CompositionMetaBadges scene={scene} onChange={onChange} />
        )}

        {/* ════ GENERATED IMAGE ═══════════════════════════════════════════════ */}
        {isDone && genStatus.image_path && (
          <div className="mt-2 rounded-lg overflow-hidden border border-white/[0.08]">
            <img
              src={genStatus.image_path}
              alt={`Scene ${scene.scene_id}`}
              className="w-full object-cover max-h-48"
              loading="lazy"
            />
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
            <p className="text-[11px] text-red-400/80 leading-relaxed flex-1">
              {genStatus.error || 'Generation failed'}
            </p>
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
  )
}

// ─── ClipMatchSection ─────────────────────────────────────────────────────────

const MOOD_STYLES = {
  tense:    'bg-red-500/[0.07] text-red-400/60 border-red-500/[0.14]',
  formal:   'bg-slate-500/[0.07] text-slate-400/60 border-slate-500/[0.14]',
  intense:  'bg-orange-500/[0.07] text-orange-400/60 border-orange-500/[0.14]',
  neutral:  'bg-white/[0.04] text-white/30 border-white/[0.08]',
}

function ClipMatchSection({ scene, clipMatch, onSelectClip, onConvertToImage }) {
  const loading    = clipMatch?.loading ?? false
  const matches    = clipMatch?.matches ?? []
  const noMatches  = clipMatch && !loading && matches.length === 0
  const isSelected = !!scene.selected_clip

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

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-2 text-[11px] text-amber-400/40">
          <Loader2 size={11} className="animate-spin" />
          Searching clip library…
        </div>
      )}

      {/* Selected clip banner */}
      {isSelected && (
        <div className="flex items-center justify-between rounded-lg bg-amber-500/[0.06] border border-amber-500/[0.15] px-3 py-2">
          <div className="flex items-center gap-2">
            <Film size={11} className="text-amber-400/60" />
            <span className="text-[11px] text-amber-300/70 font-mono">{scene.selected_clip.clip_id}</span>
            <span className="text-[11px] text-white/30">{scene.selected_clip.description}</span>
          </div>
          <button
            onClick={() => onSelectClip(null)}
            className="text-[10px] text-white/20 hover:text-white/45 transition-colors"
          >
            Change
          </button>
        </div>
      )}

      {/* Clip candidates */}
      {!loading && !isSelected && matches.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-white/25 uppercase tracking-wider">
            {matches.length} match{matches.length !== 1 ? 'es' : ''} found
          </p>
          {matches.map(clip => (
            <div
              key={clip.clip_id}
              className="flex items-center justify-between rounded-lg border border-amber-500/[0.08] bg-amber-500/[0.02] hover:bg-amber-500/[0.05] px-3 py-2 transition-colors"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-amber-400/50">{clip.clip_id}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border ${MOOD_STYLES[clip.mood] || MOOD_STYLES.neutral}`}>
                    {clip.mood}
                  </span>
                  <span className="text-[10px] text-white/25">{clip.duration}s</span>
                </div>
                <p className="text-[11px] text-white/40 truncate">{clip.description}</p>
                <div className="flex flex-wrap gap-1">
                  {clip.tags.slice(0, 4).map(t => (
                    <span key={t} className="text-[9px] px-1 py-0 rounded bg-white/[0.04] text-white/25">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => onSelectClip(clip)}
                className="ml-3 shrink-0 text-[11px] px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg text-amber-300 transition-colors"
              >
                Select
              </button>
            </div>
          ))}
        </div>
      )}

      {/* No matches */}
      {noMatches && !isSelected && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-3 space-y-2">
          <p className="text-[11px] text-white/30">No matching clips in library for these tags.</p>
          <button
            onClick={onConvertToImage}
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-blue-300 transition-colors"
          >
            <ImageIcon size={11} />
            Use AI image instead
          </button>
        </div>
      )}

      {/* Not yet matched (no clipMatch data yet) */}
      {!clipMatch && !loading && (
        <div className="text-[11px] text-white/20 italic">
          Clip matching will run automatically on analysis
        </div>
      )}

    </div>
  )
}

// ─── CompositionMetaBadges ────────────────────────────────────────────────────

const MOTION_TYPES     = ['push_in', 'pull_out', 'drift_left', 'drift_right', 'drift_up', 'static']
const MOTION_INTENS    = ['subtle', 'moderate', 'strong']
const TRANSITION_TYPES = ['dissolve', 'cut', 'dip_black', 'dip_white']
const GRADE_TYPES      = ['cool_blue', 'warm_amber', 'desaturated', 'neutral']

function CompositionMetaBadges({ scene, onChange }) {
  const [editing, setEditing] = useState(null)
  const toggle = field => setEditing(e => e === field ? null : field)

  const motionType  = scene.motion?.type      || 'push_in'
  const motionInt   = scene.motion?.intensity || 'subtle'
  const motionLabel = `${motionType.replace(/_/g, ' ')} · ${motionInt}`

  const overlayLabel = (scene.overlays || []).map(o => o.type.replace(/_/g, ' ')).join(' + ')
  const transLabel   = (scene.transition_out || 'dissolve').replace(/_/g, ' ')
  const gradeLabel   = (scene.grade || 'cool_blue').replace(/_/g, ' ')

  return (
    <div className="relative flex flex-wrap items-center gap-1.5 pt-0.5">

      {/* Motion ── type + intensity picker */}
      <div className="relative">
        <button
          onClick={() => toggle('motion')}
          className="text-[10px] px-2 py-0.5 rounded bg-purple-500/[0.07] text-purple-400/55 border border-purple-500/[0.14] hover:border-purple-500/25 transition-colors"
        >
          ↔ {motionLabel}
        </button>
        {editing === 'motion' && (
          <div className="absolute left-0 top-6 z-20 bg-[#181818] border border-white/[0.10] rounded-lg p-2.5 space-y-2 shadow-xl min-w-[180px]">
            <div>
              <p className="text-[9px] text-white/25 uppercase tracking-wider mb-1.5">Type</p>
              <div className="flex flex-wrap gap-1">
                {MOTION_TYPES.map(t => (
                  <button key={t}
                    onClick={() => { onChange({ motion: { ...scene.motion, type: t } }); setEditing(null) }}
                    className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${motionType === t ? 'bg-purple-500/20 text-purple-300' : 'text-white/35 hover:text-white/65'}`}
                  >
                    {t.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[9px] text-white/25 uppercase tracking-wider mb-1.5">Intensity</p>
              <div className="flex gap-1">
                {MOTION_INTENS.map(v => (
                  <button key={v}
                    onClick={() => { onChange({ motion: { ...scene.motion, intensity: v } }); setEditing(null) }}
                    className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${motionInt === v ? 'bg-purple-500/20 text-purple-300' : 'text-white/35 hover:text-white/65'}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Overlays — display only */}
      {overlayLabel && (
        <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/[0.07] text-indigo-400/50 border border-indigo-500/[0.14]">
          ◈ {overlayLabel}
        </span>
      )}

      {/* Grade picker */}
      <div className="relative">
        <button
          onClick={() => toggle('grade')}
          className="text-[10px] px-2 py-0.5 rounded bg-orange-500/[0.07] text-orange-400/50 border border-orange-500/[0.14] hover:border-orange-500/25 transition-colors"
        >
          ◐ {gradeLabel}
        </button>
        {editing === 'grade' && (
          <div className="absolute left-0 top-6 z-20 bg-[#181818] border border-white/[0.10] rounded-lg p-2 flex flex-col gap-1 shadow-xl">
            {GRADE_TYPES.map(g => (
              <button key={g}
                onClick={() => { onChange({ grade: g }); setEditing(null) }}
                className={`text-[10px] px-2 py-0.5 rounded text-left transition-colors ${(scene.grade || 'cool_blue') === g ? 'bg-white/10 text-white/70' : 'text-white/30 hover:text-white/60'}`}
              >
                {g.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Transition picker */}
      <div className="relative">
        <button
          onClick={() => toggle('transition')}
          className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] text-white/28 border border-white/[0.07] hover:border-white/18 transition-colors"
        >
          → {transLabel}
        </button>
        {editing === 'transition' && (
          <div className="absolute left-0 top-6 z-20 bg-[#181818] border border-white/[0.10] rounded-lg p-2 flex flex-col gap-1 shadow-xl min-w-[110px]">
            {TRANSITION_TYPES.map(t => (
              <button key={t}
                onClick={() => { onChange({ transition_out: t }); setEditing(null) }}
                className={`text-[10px] px-2 py-0.5 rounded text-left transition-colors ${(scene.transition_out || 'dissolve') === t ? 'bg-white/10 text-white/70' : 'text-white/30 hover:text-white/60'}`}
              >
                {t.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
