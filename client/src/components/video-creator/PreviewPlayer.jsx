import { useState, useMemo, useRef } from 'react'
import { Player } from '@remotion/player'
import { Documentary } from '@remotion-compositions/compositions/Documentary'

const TRANSITION_FRAMES = 12

function calcTotalFrames(scenes, fps) {
  if (!scenes.length) return 30
  const raw     = scenes.reduce((sum, s) => sum + Math.max(Math.round((s.duration_seconds || 5) * fps), 30), 0)
  const overlap = Math.max(scenes.length - 1, 0) * TRANSITION_FRAMES
  return Math.max(raw - overlap, 30)
}

function calcSceneStartFrame(scenes, targetId, fps) {
  let frame = 0
  for (const scene of scenes) {
    if (scene.scene_id === targetId) break
    frame += Math.max(Math.round((scene.duration_seconds || 5) * fps), 30)
    frame -= TRANSITION_FRAMES
  }
  return Math.max(frame, 0)
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
  const [selectedSceneId, setSelectedSceneId] = useState(null)
  const [editMode, setEditMode]               = useState(false)
  const playerRef = useRef(null)
  const fps = 30

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

  const totalFrames = useMemo(() => calcTotalFrames(uniqueScenes, fps), [uniqueScenes])

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

  const selectedScene = uniqueScenes.find(s => s.scene_id === selectedSceneId)

  const jumpToScene = (sceneId) => {
    setSelectedSceneId(sceneId)
    setEditMode(true)
    const frame = calcSceneStartFrame(uniqueScenes, sceneId, fps)
    if (playerRef.current) {
      playerRef.current.seekTo(frame)
      playerRef.current.pause()
    }
  }

  const exitEdit = () => { setEditMode(false); setSelectedSceneId(null) }

  if (!isOpen) return null

  const typeColor = { image: '#3b82f6', motion_graphic: '#8b5cf6', real_footage: '#f59e0b' }

  return (
    <div style={{
      position:      'fixed',
      inset:          0,
      zIndex:         200,
      background:    'rgba(0,0,0,0.97)',
      display:       'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '10px 20px',
        borderBottom:   '1px solid rgba(255,255,255,0.08)',
        flexShrink:      0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'white', fontSize: 15, fontWeight: 600 }}>Live Preview</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { label: `${stats.total} scene${stats.total !== 1 ? 's' : ''}`, color: 'rgba(255,255,255,0.3)' },
              { label: `${stats.withVisual}/${stats.total} visuals`,    color: stats.withVisual    === stats.total && stats.total > 0 ? '#4ade80' : '#fbbf24' },
              { label: `${stats.withNarration}/${stats.total} narration`, color: stats.withNarration === stats.total && stats.total > 0 ? '#4ade80' : '#fbbf24' },
              { label: `${Math.floor(stats.totalDuration / 60)}m ${Math.round(stats.totalDuration % 60)}s`, color: 'rgba(255,255,255,0.4)' },
            ].map((pill, i) => (
              <span key={i} style={{
                fontSize:   11, padding: '2px 8px', borderRadius: 20,
                background: 'rgba(255,255,255,0.06)', color: pill.color,
              }}>
                {pill.label}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {editMode && (
            <button
              onClick={exitEdit}
              style={{
                padding: '6px 14px', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'transparent', color: 'rgba(255,255,255,0.6)',
                cursor: 'pointer', fontSize: 13,
              }}
            >
              ← Full preview
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px', borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent', color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer', fontSize: 13,
            }}
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Player */}
        <div style={{
          flex:           1,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          padding:         20,
          overflow:       'hidden',
        }}>
          {uniqueScenes.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
              <div style={{ fontSize: 16 }}>No scenes yet</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>Analyze a script to get started</div>
            </div>
          ) : (
            <div style={{ width: '100%', maxWidth: editMode ? 900 : 1200, maxHeight: '100%' }}>
              <Player
                ref={playerRef}
                component={Documentary}
                inputProps={inputProps}
                durationInFrames={Math.max(totalFrames, 30)}
                fps={fps}
                compositionWidth={1920}
                compositionHeight={1080}
                style={{ width: '100%', aspectRatio: '16/9', borderRadius: 8, overflow: 'hidden' }}
                controls
                loop={false}
                clickToPlay
                doubleClickToFullscreen
                numberOfSharedAudioTags={20}
              />
            </div>
          )}
        </div>

        {/* Scene edit panel */}
        {editMode && selectedScene && (
          <div style={{
            width:         300,
            flexShrink:    0,
            borderLeft:   '1px solid rgba(255,255,255,0.08)',
            background:   '#0d0d0d',
            display:      'flex',
            flexDirection: 'column',
            overflowY:    'auto',
          }}>
            <div style={{ padding: '16px 16px 20px' }}>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                Scene {selectedScene.scene_id}
              </div>

              {/* Thumbnail */}
              <div style={{
                width: '100%', aspectRatio: '16/9',
                background: '#1a1a1a', borderRadius: 6,
                overflow: 'hidden', marginBottom: 12, position: 'relative',
              }}>
                {(() => {
                  const thumb = imagePaths[selectedScene.scene_id] || selectedScene.image_path
                  const clipThumb = selectedClips[selectedScene.scene_id]?.thumbnailUrl
                  if (thumb) return <img src={thumb} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
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
                  color: typeColor[selectedScene.shot_type] || '#888',
                  border: `1px solid ${typeColor[selectedScene.shot_type] || '#888'}44`,
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

              {/* Shot type selector */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, display: 'block', marginBottom: 4 }}>
                  Shot Type
                </label>
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

              {/* Action buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedScene.shot_type === 'image' && onRegenerateImage && (
                  <button
                    onClick={() => { onRegenerateImage(selectedScene.scene_id); onClose() }}
                    style={{
                      width: '100%', padding: 8,
                      background: 'rgba(59,130,246,0.1)',
                      border: '1px solid rgba(59,130,246,0.3)',
                      borderRadius: 6, color: '#60a5fa',
                      cursor: 'pointer', fontSize: 12,
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
                    {selectedScene.audio_path ? '✓ Voiceover ready · Go to Voice →' : '🎙 Go to Voice →'}
                  </button>
                )}

                {/* Scene stats */}
                <div style={{
                  padding: '8px 10px', background: 'rgba(255,255,255,0.03)',
                  borderRadius: 6, fontSize: 11, color: 'rgba(255,255,255,0.4)',
                }}>
                  {[
                    ['Duration', `${selectedScene.duration_seconds?.toFixed(1) || '5.0'}s`],
                    selectedScene.audio_duration && ['Narration', `${selectedScene.audio_duration.toFixed(1)}s`],
                    ['Mood', selectedScene.mood],
                    ['Transition', selectedScene.transition_out || 'dissolve'],
                  ].filter(Boolean).map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span>{label}</span>
                      <span style={{ color: 'rgba(255,255,255,0.65)' }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Scene strip */}
      {uniqueScenes.length > 0 && (
        <div
          className="wizard-nav-scroll"
          style={{
            flexShrink:  0,
            borderTop:  '1px solid rgba(255,255,255,0.06)',
            padding:    '10px 20px',
            overflowX:  'auto',
            display:    'flex',
            gap:         6,
            scrollbarWidth: 'none',
          }}
        >
          {uniqueScenes.map((scene, index) => {
            const thumb       = imagePaths[scene.scene_id] || scene.image_path
            const clipThumb   = selectedClips[scene.scene_id]?.thumbnailUrl
            const hasVisual   = !!(thumb || clipThumb || scene.motion_component)
            const hasNarration = !!scene.audio_path
            const isSelected  = scene.scene_id === selectedSceneId
            const color       = typeColor[scene.shot_type] || 'rgba(255,255,255,0.2)'

            return (
              <div
                key={scene.scene_id}
                onClick={() => jumpToScene(scene.scene_id)}
                title={`Scene ${index + 1} — click to preview and edit`}
                style={{
                  flexShrink:   0,
                  width:         80,
                  background:   isSelected ? '#1a1a2e' : '#111',
                  borderRadius:  6,
                  border:       `1px solid ${isSelected ? color : color + '40'}`,
                  overflow:     'hidden',
                  cursor:       'pointer',
                  transition:   'all 0.15s',
                  transform:    isSelected ? 'translateY(-2px)' : 'none',
                }}
              >
                <div style={{ width: '100%', aspectRatio: '16/9', background: '#1a1a1a', position: 'relative', overflow: 'hidden' }}>
                  {thumb ? (
                    <img src={thumb} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  ) : clipThumb ? (
                    <img src={clipThumb} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                      {scene.shot_type === 'motion_graphic' ? '📊' : scene.shot_type === 'real_footage' ? '🎬' : '🖼'}
                    </div>
                  )}
                  <div style={{
                    position: 'absolute', top: 2, left: 3,
                    fontSize: 8, color: 'rgba(255,255,255,0.7)',
                    background: 'rgba(0,0,0,0.65)', padding: '1px 3px', borderRadius: 2,
                  }}>
                    {index + 1}
                  </div>
                  <div style={{ position: 'absolute', bottom: 2, right: 3, display: 'flex', gap: 2 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: hasVisual    ? '#4ade80' : 'rgba(255,255,255,0.2)' }} />
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: hasNarration ? '#60a5fa' : 'rgba(255,255,255,0.2)' }} />
                  </div>
                </div>
                <div style={{ padding: '2px 4px', color: 'rgba(255,255,255,0.35)', fontSize: 8, textAlign: 'center' }}>
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
