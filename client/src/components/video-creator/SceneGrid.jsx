import { useState } from 'react'
import {
  Loader2, RefreshCw, CheckCircle, XCircle, SkipForward,
  ChevronDown, ChevronUp, Copy, Code2,
} from 'lucide-react'

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

export default function SceneGrid({
  scenes,
  onScenesChange,
  sceneStatuses = {},
  onRetry,
  motionStatuses = {},
  onBuildComponent,
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
          {doneCount > 0 && (
            <span className="ml-2 text-green-400/60">· {doneCount} generated</span>
          )}
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
          />
        ))}
      </div>
    </div>
  )
}

function SceneCard({ scene, index, onChange, genStatus, onRetry, motionStatus, onBuildComponent }) {
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [promptDraft, setPromptDraft]     = useState(scene.higgsfield_prompt)
  const [codeExpanded, setCodeExpanded]   = useState(false)
  const [copied, setCopied]               = useState(false)

  const savePrompt = () => { onChange({ higgsfield_prompt: promptDraft }); setEditingPrompt(false) }
  const cancelPrompt = () => { setPromptDraft(scene.higgsfield_prompt); setEditingPrompt(false) }

  const copyCode = () => {
    navigator.clipboard.writeText(scene.motion_component)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Image generation status
  const status      = genStatus?.status || null
  const isGenerating = status === 'generating'
  const isDone       = status === 'done'
  const isFailed     = status === 'failed'
  const isPending    = status === 'pending'
  const isSkipped    = status === 'skipped'

  // Motion component build status
  const motionBuilding = motionStatus?.status === 'generating'
  const motionFailed   = motionStatus?.status === 'failed'
  const hasComponent   = !!scene.motion_component

  const borderClass = isGenerating
    ? 'border-blue-500/40'
    : isDone
      ? 'border-green-500/30'
      : isFailed
        ? 'border-red-500/30'
        : 'border-white/[0.06] hover:border-white/[0.1]'

  return (
    <div className={`rounded-xl border bg-white/[0.02] p-4 transition-colors ${borderClass}`}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <span className="text-[11px] font-mono text-white/20 mt-0.5 shrink-0 w-7">
          {String(index + 1).padStart(3, '0')}
        </span>
        <p className="flex-1 text-sm text-white/70 leading-snug">
          {scene.script_excerpt}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {/* Image generation status indicators */}
          {isPending    && <span className="text-[10px] text-white/25 font-mono">pending</span>}
          {isGenerating && <Loader2 size={12} className="animate-spin text-blue-400" />}
          {isDone       && <CheckCircle size={13} className="text-green-400" />}
          {isFailed     && <XCircle size={13} className="text-red-400" />}
          {isSkipped    && scene.shot_type !== 'motion_graphic' && (
            <SkipForward size={13} className="text-white/20" />
          )}

          <select
            value={scene.shot_type}
            onChange={e => {
              const newType = e.target.value
              onChange({ shot_type: newType, real_footage_flag: newType === 'real_footage' })
            }}
            disabled={isGenerating}
            className={`text-[11px] px-2 py-1 rounded-md border font-medium bg-transparent cursor-pointer focus:outline-none disabled:opacity-50 ${TYPE_STYLES[scene.shot_type]}`}
          >
            {SHOT_TYPES.map(t => (
              <option key={t} value={t} className="bg-[#1a1a1a] text-white">
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-3 mb-3 ml-10 text-[11px] text-white/25">
        <span>mood: <span className="text-white/40">{scene.mood}</span></span>
        <span>·</span>
        <span>{scene.duration_seconds}s</span>
        {scene.clip_search_tags?.length > 0 && (
          <>
            <span>·</span>
            <span className="text-amber-400/50">{scene.clip_search_tags.slice(0, 3).join(', ')}</span>
          </>
        )}
      </div>

      {/* Content area */}
      <div className="ml-10 space-y-2">

        {/* ── MOTION GRAPHIC ─────────────────────────────────────────────── */}
        {scene.shot_type === 'motion_graphic' && (
          <div className="space-y-2">
            {/* Template label + action button row */}
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-teal-400/50 bg-teal-500/[0.05] rounded-lg px-3 py-2 border border-teal-500/[0.12]">
                Template: <span className="font-mono">{scene.motion_graphic_type || 'TBD'}</span>
              </div>

              {/* Build / generating / (nothing when code exists) */}
              {!hasComponent && !motionBuilding && !motionFailed && (
                <button
                  onClick={() => onBuildComponent(scene)}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 rounded-lg text-teal-300 transition-colors"
                >
                  <Code2 size={11} />
                  Build Component
                </button>
              )}
              {motionBuilding && (
                <span className="flex items-center gap-1.5 text-[11px] text-teal-400/60">
                  <Loader2 size={11} className="animate-spin" />
                  Generating component…
                </span>
              )}
            </div>

            {/* Error state */}
            {motionFailed && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-3 py-2.5 flex items-start justify-between gap-3">
                <p className="text-[11px] text-red-400/80 leading-relaxed flex-1">
                  {motionStatus?.error || 'Component generation failed'}
                </p>
                <button
                  onClick={() => onBuildComponent(scene)}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded text-red-400 transition-colors shrink-0"
                >
                  <RefreshCw size={10} /> Retry
                </button>
              </div>
            )}

            {/* Generated code block */}
            {hasComponent && (
              <div className="rounded-lg border border-teal-500/[0.18] bg-black/40 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-teal-500/[0.10]">
                  <span className="text-[10px] text-teal-400/50 font-mono">SceneComponent.jsx</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={copyCode}
                      className="flex items-center gap-1 text-[10px] text-teal-400/50 hover:text-teal-300 transition-colors"
                    >
                      <Copy size={9} />
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      onClick={() => setCodeExpanded(e => !e)}
                      className="text-teal-400/40 hover:text-teal-300 transition-colors"
                    >
                      {codeExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </div>
                </div>
                <pre
                  className={`text-[10px] font-mono text-teal-100/55 leading-relaxed p-3 overflow-x-auto transition-all duration-200 ${
                    codeExpanded ? 'max-h-[32rem] overflow-y-auto' : 'max-h-[4.5rem] overflow-y-hidden'
                  }`}
                >
                  {scene.motion_component}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* ── REAL FOOTAGE skipped ────────────────────────────────────────── */}
        {scene.shot_type === 'real_footage' && isSkipped && (
          <div className="text-[11px] text-amber-400/40 bg-amber-500/[0.04] rounded-lg px-3 py-2 border border-amber-500/[0.10] flex items-center gap-2">
            <SkipForward size={11} />
            Skipped — will be matched to clip library in Phase 3
          </div>
        )}

        {/* ── PROMPT (image + real_footage) ───────────────────────────────── */}
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

        {/* ── GENERATED IMAGE PREVIEW ─────────────────────────────────────── */}
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

        {/* ── GENERATING PULSE ────────────────────────────────────────────── */}
        {isGenerating && (
          <div className="h-24 rounded-lg bg-white/[0.03] border border-blue-500/[0.15] flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin text-blue-400/60" />
            <span className="text-[11px] text-blue-400/50">Generating with Higgsfield…</span>
          </div>
        )}

        {/* ── IMAGE FAILED ────────────────────────────────────────────────── */}
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
