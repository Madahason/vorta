import { useState } from 'react'
import ExportPanel from '../../components/video-creator/ExportPanel'
import { VideoPlayer } from '../../components/video-creator/VideoPlayer'

export function ExportStep({
  scenes, sceneStatuses, selectedClips, imagePaths, globalSettings,
  voiceoverStatuses, audioSpecs, projectId, wizard,
}) {
  const [showPreview, setShowPreview] = useState(false)

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

      {showPreview && scenes.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <VideoPlayer
            scenes={scenes}
            imagePaths={imagePaths}
            selectedClips={selectedClips}
            globalSettings={globalSettings}
            audioSpecs={audioSpecs}
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
        audioSpecs={audioSpecs}
        projectId={projectId}
      />
    </div>
  )
}
