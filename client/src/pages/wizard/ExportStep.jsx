import { useState } from 'react'
import ExportPanel from '../../components/video-creator/ExportPanel'
import { VideoPlayer } from '../../components/video-creator/VideoPlayer'

export function ExportStep({
  scenes, sceneStatuses, selectedClips, imagePaths, globalSettings,
  voiceoverStatuses, projectId, direction, wizard,
}) {
  const [showPreview, setShowPreview] = useState(false)
  const [renderAnyway, setRenderAnyway] = useState(false)

  // DD-5: export gate — reads the stored Director Review audit. Never a hard block; the
  // user always owns the final decision via "Render anyway".
  const audit = direction?.audit || null
  const criticalWarnings = audit ? audit.warnings.filter(w => w.severity === 'critical') : []
  const hasCriticals = criticalWarnings.length > 0
  const renderBlocked = hasCriticals && !renderAnyway

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: 0 }}>Export Video</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 6 }}>
            Render your documentary as an MP4 file.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          {scenes.length > 0 && (
            <button
              onClick={() => setShowPreview(v => !v)}
              className="vorta-btn vorta-btn-secondary"
            >
              {showPreview ? 'Hide Preview' : '▶ Preview'}
            </button>
          )}
          <button onClick={() => wizard.goBack()} className="vorta-btn vorta-btn-ghost">← Back</button>
        </div>
      </div>

      {/* DD-5: export gate notice */}
      {hasCriticals && (
        <div style={{
          marginBottom: 20, padding: '14px 18px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>⚠</span>
            <div>
              <div style={{ color: '#fca5a5', fontSize: 13.5, fontWeight: 600 }}>
                Director Review found {criticalWarnings.length} critical issue{criticalWarnings.length !== 1 ? 's' : ''}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 3 }}>
                Rendering now may waste generation credits on a scene plan with known gaps.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <button onClick={() => wizard.goTo('scenes')} className="vorta-btn vorta-btn-secondary vorta-btn-sm">
              ← Review in Scenes
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
              <input type="checkbox" checked={renderAnyway} onChange={e => setRenderAnyway(e.target.checked)} />
              Render anyway
            </label>
          </div>
        </div>
      )}
      {audit && !hasCriticals && (
        <div style={{ marginBottom: 20, fontSize: 12, color: 'rgba(74,222,128,0.7)' }}>
          ✓ Director Review found no critical issues ({new Date(audit.generatedAt).toLocaleString()}).
        </div>
      )}
      {!audit && (
        <div style={{ marginBottom: 20, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
          No Director Review has been run for this project yet — consider running one from the Scenes step before rendering.
        </div>
      )}

      {showPreview && scenes.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <VideoPlayer
            scenes={scenes}
            imagePaths={imagePaths}
            selectedClips={selectedClips}
            globalSettings={globalSettings}

            style={{
              width: '100%',
              maxWidth: 900,
              aspectRatio: '16 / 9',
              borderRadius: 10,
              overflow: 'hidden',
              display: 'block',
            }}
            controls
          />
        </div>
      )}

      <ExportPanel
        scenes={scenes}
        sceneStatuses={sceneStatuses}
        selectedClips={selectedClips}
        voiceoverStatuses={voiceoverStatuses}
        projectId={projectId}
        renderBlocked={renderBlocked}
      />
    </div>
  )
}
