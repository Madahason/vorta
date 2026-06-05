import { useState } from 'react'
import { Plus, Trash2, Clock, Film } from 'lucide-react'

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0)  return `${d}d ago`
  if (h > 0)  return `${h}h ago`
  if (m > 0)  return `${m}m ago`
  return 'Just now'
}

export default function Projects({ onOpen, onNew }) {
  const [projects, setProjects] = useState(
    () => JSON.parse(localStorage.getItem('vorta_projects') || '[]')
  )

  const handleDelete = (e, key) => {
    e.stopPropagation()
    const updated = projects.filter(p => p.key !== key)
    setProjects(updated)
    localStorage.setItem('vorta_projects', JSON.stringify(updated))
    localStorage.removeItem(`vorta_project_data_${key}`)
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Projects</h1>
          <p className="text-white/40 mt-1 text-sm">
            {projects.length} saved project{projects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={14} /> New project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-8 py-16 text-center">
          <Film size={28} className="text-white/15 mx-auto mb-4" />
          <p className="text-white/30 text-sm mb-1">No projects yet</p>
          <p className="text-white/20 text-xs mb-6">
            Create your first project by pasting a script in the Video Creator.
          </p>
          <button
            onClick={onNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] rounded-lg text-sm text-white/60 transition-colors"
          >
            <Plus size={13} /> New project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {projects.map(p => (
            <div
              key={p.key}
              onClick={() => onOpen(p.key)}
              className="group relative rounded-xl overflow-hidden border border-white/[0.07] hover:border-white/[0.15] bg-white/[0.025] hover:bg-white/[0.04] cursor-pointer transition-all"
            >
              {/* Thumbnail */}
              <div
                className="w-full bg-white/[0.04] flex items-center justify-center"
                style={{ paddingTop: '56.25%', position: 'relative' }}
              >
                {p.thumbnail ? (
                  <img
                    src={p.thumbnail}
                    alt={p.title}
                    style={{
                      position: 'absolute', inset: 0,
                      width: '100%', height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <Film
                    size={20}
                    style={{
                      position: 'absolute', top: '50%', left: '50%',
                      transform: 'translate(-50%, -50%)',
                      color: 'rgba(255,255,255,0.12)',
                    }}
                  />
                )}
              </div>

              {/* Meta */}
              <div className="p-3">
                <p className="text-sm text-white/80 font-medium truncate">{p.title || 'Untitled'}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-[11px] text-white/30">{p.sceneCount} scenes</span>
                  <span className="flex items-center gap-1 text-[11px] text-white/20">
                    <Clock size={10} /> {timeAgo(p.lastUpdated)}
                  </span>
                </div>
              </div>

              {/* Delete button — visible on hover */}
              <button
                onClick={e => handleDelete(e, p.key)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-black/60 text-white/40 hover:text-red-400 transition-all"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
