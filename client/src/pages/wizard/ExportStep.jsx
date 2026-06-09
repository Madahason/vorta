import ExportPanel from '../../components/video-creator/ExportPanel'

export function ExportStep({
  scenes, sceneStatuses, selectedClips, voiceoverStatuses, audioSpecs, projectId,
  wizard,
}) {
  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: 0 }}>Export Video</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 6 }}>
            Render your documentary as an MP4 file.
          </p>
        </div>
        <button onClick={() => wizard.goBack()} className="vorta-btn vorta-btn-ghost">← Back</button>
      </div>

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
