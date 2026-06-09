import { useState } from 'react'
import AudioPanel from '../../components/video-creator/AudioPanel'
import { SoundLibraryPanel } from '../../components/video-creator/SoundLibraryPanel'

export function AudioStep({
  scenes, projectId, audioSpecs, onBuildSpecs, onApplySpecs, audioVolumes, onVolumesChange,
  wizard,
}) {
  const [showSoundLibrary, setShowSoundLibrary] = useState(false)

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: 0 }}>Background Audio</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 6 }}>
            Generate background music and ambient sound for your video.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button
            onClick={() => setShowSoundLibrary(true)}
            className="vorta-btn vorta-btn-secondary"
          >
            🎵 Sound Library
          </button>
          <button onClick={() => wizard.goBack()} className="vorta-btn vorta-btn-ghost">← Back</button>
          <button
            onClick={() => { wizard.markComplete('audio'); wizard.goNext() }}
            className="vorta-btn vorta-btn-primary"
          >
            Continue to Export →
          </button>
        </div>
      </div>

      <AudioPanel
        scenes={scenes}
        projectId={projectId}
        audioSpecs={audioSpecs}
        onBuildSpecs={onBuildSpecs}
        onApplySpecs={onApplySpecs}
        audioVolumes={audioVolumes}
        onVolumesChange={onVolumesChange}
      />

      <SoundLibraryPanel
        isOpen={showSoundLibrary}
        onClose={() => setShowSoundLibrary(false)}
      />
    </div>
  )
}
