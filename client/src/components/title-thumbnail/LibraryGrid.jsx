import { useState, useEffect } from 'react'
import { Search, ImageIcon, Filter, Clock, ArrowRight } from 'lucide-react'

const STATUS_COLORS = {
  titled:      { bg: 'rgba(59,130,246,0.10)', color: '#93c5fd', label: 'Titled' },
  thumbnailed: { bg: 'rgba(245,158,11,0.10)', color: '#fbbf24', label: 'Thumbnailed' },
  composed:    { bg: 'rgba(34,197,94,0.10)', color: '#86efac', label: 'Composed' },
}

const STYLE_MODES = [
  { id: 'curiosity_gap', label: 'Curiosity Gap' },
  { id: 'stat_driven', label: 'Stat Driven' },
  { id: 'face_or_figure', label: 'Face / Figure' },
  { id: 'object_icon', label: 'Object Icon' },
  { id: 'before_after', label: 'Before / After' },
  { id: 'scene_dramatization', label: 'Scene Drama' },
]

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function LibraryGrid({ onOpenBrief }) {
  const [briefs, setBriefs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => {
    fetch('/api/title-thumbnail/library')
      .then(r => r.json())
      .then(data => setBriefs(data.briefs || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = briefs.filter(b => {
    if (filterMode && b.styleMode !== filterMode) return false
    if (filterStatus && b.status !== filterStatus) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const match = (b.idea || '').toLowerCase().includes(q)
        || (b.angle || '').toLowerCase().includes(q)
        || (b.selectedTitle || '').toLowerCase().includes(q)
        || (b.niche || '').toLowerCase().includes(q)
      if (!match) return false
    }
    return true
  })

  if (loading) {
    return (
      <div className="vorta-tt-library-loading text-center py-8">
        <div className="w-6 h-6 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-white/30">Loading library...</p>
      </div>
    )
  }

  if (briefs.length === 0) {
    return (
      <div className="vorta-tt-library-empty text-center py-12">
        <ImageIcon size={28} className="text-white/10 mx-auto mb-3" />
        <p className="text-sm text-white/30 mb-1">No thumbnails yet</p>
        <p className="text-xs text-white/20">Generate your first title and thumbnail to see it here.</p>
      </div>
    )
  }

  return (
    <div className="vorta-tt-library">
      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
          <input
            className="vorta-input text-xs pl-7"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search titles, ideas..."
            style={{ padding: '6px 10px 6px 28px' }}
          />
        </div>
        <select
          value={filterMode}
          onChange={e => setFilterMode(e.target.value)}
          className="vorta-input text-[10px]"
          style={{ width: 'auto', padding: '5px 8px' }}
        >
          <option value="">All styles</option>
          {STYLE_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="vorta-input text-[10px]"
          style={{ width: 'auto', padding: '5px 8px' }}
        >
          <option value="">All status</option>
          <option value="titled">Titled</option>
          <option value="thumbnailed">Thumbnailed</option>
          <option value="composed">Composed</option>
        </select>
      </div>

      <p className="text-[10px] text-white/20 mb-3">{filtered.length} brief{filtered.length !== 1 ? 's' : ''}</p>

      {/* Grid */}
      <div className="grid grid-cols-3 gap-3">
        {filtered.map(b => {
          const thumb = b.finalImagePath || (b.baseImages && b.baseImages[0])
          const st = STATUS_COLORS[b.status] || STATUS_COLORS.titled
          return (
            <button
              key={b.briefId}
              onClick={() => onOpenBrief(b)}
              className="vorta-library-card text-left rounded-lg overflow-hidden transition-all hover:border-purple-500/30 group"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="aspect-video bg-black/40 relative">
                {thumb ? (
                  <img src={thumb} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none' }} />
                ) : (
                  <div className="flex items-center justify-center h-full"><ImageIcon size={20} className="text-white/10" /></div>
                )}
                <div className="absolute top-1.5 right-1.5">
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-medium" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                </div>
              </div>
              <div className="p-2.5">
                <p className="text-xs font-medium text-white/80 leading-snug mb-1 line-clamp-2">{b.selectedTitle || b.idea || 'Untitled'}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-white/25">{b.niche || ''}</span>
                  <span className="text-[9px] text-white/20 flex items-center gap-0.5"><Clock size={7} />{formatDate(b.createdAt)}</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
