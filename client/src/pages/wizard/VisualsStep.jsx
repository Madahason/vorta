import { useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Zap } from 'lucide-react'
import SceneGrid from '../../components/video-creator/SceneGrid'

const STATUS_CONFIG = {
  sourcing:       { icon: '🔍', color: '#60a5fa', label: 'Searching Pexels + Pixabay...' },
  done:           { icon: '✓',  color: '#4ade80', label: 'Stock clip ready' },
  fallback:       { icon: '→',  color: '#94a3b8', label: 'Using AI image (no stock clip)' },
  failed:         { icon: '→',  color: '#94a3b8', label: 'Using AI image' },
  no_results:     { icon: '→',  color: '#94a3b8', label: 'Using AI image' },
}

export function VisualsStep({
  scenes, sceneStatuses, isGenerating, generateDone, generateProgress, generateError,
  onGenerateAll, onRetry, motionStatuses, onBuildComponent,
  clipMatches, selectedClips, onSelectClip, onConvertToImage, onManualMatch, onOpenLibrary,
  onPreviewScene, voiceoverStatuses, onOpenVoiceover,
  overlaysVisible, onAcceptSceneOverlays, onRejectSceneOverlays,
  projectId,
  wizard,
}) {
  const [clipProgress, setClipProgress]   = useState({})
  const [isSourcingClips, setIsSourcing]  = useState(false)
  const [clipsDone, setClipsDone]         = useState(false)

  const imageCount   = scenes.filter(s => s.shot_type === 'image').length
  const motionCount  = scenes.filter(s => s.shot_type === 'motion_graphic').length
  const footageCount = scenes.filter(s => s.shot_type === 'real_footage').length
  const doneCount    = Object.values(sceneStatuses).filter(s => s.status === 'done').length
  const allDone      = imageCount > 0 && doneCount >= imageCount

  const realFootageScenes = scenes.filter(s => s.shot_type === 'real_footage')

  const handleAutoSourceClips = async () => {
    if (realFootageScenes.length === 0) return

    setIsSourcing(true)
    setClipProgress({})

    try {
      const response = await fetch('/api/clips/auto-source', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ scenes, projectId }),
      })

      const reader  = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text  = decoder.decode(value)
        const lines = text.split('\n').filter(l => l.startsWith('data:'))

        for (const line of lines) {
          try {
            const event = JSON.parse(line.slice(5).trim())

            if (event.scene_id) {
              setClipProgress(prev => ({ ...prev, [event.scene_id]: event }))
            }

            if (event.type === 'done' && event.clip) {
              onSelectClip(event.scene_id, event.clip)
            }

            if (event.type === 'fallback' || event.type === 'failed' || event.type === 'no_results') {
              onConvertToImage(event.scene_id)
            }

            if (event.type === 'complete') {
              ;(event.fallbackToImage || event.convertToImage || []).forEach(id => onConvertToImage(id))
              setClipsDone(true)
              setIsSourcing(false)
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error('[VisualsStep] clip sourcing error:', err)
      setIsSourcing(false)
    }
  }

  const handleGenerateAll = () => {
    onGenerateAll()           // images + motion graphics
    handleAutoSourceClips()   // clips — runs in parallel
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: 0 }}>Visual Generation</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 6 }}>
            {imageCount} image{imageCount !== 1 ? 's' : ''} · {motionCount} motion graphic{motionCount !== 1 ? 's' : ''} · {footageCount} footage
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={() => wizard.goBack()} className="vorta-btn vorta-btn-ghost">← Back</button>
          <button
            onClick={() => { wizard.markComplete('visuals'); wizard.goNext() }}
            className="vorta-btn vorta-btn-primary"
          >
            Continue to Voice →
          </button>
        </div>
      </div>

      {/* Generate button + progress */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={handleGenerateAll}
            disabled={isGenerating || isSourcingClips || scenes.length === 0}
            className="vorta-btn vorta-btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {isGenerating ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={14} />}
            {isGenerating
              ? `Generating… (${generateProgress.done} / ${generateProgress.total})`
              : generateDone ? 'Regenerate All' : `Generate All Assets (${scenes.length})`}
          </button>
          {allDone && !isGenerating && (
            <span style={{ color: 'rgba(34,197,94,0.8)', fontSize: 13 }}>✓ All visuals ready</span>
          )}
          {!allDone && !isGenerating && imageCount > 0 && (
            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
              {doneCount} / {imageCount} images generated
            </span>
          )}
        </div>

        {generateError && (
          <div style={{
            marginTop: 12, padding: '10px 16px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 8, color: '#f87171', fontSize: 13,
          }}>
            {generateError}
          </div>
        )}
      </div>

      {/* Intelligent clip sourcing panel */}
      {realFootageScenes.length > 0 && (
        <div style={{ marginBottom: 20, padding: '16px 20px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ color: 'white', fontSize: 14, fontWeight: 600 }}>
                🎬 Real Footage — {realFootageScenes.length} scene{realFootageScenes.length !== 1 ? 's' : ''}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }}>
                Claude generates search query · Pexels + Pixabay · free commercial
              </div>
            </div>
            {!isSourcingClips && !clipsDone && (
              <button onClick={handleAutoSourceClips} className="vorta-btn vorta-btn-secondary">
                Auto-source clips
              </button>
            )}
            {clipsDone && (
              <span style={{ color: '#4ade80', fontSize: 12 }}>
                ✓ {Object.values(clipProgress).filter(p => p?.type === 'done').length}/{realFootageScenes.length} clips sourced
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {realFootageScenes.map(scene => {
              const progress = clipProgress[scene.scene_id]
              const config   = progress ? STATUS_CONFIG[progress.type] : null

              return (
                <motion.div
                  key={scene.scene_id}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '8px 10px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 6,
                    border: `1px solid ${config ? config.color + '30' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  <span style={{ fontSize: 14, flexShrink: 0 }}>
                    {config?.icon || '⏳'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 2 }}>
                      Scene {scene.scene_id}: {scene.script_excerpt?.slice(0, 60)}...
                    </div>
                    {progress && (
                      <div style={{ color: config?.color || 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                        {progress.type === 'done'
                          ? `✓ "${progress.title?.slice(0, 50)}" · ${progress.source}`
                          : progress.message || config?.label
                        }
                      </div>
                    )}
                    {progress?.confidence != null && progress.confidence < 0.5 && (
                      <div style={{ color: '#fbbf24', fontSize: 10, marginTop: 2 }}>
                        ⚠ Low confidence match
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}

      <SceneGrid
        scenes={scenes}
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
        overlaysVisible={overlaysVisible}
        onAcceptSceneOverlays={onAcceptSceneOverlays}
        onRejectSceneOverlays={onRejectSceneOverlays}
      />
    </div>
  )
}
