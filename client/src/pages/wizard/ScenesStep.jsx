import { useState } from 'react'
import { Lock, Unlock } from 'lucide-react'
import SceneGrid from '../../components/video-creator/SceneGrid'
import { DirectorReviewPanel } from '../../components/video-creator/DirectorReviewPanel'

function lsReadMetadata() {
  try { return JSON.parse(localStorage.getItem('vorta_script_metadata')) || {} } catch { return {} }
}

export function ScenesStep({
  scenes, onScenesChange, sceneStatuses, onRetry,
  motionStatuses, onBuildComponent,
  clipMatches, selectedClips, onSelectClip, onConvertToImage, onManualMatch, onOpenLibrary,
  onPreviewScene, voiceoverStatuses, onOpenVoiceover,
  directionWarnings = [], onDismissDirectionWarnings,
  // DD-4
  treatment, projectId, direction,
  onDuplicateScene, onSplitScene, onMergeSceneWithNext, onDeleteScene,
  // DD-5
  onDirectionChange, imagePaths,
  wizard,
}) {
  const lockedCount = scenes.filter(s => s.locked).length
  const handleLockAll   = () => onScenesChange(scenes.map(s => ({ ...s, locked: true })))
  const handleUnlockAll = () => onScenesChange(scenes.map(s => ({ ...s, locked: false })))
  const [isEnhancing,       setIsEnhancing]       = useState(false)
  const [warningsExpanded,  setWarningsExpanded]  = useState(false)
  const [scrollTarget,      setScrollTarget]      = useState(null)

  const scriptMeta = lsReadMetadata()
  const targetDurationMinutes = typeof scriptMeta.targetDuration === 'number' ? scriptMeta.targetDuration : undefined
  const sourceScript = scriptMeta.script || ''

  const handleScrollToScene = (sceneId, tab) => setScrollTarget({ sceneId, tab, ts: Date.now() })
  const [stockSearchScene,  setStockSearchScene]  = useState(null)
  const [stockQuery,        setStockQuery]        = useState('')
  const [stockResults,      setStockResults]      = useState([])
  const [isSearching,       setIsSearching]       = useState(false)
  const [downloadingId,     setDownloadingId]     = useState(null)

  async function handleEnhancePrompts() {
    const imageScenes = scenes.filter(s => s.shot_type === 'image')
    if (!imageScenes.length) return
    setIsEnhancing(true)
    try {
      const res = await fetch('/api/generate/enhance-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { scenes: enhanced } = await res.json()
      onScenesChange(enhanced)
    } catch (err) {
      console.error('[ScenesStep] enhance-prompts failed:', err)
    } finally {
      setIsEnhancing(false)
    }
  }

  const handleOpenStockSearch = (scene) => {
    setStockSearchScene(scene)
    const autoQuery = (scene.subject_anchors || []).slice(0, 2).join(' ') || scene.mood || ''
    setStockQuery(autoQuery)
    setStockResults([])
  }

  const handleSearchStock = async () => {
    if (!stockQuery.trim()) return
    setIsSearching(true)
    try {
      const res = await fetch(`/api/clips/search?query=${encodeURIComponent(stockQuery.trim())}&source=both`)
      const data = await res.json()
      setStockResults(data.results || [])
    } catch (err) {
      console.error('[ScenesStep] stock search failed:', err)
    } finally {
      setIsSearching(false)
    }
  }

  const handleSelectStockClip = async (result) => {
    if (!stockSearchScene) return
    setDownloadingId(result.id)
    try {
      const res = await fetch('/api/clips/download', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ result }),
      })
      const data = await res.json()
      if (data.success) {
        onSelectClip?.(stockSearchScene.scene_id, {
          ...result,
          file:     data.file,
          filename: data.filename,
        })
        setStockSearchScene(null)
        setStockResults([])
        setStockQuery('')
      }
    } catch (err) {
      console.error('[ScenesStep] stock download failed:', err)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* DD-3: continuity-enforcement warnings from treatment-aware analysis */}
      {directionWarnings.length > 0 && (
        <div style={{
          marginBottom: 16, padding: '10px 16px',
          background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <button
              onClick={() => setWarningsExpanded(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(252,211,77,0.9)', fontSize: 13, padding: 0, fontFamily: 'inherit' }}
            >
              {warningsExpanded ? '▾' : '▸'} ⚠ {directionWarnings.length} continuity fix{directionWarnings.length !== 1 ? 'es' : ''} applied during analysis
            </button>
            <button
              onClick={onDismissDirectionWarnings}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontSize: 12, fontFamily: 'inherit' }}
            >
              Dismiss
            </button>
          </div>
          {warningsExpanded && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 20, color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 1.7 }}>
              {directionWarnings.map((w, i) => (
                <li key={i}>
                  Scene {w.scene_id}: locked descriptor for <code style={{ color: 'rgba(252,211,77,0.85)' }}>{w.entity_id}</code>{' '}
                  was missing from the image prompt{w.auto_fixed ? ' — appended automatically' : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: 0 }}>Scene Breakdown</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 6 }}>
            Review and edit the {scenes.length} scenes Claude identified.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={() => wizard.goBack()} className="vorta-btn vorta-btn-ghost">← Back</button>
          <button
            onClick={handleLockAll}
            disabled={lockedCount === scenes.length}
            className="vorta-btn vorta-btn-ghost"
            title="Lock every scene against edits and batch regeneration"
          >
            <Lock size={12} /> Lock all
          </button>
          <button
            onClick={handleUnlockAll}
            disabled={lockedCount === 0}
            className="vorta-btn vorta-btn-ghost"
            title="Unlock every scene"
          >
            <Unlock size={12} /> Unlock all
          </button>
          <button
            onClick={handleEnhancePrompts}
            disabled={isEnhancing}
            className="vorta-btn vorta-btn-secondary"
            title="Rewrite image prompts to cinematographic standard"
          >
            {isEnhancing ? 'Enhancing…' : '✦ Enhance prompts'}
          </button>
          <button
            onClick={() => { wizard.markComplete('scenes'); wizard.goNext() }}
            className="vorta-btn vorta-btn-primary"
          >
            Continue to Visuals →
          </button>
        </div>
      </div>

      <DirectorReviewPanel
        scenes={scenes}
        direction={direction}
        projectId={projectId}
        onDirectionChange={onDirectionChange}
        sourceScript={sourceScript}
        targetDurationMinutes={targetDurationMinutes}
        imagePaths={imagePaths}
        selectedClips={selectedClips}
        onScrollToScene={handleScrollToScene}
      />

      <SceneGrid
        scenes={scenes}
        onScenesChange={onScenesChange}
        sceneStatuses={sceneStatuses}
        onRetry={onRetry}
        motionStatuses={motionStatuses}
        onBuildComponent={onBuildComponent}
        clipMatches={clipMatches}
        selectedClips={selectedClips}
        onSelectClip={onSelectClip}
        onConvertToImage={onConvertToImage}
        onManualMatch={onManualMatch}
        onOpenLibrary={onOpenLibrary}
        onPreviewScene={onPreviewScene}
        voiceoverStatuses={voiceoverStatuses}
        onOpenVoiceover={onOpenVoiceover}
        onOpenStockSearch={handleOpenStockSearch}
        treatment={treatment}
        projectId={projectId}
        direction={direction}
        scrollTarget={scrollTarget}
        onDuplicateScene={onDuplicateScene}
        onSplitScene={onSplitScene}
        onMergeSceneWithNext={onMergeSceneWithNext}
        onDeleteScene={onDeleteScene}
      />

      {/* Stock footage search modal */}
      {stockSearchScene && (
        <div
          onClick={e => { if (e.target === e.currentTarget) { setStockSearchScene(null); setStockResults([]) } }}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div style={{
            width: '100%', maxWidth: 860,
            background: '#0d0d0d',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', flexDirection: 'column',
            maxHeight: '85vh',
          }}>
            {/* Modal header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              flexShrink: 0,
            }}>
              <div>
                <div style={{ color: 'white', fontSize: 15, fontWeight: 600 }}>Select Stock Footage</div>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 2 }}>
                  Scene {stockSearchScene.scene_id}: "{stockSearchScene.script_excerpt?.slice(0, 60)}"
                </div>
              </div>
              <button
                onClick={() => { setStockSearchScene(null); setStockResults([]) }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 20 }}
              >
                ✕
              </button>
            </div>

            {/* Search bar */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="vorta-input"
                  style={{ flex: 1 }}
                  placeholder="Search stock footage… e.g. 'city skyline', 'office meeting'"
                  value={stockQuery}
                  onChange={e => setStockQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearchStock()}
                  autoFocus
                />
                <button
                  onClick={handleSearchStock}
                  disabled={isSearching || !stockQuery.trim()}
                  className="vorta-btn vorta-btn-primary"
                >
                  {isSearching ? '⟳ Searching…' : 'Search'}
                </button>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, marginTop: 6 }}>
                Pexels + Pixabay · Free commercial license · No attribution required
              </div>
            </div>

            {/* Results */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
              {stockResults.length === 0 && !isSearching && (
                <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.25)' }}>
                  {stockQuery.trim() ? 'No results — try different keywords' : 'Enter a search term above to find footage'}
                </div>
              )}
              {isSearching && (
                <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.35)' }}>
                  Searching Pexels + Pixabay…
                </div>
              )}

              {stockResults.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {stockResults.map(result => (
                    <StockResultCard
                      key={result.id}
                      result={result}
                      isDownloading={downloadingId === result.id}
                      onSelect={handleSelectStockClip}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StockResultCard({ result, isDownloading, onSelect }) {
  return (
    <div
      style={{
        background: '#111', borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)',
        overflow: 'hidden',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
    >
      <div style={{ width: '100%', aspectRatio: '16/9', background: '#1a1a1a', position: 'relative', overflow: 'hidden' }}>
        {result.thumbnailUrl ? (
          <img src={result.thumbnailUrl} alt={result.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 20 }}>
            🎬
          </div>
        )}
        <div style={{
          position: 'absolute', top: 4, left: 4,
          padding: '1px 5px', borderRadius: 3, fontSize: 9,
          background: result.source === 'pexels' ? 'rgba(5,150,105,0.85)' : 'rgba(37,99,235,0.85)',
          color: 'white',
        }}>
          {result.source}
        </div>
        {result.duration && (
          <div style={{
            position: 'absolute', bottom: 4, right: 4,
            padding: '1px 5px', borderRadius: 3, fontSize: 9,
            background: 'rgba(0,0,0,0.7)', color: 'white',
          }}>
            {result.duration}s
          </div>
        )}
      </div>

      <div style={{ padding: '8px 10px' }}>
        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginBottom: 6, lineHeight: 1.3 }}>
          {result.title?.slice(0, 45) || 'Untitled'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#4ade80', fontSize: 10 }}>Free Commercial</span>
          <button
            onClick={() => onSelect(result)}
            disabled={isDownloading}
            style={{
              padding: '4px 10px', fontSize: 11,
              borderRadius: 4, border: 'none',
              background: isDownloading ? 'rgba(255,255,255,0.1)' : '#3b82f6',
              color: 'white', cursor: isDownloading ? 'default' : 'pointer',
            }}
          >
            {isDownloading ? '⟳ Downloading…' : '+ Select'}
          </button>
        </div>
      </div>
    </div>
  )
}
