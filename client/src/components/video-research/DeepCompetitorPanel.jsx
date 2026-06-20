import { useState, useEffect } from 'react'
import { X, Loader2, Search, Pin, PinOff, ExternalLink, AlertCircle } from 'lucide-react'

const LS_PINNED = 'vr_pinned_references'
const MAX_PINNED = 20

function loadPinned() {
  try { return JSON.parse(localStorage.getItem(LS_PINNED) || '[]') } catch { return [] }
}
function savePinned(arr) {
  try { localStorage.setItem(LS_PINNED, JSON.stringify(arr.slice(0, MAX_PINNED))) } catch {}
}

function formatK(n) { return n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n) }

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function DeepCompetitorPanel({ profile, onClose }) {
  const [dateRange, setDateRange] = useState('all')
  const [minViews, setMinViews] = useState('')
  const [maxViews, setMaxViews] = useState('')
  const [minSubs, setMinSubs] = useState('')
  const [maxSubs, setMaxSubs] = useState('')
  const [sortBy, setSortBy] = useState('views')
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pinned, setPinned] = useState(loadPinned)
  const [searched, setSearched] = useState(false)

  const ownSubs = profile?.performanceFingerprint?.subscriberCount || null

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleSearch() {
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      const filters = { dateRange, sortBy }
      if (minViews) filters.minViews = parseInt(minViews)
      if (maxViews) filters.maxViews = parseInt(maxViews)
      if (minSubs) filters.minSubs = parseInt(minSubs)
      if (maxSubs) filters.maxSubs = parseInt(maxSubs)

      const resp = await fetch('/api/research/competitors/filtered', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, filters }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Filter query failed')
      setVideos(data.videos || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function togglePin(video) {
    const current = loadPinned()
    const exists = current.findIndex(p => p.videoId === video.videoId)
    let updated
    if (exists >= 0) {
      updated = current.filter((_, i) => i !== exists)
    } else {
      updated = [video, ...current].slice(0, MAX_PINNED)
    }
    savePinned(updated)
    setPinned(updated)
  }

  function isPinned(videoId) {
    return pinned.some(p => p.videoId === videoId)
  }

  function fillSubPreset(label) {
    if (label === 'similar' && ownSubs) {
      setMinSubs(String(Math.round(ownSubs * 0.5)))
      setMaxSubs(String(Math.round(ownSubs * 2)))
    } else if (label === '10x' && ownSubs) {
      setMinSubs(String(Math.round(ownSubs * 5)))
      setMaxSubs(String(Math.round(ownSubs * 20)))
    } else if (label === 'mega') {
      setMinSubs('1000000')
      setMaxSubs('')
    }
  }

  return (
    <div className="vorta-deep-competitor fixed inset-y-0 right-0 z-40 w-[600px] flex flex-col" style={{ background: '#141414', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
      {/* Header */}
      <div className="vorta-deep-header shrink-0 px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <h3 className="text-sm font-semibold text-white">Deep Competitor Research</h3>
          <p className="text-[11px] text-white/30 mt-0.5">{(profile?.competitors || []).length} competitors</p>
        </div>
        <button onClick={onClose} className="vorta-btn vorta-btn-ghost p-1"><X size={16} /></button>
      </div>

      {/* Filters */}
      <div className="vorta-deep-filters shrink-0 px-5 py-3 space-y-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="grid grid-cols-3 gap-2">
          <div className="vorta-field">
            <label className="vorta-label">Date range</label>
            <select value={dateRange} onChange={e => setDateRange(e.target.value)} className="vorta-input text-[10px]" style={{ padding: '4px 6px' }}>
              <option value="all">All time</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="90d">90 days</option>
              <option value="1y">1 year</option>
            </select>
          </div>
          <div className="vorta-field">
            <label className="vorta-label">Min views</label>
            <input className="vorta-input text-[10px]" value={minViews} onChange={e => setMinViews(e.target.value.replace(/\D/g, ''))} placeholder="0" style={{ padding: '4px 6px' }} />
          </div>
          <div className="vorta-field">
            <label className="vorta-label">Max views</label>
            <input className="vorta-input text-[10px]" value={maxViews} onChange={e => setMaxViews(e.target.value.replace(/\D/g, ''))} placeholder="∞" style={{ padding: '4px 6px' }} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="vorta-field">
            <label className="vorta-label">Min subs</label>
            <input className="vorta-input text-[10px]" value={minSubs} onChange={e => setMinSubs(e.target.value.replace(/\D/g, ''))} placeholder="0" style={{ padding: '4px 6px' }} />
          </div>
          <div className="vorta-field">
            <label className="vorta-label">Max subs</label>
            <input className="vorta-input text-[10px]" value={maxSubs} onChange={e => setMaxSubs(e.target.value.replace(/\D/g, ''))} placeholder="∞" style={{ padding: '4px 6px' }} />
          </div>
          <div className="vorta-field">
            <label className="vorta-label">Sort by</label>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="vorta-input text-[10px]" style={{ padding: '4px 6px' }}>
              <option value="views">Views</option>
              <option value="viewsPerSubscriber">Views / Subs</option>
              <option value="recency">Most recent</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ownSubs && (
            <>
              <button onClick={() => fillSubPreset('similar')} className="vorta-btn vorta-btn-ghost text-[9px] px-2 py-0.5 rounded" style={{ color: '#c4b5fd' }}>Similar size</button>
              <button onClick={() => fillSubPreset('10x')} className="vorta-btn vorta-btn-ghost text-[9px] px-2 py-0.5 rounded" style={{ color: '#c4b5fd' }}>10× my size</button>
            </>
          )}
          <button onClick={() => fillSubPreset('mega')} className="vorta-btn vorta-btn-ghost text-[9px] px-2 py-0.5 rounded" style={{ color: '#c4b5fd' }}>Mega (1M+)</button>
          <div className="flex-1" />
          <button onClick={handleSearch} disabled={loading} className="vorta-btn vorta-btn-primary text-xs flex items-center gap-1.5 px-4 py-1.5" style={{ opacity: loading ? 0.5 : 1 }}>
            {loading ? <><Loader2 size={12} className="animate-spin" />Searching...</> : <><Search size={12} />Search</>}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="vorta-deep-results flex-1 overflow-y-auto p-5">
        {error && (
          <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs mb-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#fca5a5' }}>
            <AlertCircle size={12} className="shrink-0 mt-0.5" /><span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <Loader2 size={24} className="animate-spin text-purple-400 mx-auto mb-3" />
            <p className="text-xs text-white/30">Querying competitor channels...</p>
          </div>
        )}

        {!loading && searched && videos.length === 0 && (
          <div className="text-center py-12">
            <Search size={20} className="text-white/10 mx-auto mb-2" />
            <p className="text-xs text-white/30">No videos match your filters</p>
          </div>
        )}

        {!loading && !searched && (
          <div className="text-center py-12">
            <p className="text-xs text-white/20">Set your filters and click Search</p>
          </div>
        )}

        {!loading && videos.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] text-white/25 mb-2">{videos.length} video{videos.length !== 1 ? 's' : ''} found</p>
            {videos.map(v => (
              <div key={v.videoId} className="vorta-deep-card flex gap-3 rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="shrink-0 w-36 rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                  {v.thumbnails?.medium ? (
                    <img src={v.thumbnails.medium} alt="" className="w-full aspect-video object-cover" onError={e => { e.target.style.display = 'none' }} />
                  ) : (
                    <div className="w-full aspect-video bg-black/30 flex items-center justify-center"><Search size={14} className="text-white/10" /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-white hover:text-purple-300 leading-snug block mb-1 line-clamp-2">
                    {v.title} <ExternalLink size={9} className="inline ml-0.5 -mt-0.5" />
                  </a>
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.1)', color: '#c4b5fd' }}>{v.channelName}</span>
                    <span className="text-[9px] text-white/30">{formatK(v.viewCount)} views</span>
                    {v.channelSubscriberCount > 0 && <span className="text-[9px] text-white/20">{formatK(v.channelSubscriberCount)} subs</span>}
                    {v.viewsPerSubscriber !== null && (
                      <span className="text-[9px] text-green-400/60">{v.viewsPerSubscriber.toFixed(1)}× subs</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-white/20">{formatDate(v.publishedAt)}</span>
                    <button onClick={() => togglePin(v)} className="vorta-btn vorta-btn-ghost text-[9px] flex items-center gap-1 px-1.5 py-0.5" style={{ color: isPinned(v.videoId) ? '#86efac' : 'rgba(255,255,255,0.3)' }}>
                      {isPinned(v.videoId) ? <><PinOff size={9} />Unpin</> : <><Pin size={9} />Pin</>}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pinned references strip */}
      {pinned.length > 0 && (
        <div className="vorta-deep-pinned shrink-0 px-5 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="text-[9px] text-white/25 block mb-1">Pinned ({pinned.length}/{MAX_PINNED})</span>
          <div className="flex gap-1 overflow-x-auto">
            {pinned.slice(0, 10).map(p => (
              <div key={p.videoId} className="shrink-0 w-16 rounded overflow-hidden cursor-pointer" title={p.title} onClick={() => togglePin(p)} style={{ border: '1px solid rgba(34,197,94,0.2)' }}>
                {p.thumbnails?.default ? <img src={p.thumbnails.default} alt="" className="w-full aspect-video object-cover" /> : <div className="w-full aspect-video bg-black/30" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
