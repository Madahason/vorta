import { useEffect } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { buildPreviewHTML } from '../../utils/buildPreviewHTML'

const TYPE_STYLES = {
  image:          'bg-blue-500/15 text-blue-300 border-blue-500/25',
  motion_graphic: 'bg-teal-500/15 text-teal-300 border-teal-500/25',
  real_footage:   'bg-amber-500/15 text-amber-300 border-amber-500/25',
}
const TYPE_LABEL = {
  image:          'image',
  motion_graphic: 'motion graphic',
  real_footage:   'real footage',
}

export default function ScenePreviewModal({
  scene,
  sceneIndex,
  totalScenes,
  genStatus,
  onClose,
  onPrev,
  onNext,
}) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const hasPrev  = sceneIndex > 0
  const hasNext  = sceneIndex < totalScenes - 1
  const imageUrl = genStatus?.status === 'done' ? genStatus.image_path : null
  const kbAnim   = sceneIndex % 2 === 0 ? 'kenBurnsIn' : 'kenBurnsOut'

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      <style>{`
        @keyframes kenBurnsIn  { from { transform: scale(1);    } to { transform: scale(1.08); } }
        @keyframes kenBurnsOut { from { transform: scale(1.08); } to { transform: scale(1);    } }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-white/25">
            {String(sceneIndex + 1).padStart(3, '0')} / {String(totalScenes).padStart(3, '0')}
          </span>
          <span className={`text-[11px] px-2 py-0.5 rounded-md border ${TYPE_STYLES[scene.shot_type]}`}>
            {TYPE_LABEL[scene.shot_type]}
          </span>
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Scene content */}
      <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden px-16">

        <button
          onClick={onPrev}
          disabled={!hasPrev}
          className="absolute left-4 z-10 p-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-white/60 hover:text-white"
        >
          <ChevronLeft size={20} />
        </button>

        {/* 16:9 content box */}
        <div style={{
          width: '100%',
          maxWidth: 'min(100%, calc((100vh - 160px) * 16 / 9))',
          aspectRatio: '16 / 9',
        }}>
          {scene.shot_type === 'image' && (
            imageUrl
              ? <div className="w-full h-full overflow-hidden rounded-lg">
                  <img
                    src={imageUrl}
                    alt={`Scene ${sceneIndex + 1}`}
                    className="w-full h-full object-cover"
                    style={{ animation: `${kbAnim} 8s ease-in-out infinite alternate` }}
                  />
                </div>
              : <div className="w-full h-full rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                  <p className="text-sm text-white/20">No image generated yet</p>
                </div>
          )}

          {scene.shot_type === 'motion_graphic' && (
            scene.motion_component
              ? <div className="w-full h-full rounded-lg overflow-hidden border border-teal-500/20">
                  <iframe
                    srcDoc={buildPreviewHTML(scene.motion_component, scene.motion_graphic_type)}
                    title={`modal-preview-${scene.scene_id}`}
                    sandbox="allow-scripts"
                    className="w-full h-full border-0"
                  />
                </div>
              : <div className="w-full h-full rounded-lg bg-teal-500/[0.03] border border-teal-500/[0.08] flex flex-col items-center justify-center gap-2">
                  <p className="text-sm text-teal-400/30">No component built yet</p>
                  <p className="text-xs text-white/15">Use 'Build Component' to generate</p>
                </div>
          )}

          {scene.shot_type === 'real_footage' && (
            <div className="w-full h-full rounded-lg bg-amber-500/[0.03] border border-amber-500/[0.08] flex flex-col items-center justify-center gap-3">
              <p className="text-sm text-amber-400/30">Real footage</p>
              {scene.clip_search_tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 justify-center max-w-xs">
                  {scene.clip_search_tags.map(tag => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded bg-amber-500/[0.06] text-amber-400/40 border border-amber-500/[0.10]">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-white/15 mt-1">Will be matched to clip library in Phase 3</p>
            </div>
          )}
        </div>

        <button
          onClick={onNext}
          disabled={!hasNext}
          className="absolute right-4 z-10 p-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-white/60 hover:text-white"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Footer — script excerpt */}
      <div className="px-8 py-3 border-t border-white/[0.06] shrink-0">
        <p className="text-xs text-white/30 text-center max-w-2xl mx-auto leading-relaxed line-clamp-2">
          {scene.script_excerpt}
        </p>
      </div>
    </div>
  )
}
