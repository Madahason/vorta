import { useState, useMemo, useRef } from 'react'
import { RotateCcw, Loader2, GripVertical, Upload, RefreshCw } from 'lucide-react'
import { calculateDocumentaryDuration } from '@remotion-compositions/compositions/Documentary'

const SERVER_URL = 'http://localhost:3001'

// Mirrors constants in remotion/src/compositions/Documentary.jsx (DIP_FADE = DIP_FRAMES/2)
// and server/services/frameMath.js — keep these three in sync if the transition timing changes.
const FPS                      = 30
const NARRATION_BUFFER_SECONDS = 0.8
const MAX_SCENE_SECONDS        = 8.0
const DIP_FADE                 = 9
const DIP_MIN_SECONDS          = (DIP_FADE * 2) / FPS // 0.6s

const TRANSITIONS = [
  { value: 'dissolve',  label: 'Dissolve' },
  { value: 'cut',       label: 'Cut' },
  { value: 'dip_black', label: 'Dip to black' },
  { value: 'dip_white', label: 'Dip to white' },
]

const DEFAULT_MIX = { narration: 1.0, music: 0.12, ambient: 0.06 }
const SNAPSHOT_KEY = 'vorta_finetune_snapshot'

function minDurationFor(scene) {
  const buffer = scene.audio_duration > 0 ? scene.audio_duration : 0
  return parseFloat((buffer + NARRATION_BUFFER_SECONDS).toFixed(2))
}

function canUseDip(durationSeconds) {
  return (durationSeconds || 0) >= DIP_MIN_SECONDS
}

function readSnapshot() {
  try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY)) || {} } catch { return {} }
}
function writeSnapshot(snap) {
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap)) } catch { /* quota */ }
}

export function FineTuneStep({
  scenes, onScenesChange, sceneStatuses = {}, imagePaths = {}, selectedClips = {},
  projectId, wizard,
}) {
  // Snapshot original per-scene values the first time this step is ever entered.
  // Persisted to localStorage so "Revert to generated" survives navigating away and back.
  // `__order` is a reserved key (scene_ids are numeric-string like "001", never "__order")
  // holding the original array order, for the whole-step "Revert order" control.
  const [snapshot] = useState(() => {
    const existing = readSnapshot()
    const next = { ...existing }
    let changed = false
    scenes.forEach(s => {
      if (!next[s.scene_id]) {
        next[s.scene_id] = {
          duration_seconds:   s.duration_seconds,
          transition_out:     s.transition_out || 'dissolve',
          audio_mix_override: s.audio_mix_override || null,
        }
        changed = true
      }
    })
    if (!next.__order) {
      next.__order = scenes.map(s => s.scene_id)
      changed = true
    }
    if (changed) writeSnapshot(next)
    return next
  })

  const [dragIndex,    setDragIndex]    = useState(null)
  const [overIndex,    setOverIndex]    = useState(null)
  const [isReordering, setIsReordering] = useState(false)
  const [reorderError, setReorderError] = useState(null)

  const totalFrames  = useMemo(() => calculateDocumentaryDuration(scenes, 30), [scenes])
  const totalSeconds = totalFrames / 30

  const currentOrder = scenes.map(s => s.scene_id)
  const orderChanged = snapshot.__order && JSON.stringify(currentOrder) !== JSON.stringify(snapshot.__order)

  // Optimistically applies a new scene order locally (so the duration readout and the
  // sticky mini-player above update immediately), then persists it. Rolls back on failure.
  const applyOrder = async (nextScenes) => {
    const prevScenes = scenes
    onScenesChange(nextScenes)
    setIsReordering(true); setReorderError(null)
    try {
      const res = await fetch(`${SERVER_URL}/api/scenes/reorder`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId, order: nextScenes.map(s => s.scene_id) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Reorder failed')
    } catch (err) {
      onScenesChange(prevScenes) // roll back the optimistic update
      setReorderError(err.message)
    } finally {
      setIsReordering(false)
    }
  }

  const handleDrop = (fromIndex, toIndex) => {
    if (fromIndex === null || fromIndex === toIndex) return
    const next = [...scenes]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    applyOrder(next)
  }

  const revertOrder = () => {
    const byId = new Map(scenes.map(s => [s.scene_id, s]))
    const restored = (snapshot.__order || []).map(id => byId.get(id)).filter(Boolean)
    if (restored.length !== scenes.length) {
      setReorderError('Cannot revert order — the set of scenes has changed since Fine-Tune was opened.')
      return
    }
    applyOrder(restored)
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: 0 }}>Fine-Tune Scenes</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 6 }}>
            Trim durations, adjust transitions, and balance audio per scene. Entirely optional — skip straight to Export any time.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={() => wizard.goBack()} className="vorta-btn vorta-btn-ghost">← Back</button>
          <button
            onClick={() => { wizard.markComplete('finetune'); wizard.goNext() }}
            className="vorta-btn vorta-btn-primary"
          >
            Continue to Export →
          </button>
        </div>
      </div>

      {scenes.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16, padding: '10px 14px',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
              {scenes.length} scene{scenes.length !== 1 ? 's' : ''} · {totalSeconds.toFixed(1)}s total (transitions included)
            </span>
            {isReordering && <Loader2 size={12} className="animate-spin text-blue-400" />}
          </div>
          {orderChanged && (
            <RevertButton onClick={revertOrder} label="Revert order to generated" />
          )}
        </div>
      )}

      {reorderError && (
        <div className="text-[11px] text-red-400/80 bg-red-500/[0.06] border border-red-500/20 rounded px-3 py-2 mb-3">
          {reorderError}
        </div>
      )}

      {scenes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.25)' }}>
          No scenes yet — go back and analyze a script first.
        </div>
      ) : (
        <div className="space-y-3">
          {scenes.map((scene, i) => (
            <FineTuneCard
              key={scene.scene_id}
              isDragging={dragIndex === i}
              isDragOver={overIndex === i && dragIndex !== null && dragIndex !== i}
              onDragHandleStart={() => setDragIndex(i)}
              onDragHandleEnd={() => { setDragIndex(null); setOverIndex(null) }}
              onCardDragOver={() => setOverIndex(i)}
              onCardDrop={() => { handleDrop(dragIndex, i); setDragIndex(null); setOverIndex(null) }}
              index={i}
              scene={scene}
              snapshot={snapshot[scene.scene_id]}
              thumbnail={
                scene.shot_type === 'image'
                  // scene.image_path first — a Fine-Tune swap/regenerate sets this directly
                  // and must be reflected immediately, ahead of the original generation-time
                  // sceneStatuses/imagePaths snapshot.
                  ? (scene.image_path || sceneStatuses[scene.scene_id]?.image_path || imagePaths[scene.scene_id])
                  : null
              }
              clip={selectedClips[scene.scene_id] || null}
              projectId={projectId}
              onSceneUpdate={(updated) => {
                onScenesChange(scenes.map(s => s.scene_id === scene.scene_id ? { ...s, ...updated } : s))
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FineTuneCard({
  index, scene, snapshot, thumbnail, clip, projectId, onSceneUpdate,
  isDragging, isDragOver, onDragHandleStart, onDragHandleEnd, onCardDragOver, onCardDrop,
}) {
  const min = minDurationFor(scene)
  const max = MAX_SCENE_SECONDS

  const [duration,    setDuration]    = useState(scene.duration_seconds ?? min)
  const [transition,  setTransition]  = useState(scene.transition_out || 'dissolve')
  const [mix,         setMix]         = useState({ ...DEFAULT_MIX, ...(scene.audio_mix_override || {}) })
  const [savingField, setSavingField] = useState(null) // 'duration' | 'transition' | 'mix' | null
  const [saveError,   setSaveError]   = useState(null)
  const [imageAction,  setImageAction]  = useState(null) // 'uploading' | 'regenerating' | null
  const [imageError,   setImageError]   = useState(null)
  const fileInputRef = useRef(null)

  const durationError = duration < min
    ? `Must be at least ${min}s to preserve the narration-sync buffer (audio ${(scene.audio_duration || 0).toFixed(1)}s + 0.8s)`
    : duration > max
      ? `Must be at most ${max}s`
      : null

  const transitionError = (transition === 'dip_black' || transition === 'dip_white') && !canUseDip(duration)
    ? `Scene must be at least ${DIP_MIN_SECONDS.toFixed(2)}s long for a dip transition — increase duration or pick another transition.`
    : null

  async function patchScene(body) {
    const res  = await fetch(`${SERVER_URL}/api/scenes/${scene.scene_id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ projectId, ...body }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Update failed')
    return data.scene
  }

  const commitDuration = async () => {
    if (durationError) return
    setSavingField('duration'); setSaveError(null)
    try {
      const updated = await patchScene({ duration_seconds: duration })
      onSceneUpdate(updated)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSavingField(null)
    }
  }

  const commitTransition = async (next) => {
    setTransition(next)
    const blocked = (next === 'dip_black' || next === 'dip_white') && !canUseDip(duration)
    if (blocked) return // inline warning shown below — nothing persisted
    setSavingField('transition'); setSaveError(null)
    try {
      const updated = await patchScene({ transition_out: next })
      onSceneUpdate(updated)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSavingField(null)
    }
  }

  const commitMix = async (nextMix) => {
    setSavingField('mix'); setSaveError(null)
    try {
      const updated = await patchScene({ audio_mix_override: nextMix })
      onSceneUpdate(updated)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSavingField(null)
    }
  }

  const revertField = async (field) => {
    if (!snapshot) return
    setSavingField(field); setSaveError(null)
    try {
      if (field === 'duration') {
        const updated = await patchScene({ duration_seconds: snapshot.duration_seconds })
        setDuration(updated.duration_seconds)
        onSceneUpdate(updated)
      } else if (field === 'transition') {
        const updated = await patchScene({ transition_out: snapshot.transition_out })
        setTransition(updated.transition_out || 'dissolve')
        onSceneUpdate(updated)
      } else if (field === 'mix') {
        const updated = await patchScene({ audio_mix_override: snapshot.audio_mix_override || null })
        setMix({ ...DEFAULT_MIX, ...(updated.audio_mix_override || {}) })
        onSceneUpdate(updated)
      }
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSavingField(null)
    }
  }

  const handleImageUpload = async (fileList) => {
    const uploadFile = fileList?.[0]
    if (!uploadFile) return
    setImageAction('uploading'); setImageError(null)
    try {
      const formData = new FormData()
      formData.append('image', uploadFile)
      formData.append('projectId', projectId)
      const res  = await fetch(`${SERVER_URL}/api/images/${scene.scene_id}/replace`, {
        method: 'POST',
        body:   formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      onSceneUpdate({ image_path: data.image_path })
    } catch (err) {
      setImageError(err.message)
    } finally {
      setImageAction(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRegenerate = async () => {
    setImageAction('regenerating'); setImageError(null)
    try {
      const res  = await fetch(`${SERVER_URL}/api/higgsfield/regenerate/${scene.scene_id}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Regeneration failed')
      onSceneUpdate({ image_path: data.image_path })
    } catch (err) {
      setImageError(err.message)
    } finally {
      setImageAction(null)
    }
  }

  const durationChanged   = snapshot && duration !== snapshot.duration_seconds
  const transitionChanged = snapshot && transition !== (snapshot.transition_out || 'dissolve')
  const mixChanged         = snapshot && JSON.stringify(mix) !== JSON.stringify({ ...DEFAULT_MIX, ...(snapshot.audio_mix_override || {}) })

  return (
    <div
      onDragOver={e => { e.preventDefault(); onCardDragOver?.() }}
      onDrop={e => { e.preventDefault(); onCardDrop?.() }}
      className="rounded-xl border bg-white/[0.02] transition-colors"
      style={{
        opacity: isDragging ? 0.4 : 1,
        borderColor: isDragOver ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.06)',
        borderStyle: isDragOver ? 'dashed' : 'solid',
      }}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <span
            draggable
            onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragHandleStart?.() }}
            onDragEnd={() => onDragHandleEnd?.()}
            className="text-white/20 hover:text-white/55 mt-0.5 shrink-0 select-none"
            style={{ cursor: 'grab', touchAction: 'none' }}
            title="Drag to reorder"
          >
            <GripVertical size={14} />
          </span>
          <span className="text-[11px] font-mono text-white/20 mt-0.5 shrink-0 w-7">
            {String(index + 1).padStart(3, '0')}
          </span>
          <p className="flex-1 text-sm text-white/70 leading-snug">{scene.script_excerpt}</p>
        </div>

        <div className="ml-10 flex gap-4">
          {/* Thumbnail + image swap/regenerate */}
          <div className="shrink-0 w-40 flex flex-col gap-2">
            <div
              className="w-40 rounded-lg overflow-hidden border border-white/[0.08] bg-black/40 flex items-center justify-center"
              style={{ aspectRatio: '16/9' }}
            >
              {thumbnail ? (
                <img src={thumbnail} alt={`Scene ${scene.scene_id}`} className="w-full h-full object-cover" loading="lazy" />
              ) : clip ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-amber-400/50 text-[10px] gap-1 p-2 text-center">
                  <span>🎞</span>
                  <span className="truncate w-full">{clip.filename || clip.title || 'footage'}</span>
                </div>
              ) : (
                <span className="text-white/15 text-[10px] px-2 text-center">
                  {scene.shot_type === 'motion_graphic' ? 'motion graphic' : 'no preview yet'}
                </span>
              )}
            </div>

            {scene.shot_type === 'image' && (
              <div className="space-y-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  onChange={e => handleImageUpload(e.target.files)}
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={imageAction !== null}
                    className="flex-1 flex items-center justify-center gap-1 text-[10px] px-2 py-1.5 bg-white/[0.05] hover:bg-white/[0.09] disabled:opacity-40 border border-white/[0.1] rounded text-white/60 transition-colors"
                    title="Upload a replacement image for this scene"
                  >
                    {imageAction === 'uploading' ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
                    Swap
                  </button>
                  <button
                    onClick={handleRegenerate}
                    disabled={imageAction !== null}
                    className="flex-1 flex items-center justify-center gap-1 text-[10px] px-2 py-1.5 bg-white/[0.05] hover:bg-white/[0.09] disabled:opacity-40 border border-white/[0.1] rounded text-white/60 transition-colors"
                    title="Regenerate this scene's image with Higgsfield"
                  >
                    {imageAction === 'regenerating' ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                    Regen
                  </button>
                </div>
                {imageAction === 'regenerating' && (
                  <div className="text-[9px] text-white/25 leading-tight">Can take a few minutes…</div>
                )}
                {imageError && (
                  <div className="text-[9px] text-red-400/80 leading-tight">{imageError}</div>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-4">
            {/* Generated narration */}
            <div>
              <FieldLabel>Generated Narration</FieldLabel>
              <div className="mt-1">
                {scene.audio_path ? (
                  <div className="flex items-center gap-2">
                    <audio controls src={scene.audio_path} style={{ height: 28, maxWidth: 260 }} />
                    <span className="text-[10px] text-white/25 font-mono">
                      {scene.audio_duration ? `${scene.audio_duration.toFixed(1)}s` : ''}
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] text-white/20 italic">No narration generated yet</p>
                )}
              </div>
            </div>

            {/* Duration trim */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <FieldLabel>Duration</FieldLabel>
                <div className="flex items-center gap-2">
                  {savingField === 'duration' && <Loader2 size={11} className="animate-spin text-blue-400" />}
                  {durationChanged && <RevertButton onClick={() => revertField('duration')} />}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={min} max={max} step={0.1}
                  value={Math.min(Math.max(duration, min), max)}
                  onChange={e => setDuration(parseFloat(e.target.value))}
                  onMouseUp={commitDuration}
                  onTouchEnd={commitDuration}
                  style={{ flex: 1, accentColor: '#3b82f6' }}
                />
                <input
                  type="number"
                  min={min} max={max} step={0.1}
                  value={duration}
                  onChange={e => setDuration(parseFloat(e.target.value) || 0)}
                  onBlur={commitDuration}
                  className="w-16 bg-white/[0.05] border border-white/[0.12] rounded px-2 py-1 text-[11px] text-white/80 text-right"
                />
                <span className="text-[10px] text-white/25">s</span>
              </div>
              <div className="text-[10px] text-white/20 mt-1">Range: {min}s – {max}s</div>
              {durationError && <div className="text-[10px] text-red-400/80 mt-1">{durationError}</div>}
            </div>

            {/* Transition */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <FieldLabel>Transition Out</FieldLabel>
                <div className="flex items-center gap-2">
                  {savingField === 'transition' && <Loader2 size={11} className="animate-spin text-blue-400" />}
                  {transitionChanged && <RevertButton onClick={() => revertField('transition')} />}
                </div>
              </div>
              <select
                value={transition}
                onChange={e => commitTransition(e.target.value)}
                className="text-[11px] px-2 py-1.5 rounded-md border border-white/[0.12] bg-white/[0.05] text-white/70 focus:outline-none"
              >
                {TRANSITIONS.map(t => (
                  <option key={t.value} value={t.value} className="bg-[#1a1a1a] text-white">{t.label}</option>
                ))}
              </select>
              {transitionError && <div className="text-[10px] text-red-400/80 mt-1">{transitionError}</div>}
            </div>

            {/* Audio mix override */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <FieldLabel>Audio Mix Override</FieldLabel>
                <div className="flex items-center gap-2">
                  {savingField === 'mix' && <Loader2 size={11} className="animate-spin text-blue-400" />}
                  {mixChanged && <RevertButton onClick={() => revertField('mix')} />}
                </div>
              </div>
              <div className="space-y-2">
                {['narration', 'music', 'ambient'].map(key => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-[10px] text-white/30 w-16 shrink-0 capitalize">{key}</span>
                    <input
                      type="range"
                      min={0} max={1} step={0.01}
                      value={mix[key]}
                      onChange={e => setMix(m => ({ ...m, [key]: parseFloat(e.target.value) }))}
                      onMouseUp={() => commitMix(mix)}
                      onTouchEnd={() => commitMix(mix)}
                      style={{ flex: 1, accentColor: '#3b82f6' }}
                    />
                    <span className="text-[10px] text-white/25 font-mono w-9 text-right">{mix[key].toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-white/15 mt-1">
                Narration volume applies at render. Music/ambient tracks aren't wired into the pipeline yet — values are saved for a future phase.
              </div>
            </div>

            {saveError && (
              <div className="text-[11px] text-red-400/80 bg-red-500/[0.06] border border-red-500/20 rounded px-2 py-1.5">
                {saveError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function FieldLabel({ children }) {
  return <span className="text-[10px] text-white/40 uppercase tracking-wider">{children}</span>
}

function RevertButton({ onClick, label = 'Revert to generated' }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors">
      <RotateCcw size={10} /> {label}
    </button>
  )
}
