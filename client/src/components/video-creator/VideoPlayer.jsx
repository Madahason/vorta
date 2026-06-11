import { useMemo } from 'react'
import { Player }  from '@remotion/player'
import { Documentary } from '@remotion-compositions/compositions/Documentary'

export function VideoPlayer({ scenes, selectedClips, style }) {
  const fps = 30

  const inputProps = useMemo(() => {
    const seen = new Set()
    const uniqueScenes = [...(scenes || [])].reverse().filter(s => {
      if (!s?.scene_id || seen.has(s.scene_id)) return false
      seen.add(s.scene_id)
      return true
    }).reverse()

    // Build imagePaths and audioSpecs from scene data directly
    const imagePaths = {}
    const audioSpecs = []
    uniqueScenes.forEach(s => {
      if (s.image_path) imagePaths[s.scene_id] = s.image_path
      audioSpecs.push({
        scene_id:       s.scene_id,
        narration:      s.audio_path ? { url: s.audio_path, volume: 1.0 } : null,
        music:          null,
        ambient:        null,
        sting:          null,
        overlay_sounds: [],
      })
    })

    const narrationCount = audioSpecs.filter(s => s.narration).length
    if (narrationCount > 0) {
      console.log('[VideoPlayer] narration scenes:', narrationCount, '/', uniqueScenes.length)
    }

    return {
      scenes:        uniqueScenes.map(s => ({ ...s })),
      imagePaths,
      selectedClips: selectedClips || {},
      globalSettings: {},
      audioSpecs,
    }
  }, [scenes, selectedClips])

  const totalFrames = useMemo(() => {
    if (!scenes?.length) return 30
    const TRANSITION_FRAMES = 12
    const raw     = scenes.reduce((sum, s) => sum + Math.max(Math.round((s.duration_seconds || 5) * fps), 30), 0)
    const overlap = Math.max(scenes.length - 1, 0) * TRANSITION_FRAMES
    return Math.max(raw - overlap, 30)
  }, [scenes])

  if (!scenes?.length) return null

  return (
    <Player
      component={Documentary}
      inputProps={inputProps}
      durationInFrames={totalFrames}
      fps={fps}
      compositionWidth={1920}
      compositionHeight={1080}
      style={style || {
        width:        '100%',
        aspectRatio:  '16 / 9',
        borderRadius: '8px',
        overflow:     'hidden',
      }}
      controls
      loop={false}
      clickToPlay
      doubleClickToFullscreen
      numberOfSharedAudioTags={20}
      acknowledgeRemotionLicense
    />
  )
}
