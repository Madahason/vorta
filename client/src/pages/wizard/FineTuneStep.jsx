import { Fragment, useState, useMemo, useRef } from 'react'
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
// FT-4: mirrors BOUNDARY_SAFETY_MARGIN_SECONDS in server/services/frameMath.js and
// remotion/src/compositions/Documentary.jsx.
const BOUNDARY_SAFETY_MARGIN_SECONDS = 0.2

const TRANSITIONS = [
  { value: 'dissolve',  label: 'Dissolve' },
  { value: 'cut',       label: 'Cut' },
  { value: 'dip_black', label: 'Dip to black' },
  { value: 'dip_white', label: 'Dip to white' },
  // FT-6: renders via the exact same hard-cut path as 'cut' in Documentary.jsx — this is a
  // separate dropdown entry only so it displays correctly and so an accepted/manually-picked
  // "match" selection isn't visually indistinguishable from "cut".
  { value: 'match',     label: 'Match Cut' },
]

const LAYOUTS = [
  { value: 'single',           label: 'Single' },
  { value: 'split_horizontal', label: 'Split Horizontal' },
  { value: 'split_vertical',   label: 'Split Vertical' },
]

const DEFAULT_MIX = { narration: 1.0, music: 0.12, ambient: 0.06 }
const SNAPSHOT_KEY = 'vorta_finetune_snapshot'
// Script editing: session-level (not per-scene) choice between regenerating narration
// automatically on every script save vs. an explicit per-scene "Regenerate Voice" button.
const AUTO_REGEN_KEY = 'vorta_finetune_auto_regenerate'

function minDurationFor(scene) {
  const buffer = scene.audio_duration > 0 ? scene.audio_duration : 0
  return parseFloat((buffer + NARRATION_BUFFER_SECONDS).toFixed(2))
}

function canUseDip(durationSeconds) {
  return (durationSeconds || 0) >= DIP_MIN_SECONDS
}

function maxBoundaryOffset(outgoingScene, nextScene) {
  const bound = Math.min(
    Number(outgoingScene?.audio_duration) || 0,
    Number(nextScene?.audio_duration) || 0
  ) - BOUNDARY_SAFETY_MARGIN_SECONDS
  return Math.max(0, parseFloat(bound.toFixed(2)))
}

// FT-9: chapter numbers per scene index. Mirrors deriveChapters/resolveChapterMap in
// server/services/frameMath.js — keep the two in sync. Persisted scene.chapter wins once
// every scene has one (set at analysis time, or backfilled by the chapter-pacing route's
// first run); otherwise derive from dip_black boundaries (claude.js's own definition of a
// chapter break). Persistence matters because montage sets transition_out: 'cut', which can
// erase the dip_black that ended a chapter and would otherwise renumber on re-derivation.
function chapterNumbersFor(scenes) {
  const allPersisted = scenes.length > 0 && scenes.every(
    s => Number.isInteger(s.chapter) && s.chapter >= 1
  )
  if (allPersisted) return scenes.map(s => s.chapter)
  let chapter = 1
  return scenes.map((s, i) => {
    const current = chapter
    if (s.transition_out === 'dip_black' && i < scenes.length - 1) chapter += 1
    return current
  })
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
          pacing:             s.pacing || 'standard',
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

  // Script editing mode toggle — a Fine-Tune session setting, persisted across visits.
  // Default: auto-regenerate on save.
  const [autoRegenerate, setAutoRegenerate] = useState(() => {
    try {
      const saved = localStorage.getItem(AUTO_REGEN_KEY)
      return saved === null ? true : saved === 'true'
    } catch { return true }
  })
  const toggleAutoRegenerate = () => {
    setAutoRegenerate(v => {
      try { localStorage.setItem(AUTO_REGEN_KEY, String(!v)) } catch { /* quota */ }
      return !v
    })
  }

  const totalFrames  = useMemo(() => calculateDocumentaryDuration(scenes, 30), [scenes])
  const totalSeconds = totalFrames / 30

  // FT-9: chapter number for each scene index, for the chapter headers + montage control.
  const chapterNumbers = useMemo(() => chapterNumbersFor(scenes), [scenes])

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

  // ── FT-5: action cut pacing preset — multi-select + bulk apply ─────────────
  const [selectMode,   setSelectMode]   = useState(false)
  const [selectedIds,  setSelectedIds]  = useState(() => new Set())
  const [anchorIndex,  setAnchorIndex]  = useState(null)
  const [pacingSaving, setPacingSaving] = useState(false)
  const [pacingError,  setPacingError]  = useState(null)

  const toggleSelectMode = () => {
    setSelectMode(v => !v)
    setSelectedIds(new Set())
    setAnchorIndex(null)
    setPacingError(null)
  }

  // Plain click selects just that scene; shift-click extends a contiguous range from the
  // last plain-clicked anchor — classic file-explorer range select, which inherently
  // guarantees contiguity without needing to validate or auto-fill gaps.
  const handleSelectClick = (shiftKey, index, sceneId) => {
    if (shiftKey && anchorIndex !== null) {
      const lo = Math.min(anchorIndex, index)
      const hi = Math.max(anchorIndex, index)
      setSelectedIds(new Set(scenes.slice(lo, hi + 1).map(s => s.scene_id)))
      return
    }
    setSelectedIds(prev => {
      if (prev.size === 1 && prev.has(sceneId)) {
        setAnchorIndex(null)
        return new Set()
      }
      return new Set([sceneId])
    })
    setAnchorIndex(index)
  }

  // Boundaries entirely inside the current selection that have a manual FT-4 offset —
  // shown as an up-front warning before the user commits, since applying action cut will
  // reset them (hard cuts don't bleed audio).
  const inRangeManualBoundaries = scenes.filter((s, idx) => {
    if (!selectedIds.has(s.scene_id) || !s.is_manual_offset) return false
    const next = scenes[idx + 1]
    return next && selectedIds.has(next.scene_id)
  })

  const applyActionCut = async () => {
    setPacingSaving(true); setPacingError(null)
    try {
      const res = await fetch(`${SERVER_URL}/api/scenes/pacing`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId, scene_ids: [...selectedIds], pacing: 'action' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action cut failed')
      const byId = new Map(data.scenes.map(s => [s.scene_id, s]))
      onScenesChange(scenes.map(s => byId.has(s.scene_id) ? { ...s, ...byId.get(s.scene_id) } : s))
      setSelectedIds(new Set())
      setAnchorIndex(null)
    } catch (err) {
      setPacingError(err.message)
    } finally {
      setPacingSaving(false)
    }
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
          {scenes.length > 1 && (
            <button
              onClick={toggleSelectMode}
              className={selectMode ? 'vorta-btn vorta-btn-primary' : 'vorta-btn vorta-btn-ghost'}
            >
              {selectMode ? 'Done Selecting' : 'Select Scenes'}
            </button>
          )}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label
              className="flex items-center gap-2 cursor-pointer select-none"
              title="On: saving a scene's script immediately regenerates its narration. Off: saving only marks the voice out of sync — regenerate per scene when ready."
            >
              <input
                type="checkbox"
                checked={autoRegenerate}
                onChange={toggleAutoRegenerate}
                style={{ width: 13, height: 13, accentColor: '#3b82f6' }}
              />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                Auto-regenerate voice on save
              </span>
            </label>
            {orderChanged && (
              <RevertButton onClick={revertOrder} label="Revert order to generated" />
            )}
          </div>
        </div>
      )}

      {reorderError && (
        <div className="text-[11px] text-red-400/80 bg-red-500/[0.06] border border-red-500/20 rounded px-3 py-2 mb-3">
          {reorderError}
        </div>
      )}

      {selectMode && selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          marginBottom: 16, padding: '10px 14px',
          background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8,
        }}>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
              {selectedIds.size} scene{selectedIds.size !== 1 ? 's' : ''} selected
            </div>
            {inRangeManualBoundaries.length > 0 && (
              <div style={{ fontSize: 10, color: 'rgba(251,191,36,0.8)', marginTop: 2 }}>
                {inRangeManualBoundaries.length} manual J/L-cut boundary offset{inRangeManualBoundaries.length !== 1 ? 's' : ''} in this range will be reset — hard cuts don't bleed audio.
              </div>
            )}
            {pacingError && (
              <div style={{ fontSize: 10, color: 'rgba(248,113,113,0.85)', marginTop: 2 }}>{pacingError}</div>
            )}
          </div>
          <button
            onClick={applyActionCut}
            disabled={pacingSaving}
            className="vorta-btn vorta-btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
          >
            {pacingSaving && <Loader2 size={12} className="animate-spin" />}
            Apply Action Cut
          </button>
        </div>
      )}

      {scenes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.25)' }}>
          No scenes yet — go back and analyze a script first.
        </div>
      ) : (
        <div className="space-y-3">
          {scenes.map((scene, i) => {
            const nextScene = scenes[i + 1] || null
            // FT-9: a chapter header (with the montage control) precedes the first scene of
            // each chapter run.
            const chapterNum     = chapterNumbers[i]
            const isChapterStart = i === 0 || chapterNumbers[i - 1] !== chapterNum
            return (
              <Fragment key={scene.scene_id}>
              {isChapterStart && (
                <ChapterMontageHeader
                  chapter={chapterNum}
                  chapterScenes={scenes.filter((_, idx) => chapterNumbers[idx] === chapterNum)}
                  projectId={projectId}
                  snapshot={snapshot}
                  scenes={scenes}
                  onScenesChange={onScenesChange}
                />
              )}
              <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
                {selectMode && (
                  <label
                    className="shrink-0 flex items-start pt-4 pl-1 cursor-pointer select-none"
                    title="Click to select · Shift-click to select a range"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(scene.scene_id)}
                      onChange={() => {}}
                      onClick={e => { e.preventDefault(); handleSelectClick(e.shiftKey, i, scene.scene_id) }}
                      style={{ width: 15, height: 15, accentColor: '#3b82f6' }}
                    />
                  </label>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                <FineTuneCard
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
                  autoRegenerate={autoRegenerate}
                  otherScenesWithImages={
                    // FT-7: candidates for "Reuse existing scene image" — every OTHER image
                    // scene that actually has a resolvable thumbnail right now.
                    scenes
                      .filter(s => s.scene_id !== scene.scene_id && s.shot_type === 'image')
                      .map(s => ({
                        scene_id: s.scene_id,
                        thumbnail: s.image_path || sceneStatuses[s.scene_id]?.image_path || imagePaths[s.scene_id],
                      }))
                      .filter(s => s.thumbnail)
                  }
                  onSceneUpdate={(updated) => {
                    onScenesChange(scenes.map(s => s.scene_id === scene.scene_id ? { ...s, ...updated } : s))
                  }}
                />
                {nextScene && (
                  <BoundaryControl
                    outgoingScene={scene}
                    nextScene={nextScene}
                    projectId={projectId}
                    onSceneUpdate={(updated) => {
                      onScenesChange(scenes.map(s => s.scene_id === scene.scene_id ? { ...s, ...updated } : s))
                    }}
                  />
                )}
                </div>
              </div>
              </Fragment>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── FT-9: chapter header with the montage pacing control ──────────────────────
// FT-5's range-apply mechanism at chapter scope: instead of a manually selected contiguous
// range, the range is "every scene in this chapter" and the apply goes through PATCH
// /api/scenes/chapter-pacing. Scenes whose pacing is already non-standard (an intentional
// per-scene FT-5 action cut, or a previous montage) are skipped by default — a warning
// lists them before anything is committed, and only an explicit "Override & include" click
// sends override_non_standard: true. Revert restores pacing/transition_out/duration_seconds/
// audio_mix_override from the Fine-Tune snapshot for every montage scene in the chapter,
// through the existing PATCH /:sceneId endpoint (FT-5's revert precedent).
function ChapterMontageHeader({ chapter, chapterScenes, projectId, snapshot, scenes, onScenesChange }) {
  const [confirming, setConfirming] = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState(null)
  const [skipNotice, setSkipNotice] = useState(null)

  const nonStandard   = chapterScenes.filter(s => (s.pacing || 'standard') !== 'standard')
  const montageScenes = chapterScenes.filter(s => s.pacing === 'montage')

  const mergeScenes = (updatedList) => {
    const byId = new Map(updatedList.map(s => [s.scene_id, s]))
    onScenesChange(scenes.map(s => byId.has(s.scene_id) ? { ...s, ...byId.get(s.scene_id) } : s))
  }

  const applyMontage = async (overrideNonStandard) => {
    setSaving(true); setError(null); setSkipNotice(null)
    try {
      const res = await fetch(`${SERVER_URL}/api/scenes/chapter-pacing`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId, chapter, pacing: 'montage', override_non_standard: overrideNonStandard }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Montage apply failed')
      mergeScenes(data.scenes)
      if (data.skipped?.length) {
        setSkipNotice(`Skipped (already have a pacing preset): ${data.skipped.map(s => `${s.scene_id} (${s.pacing})`).join(', ')}`)
      }
      setConfirming(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleApplyClick = () => {
    setSkipNotice(null)
    if (nonStandard.length > 0) {
      setConfirming(true)
      return
    }
    applyMontage(false)
  }

  const revertMontage = async () => {
    setSaving(true); setError(null); setSkipNotice(null)
    try {
      const updates = new Map()
      for (const s of montageScenes) {
        const snap = snapshot[s.scene_id]
        if (!snap) continue
        const res = await fetch(`${SERVER_URL}/api/scenes/${s.scene_id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            projectId,
            pacing:             snap.pacing || 'standard',
            transition_out:     snap.transition_out,
            duration_seconds:   snap.duration_seconds,
            // Montage may have set a music-forward mix (only when no manual override
            // existed) — restore the snapshot's mix, or clear the field via null.
            audio_mix_override: snap.audio_mix_override || null,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Revert failed for scene ${s.scene_id}`)
        updates.set(s.scene_id, data.scene)
      }
      onScenesChange(scenes.map(s => updates.has(s.scene_id) ? { ...s, ...updates.get(s.scene_id) } : s))
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '8px 14px',
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8,
      }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.55)' }}>
            CHAPTER {chapter}
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>
            {chapterScenes.length} scene{chapterScenes.length !== 1 ? 's' : ''}
          </span>
          {montageScenes.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/25 text-purple-300" style={{ marginLeft: 8 }}>
              🎞 Montage · {montageScenes.length}/{chapterScenes.length}
            </span>
          )}
          {skipNotice && (
            <div style={{ fontSize: 10, color: 'rgba(251,191,36,0.8)', marginTop: 2 }}>{skipNotice}</div>
          )}
          {error && (
            <div style={{ fontSize: 10, color: 'rgba(248,113,113,0.85)', marginTop: 2 }}>{error}</div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {saving && <Loader2 size={12} className="animate-spin text-blue-400" />}
          {montageScenes.length > 0 && (
            <RevertButton onClick={revertMontage} label="Revert montage to generated" />
          )}
          <button onClick={handleApplyClick} disabled={saving} className="vorta-btn vorta-btn-ghost" style={{ fontSize: 12 }}>
            Apply Montage to Chapter {chapter}
          </button>
        </div>
      </div>

      {confirming && (
        <div style={{
          marginTop: 6, padding: '10px 14px',
          background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 8,
        }}>
          <div style={{ fontSize: 11, color: 'rgba(251,191,36,0.85)' }}>
            {nonStandard.length} scene{nonStandard.length !== 1 ? 's' : ''} in this chapter already{' '}
            {nonStandard.length !== 1 ? 'have' : 'has'} a pacing preset and will be skipped:{' '}
            {nonStandard.map(s => `${s.scene_id} (${s.pacing})`).join(', ')}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => applyMontage(false)} disabled={saving} className="vorta-btn vorta-btn-primary" style={{ fontSize: 12 }}>
              Apply &amp; skip them
            </button>
            <button onClick={() => applyMontage(true)} disabled={saving} className="vorta-btn vorta-btn-ghost" style={{ fontSize: 12 }}>
              Override &amp; include all {chapterScenes.length}
            </button>
            <button onClick={() => setConfirming(false)} disabled={saving} className="vorta-btn vorta-btn-ghost" style={{ fontSize: 12 }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function FineTuneCard({
  index, scene, snapshot, thumbnail, clip, projectId, onSceneUpdate,
  isDragging, isDragOver, onDragHandleStart, onDragHandleEnd, onCardDragOver, onCardDrop,
  otherScenesWithImages, autoRegenerate,
}) {
  const min = minDurationFor(scene)
  // Voiceover-cutoff fix: mirrors frameMath.maxDurationSeconds — the 8s style cap yields
  // to the narration floor for long-narration scenes, otherwise a scene with audio > 7.2s
  // has no legal duration at all (max 8 < floor audio + 0.8) and can't be edited/reverted.
  const max = Math.max(MAX_SCENE_SECONDS, min)

  const [duration,    setDuration]    = useState(scene.duration_seconds ?? min)
  const [transition,  setTransition]  = useState(scene.transition_out || 'dissolve')
  const [mix,         setMix]         = useState({ ...DEFAULT_MIX, ...(scene.audio_mix_override || {}) })
  const [savingField, setSavingField] = useState(null) // 'duration' | 'transition' | 'mix' | null
  const [saveError,   setSaveError]   = useState(null)
  const [imageAction,  setImageAction]  = useState(null) // 'uploading' | 'regenerating' | null
  const [imageError,   setImageError]   = useState(null)
  const fileInputRef = useRef(null)

  // FT-7: split-screen layout
  const [layout, setLayout] = useState(scene.layout || 'single')
  const [layoutSaving, setLayoutSaving] = useState(false)
  const [layoutError,  setLayoutError]  = useState(null)
  const [showSourcePicker, setShowSourcePicker] = useState(false)
  const [secondaryMode, setSecondaryMode] = useState('reuse') // 'reuse' | 'regenerate'
  const [regeneratePrompt, setRegeneratePrompt] = useState('')
  const [regeneratingSecondary, setRegeneratingSecondary] = useState(false)

  // Script editing + voice regeneration
  const [scriptText,  setScriptText]  = useState(scene.script_excerpt || '')
  const [voiceAction, setVoiceAction] = useState(null) // 'saving' | 'saving_regen' | 'regenerating' | 'reverting' | null
  const [voiceError,  setVoiceError]  = useState(null)
  const [voiceNotice, setVoiceNotice] = useState(null) // FT-1/FT-4 conflict-reset warning
  const scriptDirty = scriptText.trim() !== (scene.script_excerpt || '').trim()

  // FT-8: cutaway insert
  const [showCutawayEditor, setShowCutawayEditor] = useState(false)
  const [cutawayInsertAt, setCutawayInsertAt] = useState(scene.cutaway?.insert_at ?? Math.min(2, Math.max(0.5, duration / 2)))
  const [cutawayDuration, setCutawayDuration] = useState(scene.cutaway?.duration ?? 1)
  const [cutawaySaving, setCutawaySaving] = useState(false)
  const [cutawayError,  setCutawayError]  = useState(null)
  const [cutawaySourceMode, setCutawaySourceMode] = useState('reuse') // 'reuse' | 'regenerate'
  const [cutawayRegeneratePrompt, setCutawayRegeneratePrompt] = useState('')
  const [cutawayRegenerating, setCutawayRegenerating] = useState(false)

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
      } else if (field === 'pacing') {
        // FT-5: action cut changes pacing/transition_out/duration_seconds together, so
        // reverting it restores all three from the snapshot in one call.
        // FT-9: montage additionally set a music-forward audio_mix_override (only when the
        // user had no manual override) — restore the snapshot's mix too for montage scenes.
        const isMontage = scene.pacing === 'montage'
        const updated = await patchScene({
          pacing:           snapshot.pacing || 'standard',
          transition_out:   snapshot.transition_out,
          duration_seconds: snapshot.duration_seconds,
          ...(isMontage ? { audio_mix_override: snapshot.audio_mix_override || null } : {}),
        })
        setTransition(updated.transition_out || 'dissolve')
        setDuration(updated.duration_seconds ?? min)
        if (isMontage) setMix({ ...DEFAULT_MIX, ...(updated.audio_mix_override || {}) })
        onSceneUpdate(updated)
      }
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSavingField(null)
    }
  }

  // ── Script editing + voice regeneration ─────────────────────────────────────
  // Validation (validateTTSText) runs server-side inside BOTH endpoints — the /script
  // PATCH rejects invalid text before saving, and /regenerate-voice re-validates the
  // stored text before any ElevenLabs call, so invalid text can never reach generation
  // in either auto or manual mode.

  const regenerateVoice = async () => {
    let selectedVoiceId = null
    try { selectedVoiceId = localStorage.getItem('vorta_selected_voice') } catch { /* unavailable */ }
    if (!selectedVoiceId) {
      throw new Error('No narration voice selected — pick a voice in the Voice step first.')
    }
    const res = await fetch(`${SERVER_URL}/api/scenes/${scene.scene_id}/regenerate-voice`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ projectId, voiceId: selectedVoiceId }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Voice regeneration failed')
    onSceneUpdate(data.scene)
    // Keep the FT-1 duration slider in sync with the freshly re-synced duration.
    setDuration(data.scene.duration_seconds ?? min)
    if (data.manual_adjustments_reset) {
      setVoiceNotice('Script changed — manual duration/offset was reset because it no longer matched the new narration length.')
    }
  }

  const handleSaveScript = async () => {
    if (!scriptDirty || voiceAction) return
    setVoiceError(null); setVoiceNotice(null)
    setVoiceAction(autoRegenerate ? 'saving_regen' : 'saving')
    try {
      const res = await fetch(`${SERVER_URL}/api/scenes/${scene.scene_id}/script`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId, script_excerpt: scriptText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Script update failed')
      onSceneUpdate(data.scene)
      // Auto mode: regenerate immediately, as one combined operation. On regeneration
      // failure the text stays saved (voice_stale: true) and the card's "Regenerate
      // Voice" button doubles as the retry.
      if (autoRegenerate) await regenerateVoice()
    } catch (err) {
      setVoiceError(err.message)
    } finally {
      setVoiceAction(null)
    }
  }

  const handleManualRegenerate = async () => {
    if (voiceAction) return
    setVoiceError(null); setVoiceNotice(null)
    setVoiceAction('regenerating')
    try {
      await regenerateVoice()
    } catch (err) {
      setVoiceError(err.message)
    } finally {
      setVoiceAction(null)
    }
  }

  const handleRevertVoice = async () => {
    if (voiceAction) return
    setVoiceError(null); setVoiceNotice(null)
    setVoiceAction('reverting')
    try {
      const res = await fetch(`${SERVER_URL}/api/scenes/${scene.scene_id}/revert-voice`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Revert failed')
      onSceneUpdate(data.scene)
      setScriptText(data.scene.script_excerpt || '')
      setDuration(data.scene.duration_seconds ?? min)
    } catch (err) {
      setVoiceError(err.message)
    } finally {
      setVoiceAction(null)
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

  // FT-7: split-screen layout. "Generated" is always layout: 'single' with no secondary
  // fields — Claude's analysis never sets these, only Fine-Tune user actions do — so revert
  // needs no snapshot entry, it's just "set layout back to single" (which the endpoint itself
  // already treats as "clear the secondary fields too").
  async function patchLayout(body) {
    const res  = await fetch(`${SERVER_URL}/api/scenes/${scene.scene_id}/layout`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ projectId, ...body }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Layout update failed')
    return data.scene
  }

  const commitLayout = async (nextLayout) => {
    setLayout(nextLayout)
    setLayoutSaving(true); setLayoutError(null)
    try {
      const updated = await patchLayout({ layout: nextLayout })
      onSceneUpdate(updated)
      if (nextLayout !== 'single' && !updated.secondary_image_path) setShowSourcePicker(true)
      if (nextLayout === 'single') setShowSourcePicker(false)
    } catch (err) {
      setLayoutError(err.message)
    } finally {
      setLayoutSaving(false)
    }
  }

  const revertLayout = () => commitLayout('single')

  const reuseSecondary = async (sourceSceneId) => {
    setLayoutSaving(true); setLayoutError(null)
    try {
      const updated = await patchLayout({ layout, source_scene_id: sourceSceneId })
      onSceneUpdate(updated)
      setShowSourcePicker(false)
    } catch (err) {
      setLayoutError(err.message)
    } finally {
      setLayoutSaving(false)
    }
  }

  const regenerateSecondary = async () => {
    if (!regeneratePrompt.trim()) return
    setRegeneratingSecondary(true); setLayoutError(null)
    try {
      const res  = await fetch(`${SERVER_URL}/api/higgsfield/regenerate-secondary/${scene.scene_id}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId, prompt: regeneratePrompt.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Regeneration failed')
      onSceneUpdate({ secondary_image_path: data.secondary_image_path, secondary_source_scene_id: null })
      setShowSourcePicker(false)
      setRegeneratePrompt('')
    } catch (err) {
      setLayoutError(err.message)
    } finally {
      setRegeneratingSecondary(false)
    }
  }

  // FT-8: cutaway insert. "Revert to generated" is just DELETE — every scene starts with no
  // cutaway (Claude's analysis never sets one, only Fine-Tune user actions do), so there's no
  // snapshot to restore, exactly like FT-7's layout revert.
  async function patchCutaway(body) {
    const res  = await fetch(`${SERVER_URL}/api/scenes/${scene.scene_id}/cutaway`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ projectId, ...body }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Cutaway update failed')
    return data.scene
  }

  const reuseCutawaySource = async (sourceSceneId) => {
    setCutawaySaving(true); setCutawayError(null)
    try {
      const updated = await patchCutaway({ insert_at: cutawayInsertAt, duration: cutawayDuration, source_scene_id: sourceSceneId })
      onSceneUpdate(updated)
      setShowCutawayEditor(false)
    } catch (err) {
      setCutawayError(err.message)
    } finally {
      setCutawaySaving(false)
    }
  }

  const regenerateCutawaySource = async () => {
    if (!cutawayRegeneratePrompt.trim()) return
    setCutawayRegenerating(true); setCutawayError(null)
    try {
      // Commit timing first — validated server-side. regenerate-cutaway only ever touches
      // image_path, it never sets insert_at/duration itself.
      const timingUpdated = await patchCutaway({ insert_at: cutawayInsertAt, duration: cutawayDuration })
      onSceneUpdate(timingUpdated)

      const res  = await fetch(`${SERVER_URL}/api/higgsfield/regenerate-cutaway/${scene.scene_id}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId, prompt: cutawayRegeneratePrompt.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Regeneration failed')
      onSceneUpdate({ cutaway: data.cutaway })
      setShowCutawayEditor(false)
      setCutawayRegeneratePrompt('')
    } catch (err) {
      setCutawayError(err.message)
    } finally {
      setCutawayRegenerating(false)
    }
  }

  const removeCutaway = async () => {
    setCutawaySaving(true); setCutawayError(null)
    try {
      const res  = await fetch(`${SERVER_URL}/api/scenes/${scene.scene_id}/cutaway`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to remove cutaway')
      onSceneUpdate(data.scene)
      setShowCutawayEditor(false)
    } catch (err) {
      setCutawayError(err.message)
    } finally {
      setCutawaySaving(false)
    }
  }

  const durationChanged   = snapshot && duration !== snapshot.duration_seconds
  const transitionChanged = snapshot && transition !== (snapshot.transition_out || 'dissolve')
  const mixChanged         = snapshot && JSON.stringify(mix) !== JSON.stringify({ ...DEFAULT_MIX, ...(snapshot.audio_mix_override || {}) })
  const layoutChanged      = layout !== 'single'
  const pacing        = scene.pacing || 'standard'
  const pacingChanged  = snapshot && pacing !== (snapshot.pacing || 'standard')

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
            {/* Script editing + voice regeneration */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <FieldLabel>Script</FieldLabel>
                <div className="flex items-center gap-2">
                  {voiceAction && <Loader2 size={11} className="animate-spin text-blue-400" />}
                  {scene.original_script_excerpt !== undefined && (
                    <RevertButton onClick={handleRevertVoice} label="Revert script & voice to generated" />
                  )}
                </div>
              </div>
              <textarea
                value={scriptText}
                onChange={e => setScriptText(e.target.value)}
                onBlur={handleSaveScript}
                rows={3}
                disabled={voiceAction !== null}
                className="w-full text-[12px] leading-snug px-2.5 py-2 rounded-md border border-white/[0.12] bg-white/[0.04] text-white/75 focus:outline-none focus:border-blue-500/40 resize-y disabled:opacity-50"
                placeholder="Scene narration script…"
              />
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {scriptDirty && !voiceAction && (
                  <button
                    onClick={handleSaveScript}
                    className="text-[10px] px-2.5 py-1 rounded bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 transition-colors"
                  >
                    {autoRegenerate ? 'Save & Regenerate Voice' : 'Save Script'}
                  </button>
                )}
                {voiceAction === 'saving_regen' && (
                  <span className="text-[10px] text-blue-300/80">Saving and regenerating…</span>
                )}
                {voiceAction === 'saving' && (
                  <span className="text-[10px] text-blue-300/80">Saving…</span>
                )}
                {voiceAction === 'regenerating' && (
                  <span className="text-[10px] text-blue-300/80">Regenerating voice…</span>
                )}
                {voiceAction === 'reverting' && (
                  <span className="text-[10px] text-blue-300/80">Reverting…</span>
                )}
                {scene.voice_stale && !voiceAction && (
                  <>
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300">
                      ⚠ voice out of sync
                    </span>
                    <button
                      onClick={handleManualRegenerate}
                      className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] text-white/60 transition-colors"
                      title="Regenerate this scene's narration from the current script"
                    >
                      <RefreshCw size={10} />
                      Regenerate Voice
                    </button>
                  </>
                )}
              </div>
              {voiceError && (
                <div className="text-[10px] text-red-400/80 mt-1">
                  {voiceError}
                  {scene.voice_stale ? ' — the script is saved; use "Regenerate Voice" to retry.' : ''}
                </div>
              )}
              {voiceNotice && (
                <div className="text-[10px] text-amber-400/80 mt-1">{voiceNotice}</div>
              )}
            </div>

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

            {/* Pacing — set via bulk Action Cut (Select Scenes), reverted per-scene here */}
            {pacing !== 'standard' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <FieldLabel>Pacing</FieldLabel>
                  <div className="flex items-center gap-2">
                    {savingField === 'pacing' && <Loader2 size={11} className="animate-spin text-blue-400" />}
                    {pacingChanged && <RevertButton onClick={() => revertField('pacing')} />}
                  </div>
                </div>
                {/* FT-9: montage shares this row — same field, different preset badge */}
                {pacing === 'montage' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-purple-500/10 border border-purple-500/25 text-purple-300">
                    🎞 Montage
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300">
                    ⚡ Action Cut
                  </span>
                )}
              </div>
            )}

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

            {/* Layout — FT-7 split-screen */}
            {scene.shot_type === 'image' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <FieldLabel>Layout</FieldLabel>
                  <div className="flex items-center gap-2">
                    {layoutSaving && <Loader2 size={11} className="animate-spin text-blue-400" />}
                    {layoutChanged && <RevertButton onClick={revertLayout} />}
                  </div>
                </div>
                <select
                  value={layout}
                  onChange={e => commitLayout(e.target.value)}
                  className="text-[11px] px-2 py-1.5 rounded-md border border-white/[0.12] bg-white/[0.05] text-white/70 focus:outline-none"
                >
                  {LAYOUTS.map(l => (
                    <option key={l.value} value={l.value} className="bg-[#1a1a1a] text-white">{l.label}</option>
                  ))}
                </select>

                {layout !== 'single' && (
                  <div className="mt-2 space-y-2">
                    {scene.secondary_image_path && !showSourcePicker ? (
                      <div className="flex items-center gap-2">
                        <div className="w-16 rounded overflow-hidden border border-white/[0.1]" style={{ aspectRatio: '16/9' }}>
                          <img src={scene.secondary_image_path} alt="Secondary panel" className="w-full h-full object-cover" loading="lazy" />
                        </div>
                        <span className="text-[10px] text-white/25">
                          {scene.secondary_source_scene_id ? `Reused from scene ${scene.secondary_source_scene_id}` : 'Generated'}
                        </span>
                        <button
                          onClick={() => setShowSourcePicker(true)}
                          className="text-[10px] text-blue-400/60 hover:text-blue-300 transition-colors"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5 space-y-2">
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setSecondaryMode('reuse')}
                            className={`flex-1 text-[10px] px-2 py-1 rounded border transition-colors ${secondaryMode === 'reuse' ? 'bg-blue-500/15 border-blue-500/30 text-blue-300' : 'bg-white/[0.03] border-white/[0.08] text-white/40'}`}
                          >
                            Reuse existing scene image
                          </button>
                          <button
                            onClick={() => setSecondaryMode('regenerate')}
                            className={`flex-1 text-[10px] px-2 py-1 rounded border transition-colors ${secondaryMode === 'regenerate' ? 'bg-blue-500/15 border-blue-500/30 text-blue-300' : 'bg-white/[0.03] border-white/[0.08] text-white/40'}`}
                          >
                            Regenerate new
                          </button>
                        </div>

                        {secondaryMode === 'reuse' ? (
                          otherScenesWithImages?.length > 0 ? (
                            <div className="grid grid-cols-4 gap-1.5 max-h-32 overflow-y-auto">
                              {otherScenesWithImages.map(s => (
                                <button
                                  key={s.scene_id}
                                  onClick={() => reuseSecondary(s.scene_id)}
                                  disabled={layoutSaving}
                                  className="rounded overflow-hidden border border-white/[0.1] hover:border-blue-500/40 disabled:opacity-40 transition-colors"
                                  style={{ aspectRatio: '16/9' }}
                                  title={`Reuse scene ${s.scene_id}`}
                                >
                                  <img src={s.thumbnail} alt={`Scene ${s.scene_id}`} className="w-full h-full object-cover" loading="lazy" />
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] text-white/20 italic">No other scenes with images yet to reuse.</p>
                          )
                        ) : (
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={regeneratePrompt}
                              onChange={e => setRegeneratePrompt(e.target.value)}
                              placeholder="Describe the second panel's image…"
                              className="flex-1 bg-white/[0.05] border border-white/[0.12] rounded px-2 py-1 text-[10px] text-white/80"
                            />
                            <button
                              onClick={regenerateSecondary}
                              disabled={regeneratingSecondary || !regeneratePrompt.trim()}
                              className="flex items-center gap-1 text-[10px] px-2 py-1 bg-white/[0.05] hover:bg-white/[0.09] disabled:opacity-40 border border-white/[0.1] rounded text-white/60 transition-colors"
                            >
                              {regeneratingSecondary ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                              Generate
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {layoutError && <div className="text-[10px] text-red-400/80 mt-1">{layoutError}</div>}
              </div>
            )}

            {/* Cutaway — FT-8 */}
            {scene.shot_type === 'image' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <FieldLabel>Cutaway</FieldLabel>
                  <div className="flex items-center gap-2">
                    {cutawaySaving && <Loader2 size={11} className="animate-spin text-blue-400" />}
                    {scene.cutaway?.image_path && <RevertButton onClick={removeCutaway} />}
                  </div>
                </div>

                {scene.cutaway?.image_path && !showCutawayEditor ? (
                  <div className="flex items-center gap-2">
                    <div className="w-16 rounded overflow-hidden border border-white/[0.1]" style={{ aspectRatio: '16/9' }}>
                      <img src={scene.cutaway.image_path} alt="Cutaway" className="w-full h-full object-cover" loading="lazy" />
                    </div>
                    <span className="text-[10px] text-white/25">
                      at {scene.cutaway.insert_at}s for {scene.cutaway.duration}s
                    </span>
                    <button
                      onClick={() => setShowCutawayEditor(true)}
                      className="text-[10px] text-blue-400/60 hover:text-blue-300 transition-colors"
                    >
                      Change
                    </button>
                  </div>
                ) : !showCutawayEditor ? (
                  <button
                    onClick={() => setShowCutawayEditor(true)}
                    className="text-[10px] px-2 py-1.5 bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] rounded text-white/60 transition-colors"
                  >
                    + Add cutaway
                  </button>
                ) : (
                  <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5 space-y-2">
                    <div className="flex gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-white/30">Insert at</span>
                        <input
                          type="number"
                          min={0.5} max={Math.max(0.5, duration - 0.5)} step={0.1}
                          value={cutawayInsertAt}
                          onChange={e => setCutawayInsertAt(parseFloat(e.target.value) || 0)}
                          className="w-14 bg-white/[0.05] border border-white/[0.12] rounded px-1.5 py-0.5 text-[10px] text-white/80 text-right"
                        />
                        <span className="text-[9px] text-white/20">s</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-white/30">Duration</span>
                        <input
                          type="number"
                          min={0.1} step={0.1}
                          value={cutawayDuration}
                          onChange={e => setCutawayDuration(parseFloat(e.target.value) || 0)}
                          className="w-14 bg-white/[0.05] border border-white/[0.12] rounded px-1.5 py-0.5 text-[10px] text-white/80 text-right"
                        />
                        <span className="text-[9px] text-white/20">s</span>
                      </div>
                    </div>
                    <div className="text-[9px] text-white/15">
                      Scene is {duration}s — insert_at must be ≥ 0.5s and insert_at + duration ≤ {Math.max(0.5, duration - 0.5).toFixed(1)}s.
                    </div>

                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setCutawaySourceMode('reuse')}
                        className={`flex-1 text-[10px] px-2 py-1 rounded border transition-colors ${cutawaySourceMode === 'reuse' ? 'bg-blue-500/15 border-blue-500/30 text-blue-300' : 'bg-white/[0.03] border-white/[0.08] text-white/40'}`}
                      >
                        Reuse existing scene image
                      </button>
                      <button
                        onClick={() => setCutawaySourceMode('regenerate')}
                        className={`flex-1 text-[10px] px-2 py-1 rounded border transition-colors ${cutawaySourceMode === 'regenerate' ? 'bg-blue-500/15 border-blue-500/30 text-blue-300' : 'bg-white/[0.03] border-white/[0.08] text-white/40'}`}
                      >
                        Regenerate new
                      </button>
                    </div>

                    {cutawaySourceMode === 'reuse' ? (
                      otherScenesWithImages?.length > 0 ? (
                        <div className="grid grid-cols-4 gap-1.5 max-h-32 overflow-y-auto">
                          {otherScenesWithImages.map(s => (
                            <button
                              key={s.scene_id}
                              onClick={() => reuseCutawaySource(s.scene_id)}
                              disabled={cutawaySaving}
                              className="rounded overflow-hidden border border-white/[0.1] hover:border-blue-500/40 disabled:opacity-40 transition-colors"
                              style={{ aspectRatio: '16/9' }}
                              title={`Reuse scene ${s.scene_id}`}
                            >
                              <img src={s.thumbnail} alt={`Scene ${s.scene_id}`} className="w-full h-full object-cover" loading="lazy" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-white/20 italic">No other scenes with images yet to reuse.</p>
                      )
                    ) : (
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={cutawayRegeneratePrompt}
                          onChange={e => setCutawayRegeneratePrompt(e.target.value)}
                          placeholder="Describe the cutaway image…"
                          className="flex-1 bg-white/[0.05] border border-white/[0.12] rounded px-2 py-1 text-[10px] text-white/80"
                        />
                        <button
                          onClick={regenerateCutawaySource}
                          disabled={cutawayRegenerating || !cutawayRegeneratePrompt.trim()}
                          className="flex items-center gap-1 text-[10px] px-2 py-1 bg-white/[0.05] hover:bg-white/[0.09] disabled:opacity-40 border border-white/[0.1] rounded text-white/60 transition-colors"
                        >
                          {cutawayRegenerating ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                          Generate
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => setShowCutawayEditor(false)}
                      className="text-[10px] text-white/25 hover:text-white/50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {cutawayError && <div className="text-[10px] text-red-400/80 mt-1">{cutawayError}</div>}
              </div>
            )}

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

// ── BoundaryControl — FT-4: manual J-cut/L-cut offset, docked at the seam between two
// adjacent scene cards. Lives on the OUTGOING (earlier) scene's fields — see the comment
// block in remotion/src/compositions/Documentary.jsx's narration-track builder for why l_cut
// reads from this scene and j_cut reads from the PREVIOUS scene (not relevant here, since
// this control edits exactly this one outgoing scene's own fields either way).
function BoundaryControl({ outgoingScene, nextScene, projectId, onSceneUpdate }) {
  const max = maxBoundaryOffset(outgoingScene, nextScene)

  const [jcut, setJcut] = useState(outgoingScene.jcut_offset ?? 0)
  const [lcut, setLcut] = useState(outgoingScene.lcut_offset ?? 0)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)
  const [matchCutSaving, setMatchCutSaving] = useState(false)
  const [matchCutError,  setMatchCutError]  = useState(null)

  const isManual = outgoingScene.is_manual_offset === true &&
    outgoingScene.boundary_partner_scene_id === nextScene.scene_id

  const jcutError = jcut > max ? `Must be <= ${max}s` : jcut < 0 ? 'Must be >= 0' : null
  const lcutError = lcut > max ? `Must be <= ${max}s` : lcut < 0 ? 'Must be >= 0' : null

  async function patchBoundary(body) {
    const res  = await fetch(`${SERVER_URL}/api/scenes/${outgoingScene.scene_id}/boundary`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ projectId, ...body }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Update failed')
    return data.scene
  }

  const commitBoundary = async () => {
    if (jcutError || lcutError) return
    setSaving(true); setError(null)
    try {
      const updated = await patchBoundary({ jcut_offset: jcut, lcut_offset: lcut, is_manual_offset: true })
      onSceneUpdate(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const revertBoundary = async () => {
    setSaving(true); setError(null)
    try {
      const updated = await patchBoundary({ is_manual_offset: false })
      setJcut(updated.jcut_offset ?? 0)
      setLcut(updated.lcut_offset ?? 0)
      onSceneUpdate(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // FT-6: accepting a match-cut suggestion is just a transition_out: "match" update on the
  // outgoing scene — reuses the existing PATCH /:sceneId endpoint (no new endpoint needed).
  // match_cut_candidate is never sent here, so it's never disturbed by accepting or by the
  // existing generic "Transition Out" revert on the scene card (it reflects analysis, not a
  // user edit — see the FineTuneCard/revertField('transition') path, unchanged from FT-1).
  const acceptMatchCut = async () => {
    setMatchCutSaving(true); setMatchCutError(null)
    try {
      const res  = await fetch(`${SERVER_URL}/api/scenes/${outgoingScene.scene_id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId, transition_out: 'match' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to accept match cut')
      onSceneUpdate(data.scene)
    } catch (err) {
      setMatchCutError(err.message)
    } finally {
      setMatchCutSaving(false)
    }
  }

  return (
    <div className="my-2 mx-4 rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-white/30 uppercase tracking-wider">
          Boundary · Audio Bleed
        </span>
        <div className="flex items-center gap-2">
          {saving && <Loader2 size={10} className="animate-spin text-blue-400" />}
          {isManual && <RevertButton onClick={revertBoundary} label="Revert to generated" />}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-white/30 w-9">J-cut</span>
          <input
            type="number"
            min={0} max={max} step={0.1}
            value={jcut}
            onChange={e => setJcut(parseFloat(e.target.value) || 0)}
            onBlur={commitBoundary}
            className="w-14 bg-white/[0.05] border border-white/[0.12] rounded px-1.5 py-0.5 text-[10px] text-white/80 text-right"
          />
          <span className="text-[9px] text-white/20">s</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-white/30 w-9">L-cut</span>
          <input
            type="number"
            min={0} max={max} step={0.1}
            value={lcut}
            onChange={e => setLcut(parseFloat(e.target.value) || 0)}
            onBlur={commitBoundary}
            className="w-14 bg-white/[0.05] border border-white/[0.12] rounded px-1.5 py-0.5 text-[10px] text-white/80 text-right"
          />
          <span className="text-[9px] text-white/20">s</span>
        </div>
        <span className="text-[9px] text-white/15">max {max}s</span>
      </div>

      <div className="text-[9px] text-white/15 mt-1">
        J-cut: next scene's narration starts early, under this scene's tail. L-cut: this
        scene's narration bleeds forward into the next scene. Only takes effect if that
        scene's audio_cut is already set to match.
      </div>

      {(jcutError || lcutError) && (
        <div className="text-[9px] text-red-400/80 mt-1">{jcutError || lcutError}</div>
      )}
      {error && (
        <div className="text-[9px] text-red-400/80 mt-1">{error}</div>
      )}

      {outgoingScene.match_cut_candidate && (
        <div className="mt-2 pt-2 border-t border-white/[0.06] flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-purple-500/10 border border-purple-500/25 text-purple-300">
            ✂ Match cut suggested
          </span>
          <div className="flex items-center gap-2">
            {matchCutSaving && <Loader2 size={10} className="animate-spin text-blue-400" />}
            {outgoingScene.transition_out === 'match' ? (
              <span className="text-[9px] text-white/25">Accepted</span>
            ) : (
              <button
                onClick={acceptMatchCut}
                disabled={matchCutSaving}
                className="text-[10px] px-2 py-1 bg-purple-500/10 hover:bg-purple-500/20 disabled:opacity-40 border border-purple-500/25 rounded text-purple-300 transition-colors"
              >
                Accept
              </button>
            )}
          </div>
        </div>
      )}
      {matchCutError && (
        <div className="text-[9px] text-red-400/80 mt-1">{matchCutError}</div>
      )}
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
