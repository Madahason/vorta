import { useMemo } from 'react'
import { Player } from '@remotion/player'
import { Documentary } from '@remotion-compositions/compositions/Documentary'

export function PreviewPlayer({
  scenes = [],
  imagePaths = {},
  selectedClips = {},
  globalSettings = {},
  isOpen,
  onClose,
}) {
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

  // Same duration calc as VideoPlayer.jsx
  const totalFrames = useMemo(() => {
    if (!uniqueScenes.length) return 30
    const TRANSITION_FRAMES = 12
    const raw     = uniqueScenes.reduce((sum, s) => sum + Math.max(Math.round((s.duration_seconds || 5) * fps), 30), 0)
    const overlap = Math.max(uniqueScenes.length - 1, 0) * TRANSITION_FRAMES
    return Math.max(raw - overlap, 30)
  }, [uniqueScenes])

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

  if (!isOpen) return null

  return (
    <div style={{
      position:      'fixed',
      inset:          0,
      zIndex:         200,
      background:    'rgba(0,0,0,0.95)',
      display:       'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '12px 20px',
        borderBottom:   '1px solid rgba(255,255,255,0.08)',
        flexShrink:      0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ color: 'white', fontSize: 15, fontWeight: 600 }}>Live Preview</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { label: `${stats.total} scene${stats.total !== 1 ? 's' : ''}`,            color: 'rgba(255,255,255,0.3)' },
              { label: `${stats.withVisual}/${stats.total} visuals`,    color: stats.withVisual    === stats.total && stats.total > 0 ? '#4ade80' : '#fbbf24' },
              { label: `${stats.withNarration}/${stats.total} narration`, color: stats.withNarration === stats.total && stats.total > 0 ? '#4ade80' : '#fbbf24' },
              { label: `${Math.floor(stats.totalDuration / 60)}m ${Math.round(stats.totalDuration % 60)}s`, color: 'rgba(255,255,255,0.4)' },
            ].map((pill, i) => (
              <span key={i} style={{
                fontSize:   11,
                padding:   '2px 8px',
                borderRadius: 20,
                background: 'rgba(255,255,255,0.06)',
                color:      pill.color,
              }}>
                {pill.label}
              </span>
            ))}
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            padding:    '6px 14px',
            borderRadius: 6,
            border:     '1px solid rgba(255,255,255,0.15)',
            background: 'transparent',
            color:      'rgba(255,255,255,0.6)',
            cursor:     'pointer',
            fontSize:    13,
          }}
        >
          Close
        </button>
      </div>

      {/* Player */}
      <div style={{
        flex:           1,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:         24,
        overflow:       'hidden',
      }}>
        {uniqueScenes.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
            <div style={{ fontSize: 16 }}>No scenes yet</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Analyze a script to get started</div>
          </div>
        ) : (
          <div style={{ width: '100%', maxWidth: 1200, maxHeight: '100%' }}>
            <Player
              component={Documentary}
              inputProps={inputProps}
              durationInFrames={Math.max(totalFrames, 30)}
              fps={fps}
              compositionWidth={1920}
              compositionHeight={1080}
              style={{
                width:        '100%',
                aspectRatio:  '16/9',
                borderRadius:  8,
                overflow:     'hidden',
              }}
              controls
              loop={false}
              clickToPlay
              doubleClickToFullscreen
              numberOfSharedAudioTags={20}
            />
          </div>
        )}
      </div>

      {/* Scene strip */}
      {uniqueScenes.length > 0 && (
        <div style={{
          flexShrink:    0,
          borderTop:    '1px solid rgba(255,255,255,0.06)',
          padding:      '10px 20px',
          overflowX:    'auto',
          display:      'flex',
          gap:           6,
          scrollbarWidth: 'none',
        }}>
          {uniqueScenes.map((scene, index) => {
            const thumb       = imagePaths[scene.scene_id] || scene.image_path
            const clipThumb   = selectedClips[scene.scene_id]?.thumbnailUrl
            const hasVisual   = !!(thumb || clipThumb || scene.motion_component)
            const hasNarration = !!scene.audio_path
            const typeColor   = { image: '#3b82f6', motion_graphic: '#8b5cf6', real_footage: '#f59e0b' }

            return (
              <div
                key={scene.scene_id}
                style={{
                  flexShrink:   0,
                  width:         80,
                  background:   '#111',
                  borderRadius:  6,
                  border:       `1px solid ${typeColor[scene.shot_type] || 'rgba(255,255,255,0.1)'}40`,
                  overflow:     'hidden',
                }}
              >
                <div style={{
                  width:        '100%',
                  aspectRatio:  '16/9',
                  background:   '#1a1a1a',
                  position:     'relative',
                  overflow:     'hidden',
                }}>
                  {thumb ? (
                    <img src={thumb} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  ) : clipThumb ? (
                    <img src={clipThumb} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  ) : (
                    <div style={{
                      width: '100%', height: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16,
                    }}>
                      {scene.shot_type === 'motion_graphic' ? '📊' : scene.shot_type === 'real_footage' ? '🎬' : '🖼'}
                    </div>
                  )}

                  {/* Scene number */}
                  <div style={{
                    position:   'absolute', top: 2, left: 3,
                    fontSize:    8, color: 'rgba(255,255,255,0.6)',
                    background: 'rgba(0,0,0,0.6)',
                    padding:   '1px 3px', borderRadius: 2,
                  }}>
                    {index + 1}
                  </div>

                  {/* Status dots: green = visual, blue = narration */}
                  <div style={{ position: 'absolute', bottom: 2, right: 3, display: 'flex', gap: 2 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: hasVisual    ? '#4ade80' : 'rgba(255,255,255,0.2)' }} />
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: hasNarration ? '#60a5fa' : 'rgba(255,255,255,0.2)' }} />
                  </div>
                </div>

                <div style={{
                  padding:   '2px 4px',
                  color:     'rgba(255,255,255,0.35)',
                  fontSize:   8,
                  textAlign: 'center',
                }}>
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
