import SceneGrid from '../../components/video-creator/SceneGrid'

export function ScenesStep({
  scenes, onScenesChange, sceneStatuses, onRetry,
  motionStatuses, onBuildComponent,
  clipMatches, selectedClips, onSelectClip, onConvertToImage, onManualMatch, onOpenLibrary,
  onPreviewScene, voiceoverStatuses, onOpenVoiceover,
  onOpenOverlayStudio, onAcceptSceneOverlays, onRejectSceneOverlays,
  overlayStats, onAcceptAllOverlays, onRejectAllOverlays, onOpenReviewModal,
  wizard,
}) {
  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: 'white', fontSize: 22, fontWeight: 700, margin: 0 }}>Scene Breakdown</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 6 }}>
            Review and edit the {scenes.length} scenes Claude identified.
            Change shot types, edit prompts, manage overlays.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={() => wizard.goBack()} className="vorta-btn vorta-btn-ghost">← Back</button>
          <button
            onClick={() => { wizard.markComplete('scenes'); wizard.goNext() }}
            className="vorta-btn vorta-btn-primary"
          >
            Continue to Visuals →
          </button>
        </div>
      </div>

      {overlayStats?.suggested > 0 && (
        <div style={{
          padding: '12px 18px', marginBottom: 20,
          background: 'rgba(59,130,246,0.08)',
          border: '1px solid rgba(59,130,246,0.25)',
          borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <div style={{ color: 'white', fontSize: 13 }}>
            ✨ {overlayStats.suggested} overlay suggestion{overlayStats.suggested !== 1 ? 's' : ''} ready
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onRejectAllOverlays} className="vorta-btn vorta-btn-ghost" style={{ fontSize: 12 }}>Dismiss all</button>
            <button onClick={onOpenReviewModal}   className="vorta-btn vorta-btn-secondary" style={{ fontSize: 12 }}>Review</button>
            <button onClick={onAcceptAllOverlays} className="vorta-btn vorta-btn-primary" style={{ fontSize: 12 }}>
              Accept all ({overlayStats.suggested})
            </button>
          </div>
        </div>
      )}

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
        onOpenOverlayStudio={onOpenOverlayStudio}
        onAcceptSceneOverlays={onAcceptSceneOverlays}
        onRejectSceneOverlays={onRejectSceneOverlays}
      />
    </div>
  )
}
