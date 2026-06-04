import { useState, useEffect } from 'react'
import { X, Search, Film } from 'lucide-react'

const MOOD_STYLES = {
  tense:   'bg-red-500/[0.07] text-red-400/60 border-red-500/[0.14]',
  formal:  'bg-slate-500/[0.07] text-slate-400/60 border-slate-500/[0.14]',
  intense: 'bg-orange-500/[0.07] text-orange-400/60 border-orange-500/[0.14]',
  neutral: 'bg-white/[0.04] text-white/30 border-white/[0.08]',
}

export default function ClipLibrary({ onClose }) {
  const [clips,      setClips]      = useState([])
  const [categories, setCategories] = useState([])
  const [moods,      setMoods]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [query,      setQuery]      = useState('')
  const [category,   setCategory]   = useState('')
  const [mood,       setMood]       = useState('')

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (query)    params.set('q', query)
    if (category) params.set('category', category)
    if (mood)     params.set('mood', mood)

    fetch(`/api/library?${params}`)
      .then(r => r.json())
      .then(data => {
        setClips(data.clips || [])
        if (data.categories) setCategories(data.categories)
        if (data.moods)      setMoods(data.moods)
        setError(null)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [query, category, mood])

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3">
          <Film size={15} className="text-amber-400/60" />
          <span className="text-sm font-medium text-white/70">Clip Library</span>
          {!loading && (
            <span className="text-xs text-white/25">{clips.length} clip{clips.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/[0.04] shrink-0">
        <div className="flex items-center gap-2 flex-1 max-w-xs bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5">
          <Search size={12} className="text-white/25 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by tag, category, description…"
            className="flex-1 bg-transparent text-xs text-white/70 placeholder-white/20 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-white/25 hover:text-white/50 text-xs">✕</button>
          )}
        </div>

        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="text-xs bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-white/50 focus:outline-none"
        >
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={mood}
          onChange={e => setMood(e.target.value)}
          className="text-xs bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 text-white/50 focus:outline-none"
        >
          <option value="">All moods</option>
          {moods.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-white/25 py-8">
            <div className="w-3 h-3 border border-white/20 border-t-white/50 rounded-full animate-spin" />
            Loading library…
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && clips.length === 0 && (
          <div className="py-12 text-center space-y-2">
            <p className="text-sm text-white/25">No clips found</p>
            {(query || category || mood) && (
              <button
                onClick={() => { setQuery(''); setCategory(''); setMood('') }}
                className="text-xs text-white/20 hover:text-white/45 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {!loading && clips.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {clips.map(clip => (
              <ClipCard key={clip.clip_id} clip={clip} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-white/[0.06] shrink-0">
        <p className="text-[11px] text-white/20">
          Add clips to <span className="font-mono text-white/30">library/clips/</span> and update <span className="font-mono text-white/30">library/clips.json</span> to grow the library.
          Use <span className="font-mono text-white/30">yt-dlp</span> to download clips.
        </p>
      </div>
    </div>
  )
}

function ClipCard({ clip }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-amber-400/50">{clip.clip_id}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded border ${MOOD_STYLES[clip.mood] || MOOD_STYLES.neutral}`}>
              {clip.mood}
            </span>
            <span className="text-[10px] text-white/25">{clip.category}</span>
          </div>
          <p className="text-sm text-white/60">{clip.description}</p>
        </div>
        <span className="text-[11px] font-mono text-white/25 shrink-0">{clip.duration}s</span>
      </div>

      <div className="flex flex-wrap gap-1">
        {clip.tags.map(tag => (
          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/[0.05] text-amber-400/40 border border-amber-500/[0.10]">
            {tag}
          </span>
        ))}
      </div>

      <p className="text-[10px] font-mono text-white/15 truncate">{clip.file}</p>
    </div>
  )
}
