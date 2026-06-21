import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Player } from '@remotion/player'
import { Documentary, calculateDocumentaryDuration, computeSceneStartFrames } from '@remotion-compositions/compositions/Documentary'

function calcSceneStartFrame(scenes, targetId, fps) {
  const starts = computeSceneStartFrames(scenes, fps)
  const idx = scenes.findIndex(s => s.scene_id === targetId)
  return idx >= 0 ? starts[idx] : 0
}

export function PreviewPlayer({
  scenes = [],
  imagePaths = {},
  selectedClips = {},
  globalSettings = {},
  sceneStatuses = {},
  isOpen,
  onClose,
  onRegenerateImage,
  onRegenerateVoice,
  onShotTypeChange,
}) {
  const playerRef = useRef(null)
  const fps = 30

  // ── Playback state ──
  const [isPlaying,    setIsPlaying]    = useState(false)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [isMuted,      setIsMuted]      = useState(false)
  const [volume,       setVolume]       = useState(1)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [showRateMenu, setShowRateMenu] = useState(false)

  // ── Edit state ──
  const [selectedSceneId, setSelectedSceneId] = useState(null)
  const [editMode,        setEditMode]         = useState(false)

  // ── Derived data ──
  const uniqueScenes = useMemo(() => {
    const seen = new Set()
    return scenes.filter(s => {
      if (!s.scene_id || seen.has(s.scene_id)) return false
      seen.add(s.scene_id)
      return true
    })
  }, [scenes])

  const audioSpecs = useMemo(() =>
    uniqueScenes.map(scene => ({
      scene_id:  scene.scene_id,
      narration: scene.audio_path ? { url: scene.audio_path, volume: 1.0 } : null,
    })),
  [uniqueScenes])

  const totalFrames = useMemo(() => calculateDocumentaryDuration(uniqueScenes, fps), [uniqueScenes, fps])

  const inputProps = useMemo(() => ({
    scenes:         uniqueScenes.map(s => ({ ...s })),
    imagePaths:     imagePaths    || {},
    selectedClips:  selectedClips || {},
    globalSettings: globalSettings || {},
    audioSpecs,
  }), [uniqueScenes, imagePaths, selectedClips, globalSettings, audioSpecs])

  const stats = useMemo(() => {
    const total         = uniqueScenes.length
    const withVisual    = uniqueScenes.filter(s =>
      imagePaths[s.scene_id] || s.image_path || s.motion_component || selectedClips[s.scene_id]
    ).length
    const withNarration = uniqueScenes.filter(s => s.audio_path).length
    const totalDuration = uniqueScenes.reduce((sum, s) => sum + (s.duration_seconds || 5), 0)
    return { total, withVisual, withNarration, totalDuration }
  }, [uniqueScenes, selectedClips, imagePaths])

  const sceneStarts = useMemo(() => computeSceneStartFrames(uniqueScenes, fps), [uniqueScenes, fps])

  const currentSceneIndex = useMemo(() => {
    for (let i = sceneStarts.length - 1; i >= 0; i--) {
      if (currentFrame >= sceneStarts[i]) return i
    }
    return 0
  }, [currentFrame, sceneStarts])

  // ── Player event listeners ──
  useEffect(() => {
    if (!isOpen || !playerRef.current) return

    const player = playerRef.current
    const onPlay        = () => setIsPlaying(true)
    const onPause       = () => setIsPlaying(false)
    const onFrameUpdate = (e) => setCurrentFrame(e.detail.frame)
    const onEnded       = () => { setIsPlaying(false); setCurrentFrame(0) }

    player.addEventListener('play',        onPlay)
    player.addEventListener('pause',       onPause)
    player.addEventListener('frameupdate', onFrameUpdate)
    player.addEventListener('ended',       onEnded)

    return () => {
      player.removeEventListener('play',        onPlay)
      player.removeEventListener('pause',       onPause)
      player.removeEventListener('frameupdate', onFrameUpdate)
      player.removeEventListener('ended',       onEnded)
    }
  }, [isOpen])

  // Close rate menu on outside click
  useEffect(() => {
    if (!showRateMenu) return
    const close = () => setShowRateMenu(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [showRateMenu])

  // ── Control handlers ──
  const handlePlayPause = useCallback(() => {
    if (!playerRef.current) return
    isPlaying ? playerRef.current.pause() : playerRef.current.play()
  }, [isPlaying])

  const handleSeek = useCallback((e) => {
    if (!playerRef.current) return
    const frame = parseInt(e.target.value, 10)
    playerRef.current.seekTo(frame)
    setCurrentFrame(frame)
  }, [])

  const handleRestart = useCallback(() => {
    if (!playerRef.current) return
    playerRef.current.seekTo(0)
    playerRef.current.play()
  }, [])

  const handleSkipBack = useCallback(() => {
    if (!playerRef.current) return
    playerRef.current.seekTo(Math.max(currentFrame - fps * 5, 0))
  }, [currentFrame])

  const handleSkipForward = useCallback(() => {
    if (!playerRef.current) return
    playerRef.current.seekTo(Math.min(currentFrame + fps * 5, totalFrames - 1))
  }, [currentFrame, totalFrames])

  const handleMuteToggle = useCallback(() => {
    if (!playerRef.current) return
    const next = !isMuted
    setIsMuted(next)
    playerRef.current.setVolume(next ? 0 : volume)
  }, [isMuted, volume])

  const handleVolumeChange = useCallback((e) => {
    if (!playerRef.current) return
    const val = parseFloat(e.target.value)
    setVolume(val)
    setIsMuted(val === 0)
    playerRef.current.setVolume(val)
  }, [])

  const handlePlaybackRate = useCallback((rate) => {
    if (!playerRef.current) return
    setPlaybackRate(rate)
    setShowRateMenu(false)
    playerRef.current.setPlaybackRate(rate)
  }, [])

  const handleFullscreen = useCallback(() => {
    playerRef.current?.requestFullscreen()
  }, [])

  // ── Scene jump ──
  const jumpToScene = useCallback((sceneId) => {
    setSelectedSceneId(sceneId)
    setEditMode(true)
    const frame = calcSceneStartFrame(uniqueScenes, sceneId, fps)
    if (playerRef.current) {
      playerRef.current.seekTo(frame)
      playerRef.current.pause()
    }
  }, [uniqueScenes])

  const exitEdit = () => { setEditMode(false); setSelectedSceneId(null) }

  // ── Helpers ──
  const formatTime = (frame) => {
    const totalSecs = frame / fps
    const mins = Math.floor(totalSecs / 60)
    const secs = Math.floor(totalSecs % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!isOpen) return null

  const progressPercent  = totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 0
  const selectedScene    = uniqueScenes.find(s => s.scene_id === selectedSceneId)
  const currentScene     = uniqueScenes[currentSceneIndex]
  const typeColor        = { image: '#3b82f6', motion_graphic: '#8b5cf6', real_footage: '#f59e0b' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#050505', display: 'flex', flexDirection: 'column' }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0, background: 'rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'white', fontSize: 14, fontWeight: 600 }}>Live Preview</span>

          {/* Stats pills */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { label: `${stats.total} scenes`,                           ok: null },
              { label: `${stats.withVisual}/${stats.total} visuals`,      ok: stats.withVisual    === stats.total && stats.total > 0 },
              { label: `${stats.withNarration}/${stats.total} narration`, ok: stats.withNarration === stats.total && stats.total > 0 },
            ].map((pill, i) => (
              <span key={i} style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 20,
                background: 'rgba(255,255,255,0.05)',
                color: pill.ok === null ? 'rgba(255,255,255,0.3)' : pill.ok ? '#4ade80' : '#fbbf24',
              }}>
                {pill.label}
              </span>
            ))}
          </div>

          {/* Current scene indicator */}
          {currentScene && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 4,
              background: `${typeColor[currentScene.shot_type] || '#3b82f6'}20`,
              color:      typeColor[currentScene.shot_type] || '#3b82f6',
              border:    `1px solid ${typeColor[currentScene.shot_type] || '#3b82f6'}40`,
            }}>
              Scene {currentSceneIndex + 1}/{uniqueScenes.length}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {editMode && (
            <button onClick={exitEdit} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12 }}>
              ← Back
            </button>
          )}
          <button onClick={onClose} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12 }}>
            ✕ Close
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Player area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Video */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 20px 8px', overflow: 'hidden' }}>
            {uniqueScenes.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>🎬</div>
                <div style={{ fontSize: 14 }}>No scenes yet</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>Analyze a script to get started</div>
              </div>
            ) : (
              <div style={{ width: '100%', maxWidth: editMode ? 900 : 1100, maxHeight: '100%' }}>
                <Player
                  ref={playerRef}
                  component={Documentary}
                  inputProps={inputProps}
                  durationInFrames={Math.max(totalFrames, 30)}
                  fps={fps}
                  compositionWidth={1920}
                  compositionHeight={1080}
                  style={{ width: '100%', aspectRatio: '16/9', borderRadius: 6, overflow: 'hidden' }}
                  controls={false}
                  loop={false}
                  clickToPlay={false}
                  numberOfSharedAudioTags={256}
                  acknowledgeRemotionLicense
                />
              </div>
            )}
          </div>

          {/* ── Custom Controls ── */}
          {uniqueScenes.length > 0 && (
            <div style={{ flexShrink: 0, padding: '0 20px 12px', background: 'rgba(0,0,0,0.3)' }}>

              {/* Progress bar with scene markers */}
              <div style={{ position: 'relative', marginBottom: 10 }}>
                {/* Scene markers */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '100%', pointerEvents: 'none', zIndex: 2 }}>
                  {uniqueScenes.map((scene, i) => {
                    const pct = ((sceneStarts[i] || 0) / totalFrames) * 100
                    if (pct <= 0 || pct >= 100) return null
                    return (
                      <div key={scene.scene_id} style={{
                        position: 'absolute', left: `${pct}%`,
                        top: '50%', transform: 'translateY(-50%)',
                        width: 1, height: 10,
                        background: 'rgba(255,255,255,0.25)', zIndex: 2,
                      }} />
                    )
                  })}
                </div>

                <input
                  type="range"
                  min={0}
                  max={totalFrames - 1}
                  value={currentFrame}
                  onChange={handleSeek}
                  style={{
                    width: '100%', height: 4,
                    appearance: 'none', WebkitAppearance: 'none',
                    background: `linear-gradient(to right, #3b82f6 ${progressPercent}%, rgba(255,255,255,0.15) ${progressPercent}%)`,
                    borderRadius: 2, outline: 'none', cursor: 'pointer',
                    position: 'relative', zIndex: 3,
                  }}
                />
              </div>

              {/* Control buttons row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

                {/* Left controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ControlButton onClick={handleRestart} title="Restart">⏮</ControlButton>
                  <ControlButton onClick={handleSkipBack} title="Back 5 seconds">↺5</ControlButton>

                  {/* Play/Pause — primary button */}
                  <button
                    onClick={handlePlayPause}
                    title={isPlaying ? 'Pause' : 'Play'}
                    style={{
                      width: 40, height: 40, borderRadius: '50%',
                      border: 'none', background: '#3b82f6', color: 'white',
                      cursor: 'pointer', fontSize: 16, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#2563eb' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#3b82f6' }}
                  >
                    {isPlaying ? '⏸' : '▶'}
                  </button>

                  <ControlButton onClick={handleSkipForward} title="Forward 5 seconds">5↻</ControlButton>
                </div>

                {/* Time display */}
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'monospace', marginLeft: 4, flexShrink: 0 }}>
                  {formatTime(currentFrame)} / {formatTime(totalFrames)}
                </div>

                <div style={{ flex: 1 }} />

                {/* Volume */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ControlButton onClick={handleMuteToggle} title={isMuted ? 'Unmute' : 'Mute'}>
                    {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
                  </ControlButton>
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="volume-slider"
                    style={{
                      width: 70, height: 3,
                      appearance: 'none', WebkitAppearance: 'none',
                      background: `linear-gradient(to right, rgba(255,255,255,0.6) ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.15) ${(isMuted ? 0 : volume) * 100}%)`,
                      borderRadius: 2, outline: 'none', cursor: 'pointer',
                    }}
                  />
                </div>

                {/* Playback speed */}
                <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setShowRateMenu(prev => !prev)}
                    style={{
                      padding: '4px 8px', borderRadius: 5,
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'rgba(255,255,255,0.6)',
                      cursor: 'pointer', fontSize: 11, fontFamily: 'monospace',
                    }}
                  >
                    {playbackRate}x
                  </button>
                  {showRateMenu && (
                    <div style={{
                      position: 'absolute', bottom: '100%', right: 0,
                      marginBottom: 6, background: '#1a1a1a',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 8, overflow: 'hidden',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.6)', zIndex: 100,
                    }}>
                      {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => (
                        <button
                          key={rate}
                          onClick={() => handlePlaybackRate(rate)}
                          style={{
                            display: 'block', width: '100%',
                            padding: '7px 20px', textAlign: 'center',
                            background: playbackRate === rate ? 'rgba(59,130,246,0.15)' : 'transparent',
                            color: playbackRate === rate ? '#60a5fa' : 'rgba(255,255,255,0.6)',
                            border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'monospace',
                          }}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Fullscreen */}
                <ControlButton onClick={handleFullscreen} title="Fullscreen">⛶</ControlButton>
              </div>
            </div>
          )}
        </div>

        {/* ── Scene editor panel ── */}
        {editMode && selectedScene && (
          <div style={{
            width: 300, flexShrink: 0,
            borderLeft: '1px solid rgba(255,255,255,0.07)',
            background: '#0d0d0d',
            display: 'flex', flexDirection: 'column', overflowY: 'auto',
          }}>
            <div style={{ padding: '16px 16px 20px' }}>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                Scene {selectedScene.scene_id}
              </div>

              {/* Thumbnail */}
              <div style={{ width: '100%', aspectRatio: '16/9', background: '#1a1a1a', borderRadius: 6, overflow: 'hidden', marginBottom: 12, position: 'relative' }}>
                {(() => {
                  const thumb     = imagePaths[selectedScene.scene_id] || selectedScene.image_path
                  const clipThumb = selectedClips[selectedScene.scene_id]?.thumbnailUrl
                  if (thumb)     return <img src={thumb}     style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  if (clipThumb) return <img src={clipThumb} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  return (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 28 }}>
                      {selectedScene.shot_type === 'motion_graphic' ? '📊' : selectedScene.shot_type === 'real_footage' ? '🎬' : '🖼'}
                    </div>
                  )
                })()}
                <div style={{
                  position: 'absolute', top: 6, left: 6,
                  padding: '2px 6px', borderRadius: 3, fontSize: 9,
                  background: (typeColor[selectedScene.shot_type] || '#888') + '33',
                  color:       typeColor[selectedScene.shot_type] || '#888',
                  border:     `1px solid ${typeColor[selectedScene.shot_type] || '#888'}44`,
                }}>
                  {selectedScene.shot_type}
                </div>
              </div>

              {/* Script excerpt */}
              <div style={{
                color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 1.5,
                marginBottom: 14, padding: '8px 10px',
                background: 'rgba(255,255,255,0.03)', borderRadius: 6,
                borderLeft: '2px solid rgba(255,255,255,0.1)',
              }}>
                "{selectedScene.script_excerpt}"
              </div>

              {/* Shot type */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, display: 'block', marginBottom: 4 }}>Shot Type</label>
                <select
                  value={selectedScene.shot_type}
                  onChange={e => onShotTypeChange?.(selectedScene.scene_id, e.target.value)}
                  className="vorta-select"
                  style={{ width: '100%' }}
                >
                  <option value="image">Image (Higgsfield)</option>
                  <option value="motion_graphic">Motion Graphic</option>
                  <option value="real_footage">Stock Footage</option>
                </select>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedScene.shot_type === 'image' && onRegenerateImage && (
                  <button
                    onClick={() => { onRegenerateImage(selectedScene.scene_id); onClose() }}
                    style={{
                      width: '100%', padding: 8,
                      background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)',
                      borderRadius: 6, color: '#60a5fa', cursor: 'pointer', fontSize: 12,
                    }}
                  >
                    🔄 Regenerate Image
                  </button>
                )}
                {onRegenerateVoice && (
                  <button
                    onClick={() => { onRegenerateVoice(selectedScene.scene_id); onClose() }}
                    style={{
                      width: '100%', padding: 8,
                      background: selectedScene.audio_path ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)',
                      border: `1px solid ${selectedScene.audio_path ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}`,
                      borderRadius: 6,
                      color: selectedScene.audio_path ? '#4ade80' : '#fbbf24',
                      cursor: 'pointer', fontSize: 12,
                    }}
                  >
                    {selectedScene.audio_path ? '✓ Voiceover ready · Regenerate' : '🎙 Generate Voice'}
                  </button>
                )}

                {/* Scene info */}
                <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                  {[
                    ['Duration',   `${selectedScene.duration_seconds?.toFixed(1) || '5.0'}s`],
                    selectedScene.audio_duration && ['Narration', `${selectedScene.audio_duration.toFixed(1)}s`],
                    ['Mood',       selectedScene.mood],
                    ['Grade',      selectedScene.grade || 'cool_blue'],
                    ['Motion',     selectedScene.motion?.type || 'push_in'],
                    ['Transition', selectedScene.transition_out || 'dissolve'],
                  ].filter(Boolean).map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>{label}</span>
                      <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10 }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Scene strip ── */}
      {uniqueScenes.length > 0 && (
        <div
          className="wizard-nav-scroll"
          style={{
            flexShrink: 0,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            padding: '8px 16px',
            overflowX: 'auto', display: 'flex', gap: 5,
            scrollbarWidth: 'none', background: 'rgba(0,0,0,0.3)',
          }}
        >
          {uniqueScenes.map((scene, index) => {
            const thumb        = imagePaths[scene.scene_id] || scene.image_path
            const clipThumb    = selectedClips[scene.scene_id]?.thumbnailUrl
            const hasVisual    = !!(thumb || clipThumb || scene.motion_component)
            const hasNarration = !!scene.audio_path
            const isSelected   = scene.scene_id === selectedSceneId
            const isCurrent    = index === currentSceneIndex
            const color        = typeColor[scene.shot_type] || 'rgba(255,255,255,0.2)'

            return (
              <div
                key={scene.scene_id}
                onClick={() => jumpToScene(scene.scene_id)}
                title={`Scene ${index + 1}: ${scene.script_excerpt?.slice(0, 50)}`}
                style={{
                  flexShrink: 0, width: 72,
                  background: isCurrent ? '#111' : '#0d0d0d',
                  borderRadius: 5,
                  border: `1px solid ${isSelected ? color : isCurrent ? 'rgba(255,255,255,0.2)' : color + '30'}`,
                  overflow: 'hidden', cursor: 'pointer',
                  transition: 'all 0.15s',
                  transform:  isCurrent ? 'translateY(-2px)' : 'none',
                  boxShadow:  isCurrent ? `0 4px 12px ${color}30` : 'none',
                }}
              >
                <div style={{ width: '100%', aspectRatio: '16/9', background: '#1a1a1a', position: 'relative', overflow: 'hidden' }}>
                  {thumb ? (
                    <img src={thumb}     style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  ) : clipThumb ? (
                    <img src={clipThumb} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                      {scene.shot_type === 'motion_graphic' ? '📊' : scene.shot_type === 'real_footage' ? '🎬' : '🖼'}
                    </div>
                  )}
                  <div style={{ position: 'absolute', top: 2, left: 3, fontSize: 8, color: 'white', background: 'rgba(0,0,0,0.65)', padding: '1px 3px', borderRadius: 2 }}>
                    {index + 1}
                  </div>
                  {isCurrent && (
                    <div style={{ position: 'absolute', inset: 0, border: `1px solid ${color}`, pointerEvents: 'none' }} />
                  )}
                  <div style={{ position: 'absolute', bottom: 2, right: 3, display: 'flex', gap: 2 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: hasVisual    ? '#4ade80' : 'rgba(255,255,255,0.15)' }} />
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: hasNarration ? '#60a5fa' : 'rgba(255,255,255,0.15)' }} />
                  </div>
                </div>
                <div style={{ padding: '2px 4px', color: isCurrent ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)', fontSize: 8, textAlign: 'center' }}>
                  {scene.duration_seconds?.toFixed(1) || '5.0'}s
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Reusable control button ──────────────────────────────────────────────────

const ControlButton = ({ onClick, title, children }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      width: 30, height: 30, borderRadius: 6,
      border: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.04)',
      color: 'rgba(255,255,255,0.6)',
      cursor: 'pointer', fontSize: 12, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.15s',
    }}
    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'white' }}
    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
  >
    {children}
  </button>
)
