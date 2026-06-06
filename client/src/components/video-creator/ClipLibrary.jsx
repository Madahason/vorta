import { useState, useEffect, useRef } from 'react'
import { X, Search, Film, Plus, Trash2, AlertCircle, Loader2, Zap, Download, CheckCircle } from 'lucide-react'

const SERVER_URL = 'http://localhost:3001'

const TABS = [
  { id: 'library',  label: 'My Library' },
  { id: 'youtube_cc',  label: 'YouTube CC' },
  { id: 'fair_use', label: 'Fair Use' },
  { id: 'archive',  label: 'Archive' },
  { id: 'cspan',    label: 'C-SPAN' },
]

const MOOD_OPTIONS = ['tense', 'formal', 'intense', 'neutral', 'anticipatory']

function LicenseBadge({ license }) {
  if (license === 'creative_commons' || license === 'public_domain') {
    return (
      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(34,197,94,0.10)', color: 'rgba(74,222,128,0.80)', border: '1px solid rgba(34,197,94,0.20)' }}>
        {license === 'public_domain' ? 'PD' : 'CC'}
      </span>
    )
  }
  if (license === 'fair_use') {
    return (
      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(251,191,36,0.10)', color: 'rgba(251,191,36,0.80)', border: '1px solid rgba(251,191,36,0.20)' }}>
        ⚠ FU
      </span>
    )
  }
  return (
    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.30)', border: '1px solid rgba(255,255,255,0.08)' }}>
      ?
    </span>
  )
}

export default function ClipLibrary({ onClose, projectId }) {
  const [visible,    setVisible]    = useState(false)
  const [tab,        setTab]        = useState('library')

  // Library tab state
  const [allClips,   setAllClips]   = useState([])
  const [clips,      setClips]      = useState([])
  const [categories, setCategories] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [libError,   setLibError]   = useState(null)
  const [query,      setQuery]      = useState('')
  const [catFilter,  setCatFilter]  = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [deleting,   setDeleting]   = useState(null)
  const [gaps,       setGaps]       = useState({ total: 0, topTags: [] })

  // yt-dlp status
  const [ytdlpStatus, setYtdlpStatus] = useState(null)

  // Seeding state
  const [seeding,    setSeeding]    = useState(false)
  const [seedEvents, setSeedEvents] = useState([])
  const seedEsRef                   = useRef(null)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    setVisible(false)
    seedEsRef.current?.close()
    setTimeout(onClose, 280)
  }

  const fetchLibrary = (q = query, cat = catFilter) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q)   params.set('q', q)
    if (cat) params.set('category', cat)
    fetch(`/api/library?${params}`)
      .then(r => r.json())
      .then(data => {
        setClips(data.clips || [])
        if (!q && !cat) setAllClips(data.clips || [])
        setCategories(data.categories || [])
        setLibError(null)
      })
      .catch(e => setLibError(e.message))
      .finally(() => setLoading(false))
  }

  const fetchGaps = () => {
    fetch('/api/library/gaps')
      .then(r => r.json())
      .then(data => setGaps({ total: data.total || 0, topTags: data.topTags || [] }))
      .catch(() => { /* ignore */ })
  }

  const fetchStatus = () => {
    fetch('/api/library/status')
      .then(r => r.json())
      .then(data => setYtdlpStatus(data))
      .catch(() => { /* ignore */ })
  }

  useEffect(() => { fetchLibrary(); fetchGaps(); fetchStatus() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchLibrary(query, catFilter) }, [query, catFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (clip_id) => {
    setDeleting(clip_id)
    try {
      await fetch(`/api/library/${clip_id}`, { method: 'DELETE' })
      fetchLibrary()
      fetchGaps()
    } catch { /* ignore */ }
    finally { setDeleting(null) }
  }

  const handleSeed = async () => {
    const meta = (() => {
      try { return JSON.parse(localStorage.getItem('vorta_script_metadata') || '{}') } catch { return {} }
    })()
    setSeeding(true)
    setSeedEvents([])
    try {
      const res  = await fetch('/api/library/seed', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: meta.title || 'Documentary', niche: meta.niche || 'General', projectId, maxClips: 15 }),
      })
      const { seedId } = await res.json()
      seedEsRef.current?.close()
      const es = new EventSource(`${SERVER_URL}/api/library/seed/progress/${seedId}`)
      seedEsRef.current = es
      es.onmessage = e => {
        const ev = JSON.parse(e.data)
        setSeedEvents(prev => [...prev, ev])
        if (ev.type === 'seed_complete' || ev.type === 'seed_error') {
          setSeeding(false)
          fetchLibrary()
          fetchGaps()
          fetchStatus()
          es.close()
        }
      }
      es.onerror = () => { setSeeding(false); es.close() }
    } catch (err) {
      setSeedEvents([{ type: 'seed_error', error: err.message }])
      setSeeding(false)
    }
  }

  const totalCount = allClips.length || clips.length

  return (
    <>
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.55)', opacity: visible ? 1 : 0, transition: 'opacity 0.28s ease' }} />

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
        width: 520, maxWidth: '100vw',
        background: '#111111', borderLeft: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', flexDirection: 'column',
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Film size={15} style={{ color: 'rgba(251,191,36,0.6)' }} />
            <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.70)' }}>Clip Library</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>· {loading ? '…' : `${totalCount} clips`}</span>
            {ytdlpStatus?.ytdlp?.installed
              ? <span style={{ fontSize: 10, color: 'rgba(74,222,128,0.60)', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)', borderRadius: 3, padding: '1px 5px' }}>yt-dlp {ytdlpStatus.ytdlp.version}</span>
              : <span style={{ fontSize: 10, color: 'rgba(251,191,36,0.60)', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: 3, padding: '1px 5px' }}>yt-dlp not found</span>
            }
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handleSeed}
              disabled={seeding || !ytdlpStatus?.ytdlp?.installed}
              title={!ytdlpStatus?.ytdlp?.installed ? 'yt-dlp must be installed to auto-seed' : 'Auto-seed library from project entities'}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 11, padding: '4px 10px',
                background: seeding ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.12)',
                border: '1px solid rgba(99,102,241,0.25)', borderRadius: 5,
                color: seeding || !ytdlpStatus?.ytdlp?.installed ? 'rgba(165,180,252,0.35)' : 'rgba(165,180,252,0.80)',
                cursor: seeding || !ytdlpStatus?.ytdlp?.installed ? 'not-allowed' : 'pointer',
              }}
            >
              {seeding ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
              {seeding ? 'Seeding…' : 'Seed Library'}
            </button>
            <button onClick={handleClose} style={{ color: 'rgba(255,255,255,0.30)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.70)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.30)'}
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '10px 12px', fontSize: 12, background: 'none', border: 'none',
              cursor: 'pointer', borderBottom: `2px solid ${tab === t.id ? '#6366f1' : 'transparent'}`,
              color: tab === t.id ? 'rgba(165,180,252,0.90)' : 'rgba(255,255,255,0.35)',
              marginBottom: -1,
            }}>{t.label}</button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {tab === 'library'  && <LibraryTab clips={clips} allClips={allClips} categories={categories} loading={loading} error={libError} query={query} setQuery={setQuery} catFilter={catFilter} setCatFilter={setCatFilter} showAddForm={showAddForm} setShowAddForm={setShowAddForm} deleting={deleting} onDelete={handleDelete} onRefresh={fetchLibrary} onRefreshGaps={fetchGaps} />}
          {tab === 'youtube_cc'  && <SourceTab source="youtube-cc"  label="YouTube CC"    hasSegment={true}  maxSec={null}  warningText={null} projectId={projectId} onDownloaded={() => { fetchLibrary(); fetchGaps(); fetchStatus() }} />}
          {tab === 'fair_use' && <SourceTab source="youtube-fair-use" label="YouTube Fair Use" hasSegment={true} maxSec={8} warningText="Fair use clips are limited to 8 seconds. Copyrighted content — confirm you have a commentary/documentary purpose before distributing." projectId={projectId} onDownloaded={() => { fetchLibrary(); fetchGaps(); fetchStatus() }} />}
          {tab === 'archive'  && <SourceTab source="archive"       label="Internet Archive" hasSegment={false} maxSec={null} warningText={null} projectId={projectId} onDownloaded={() => { fetchLibrary(); fetchGaps(); fetchStatus() }} />}
          {tab === 'cspan'    && <SourceTab source="cspan"         label="C-SPAN"           hasSegment={true}  maxSec={null} warningText={null} projectId={projectId} onDownloaded={() => { fetchLibrary(); fetchGaps(); fetchStatus() }} />}
        </div>

        {/* Seed progress banner */}
        {(seeding || seedEvents.length > 0) && (
          <SeedProgressBanner events={seedEvents} seeding={seeding} onDismiss={() => setSeedEvents([])} />
        )}

        {/* Gap footer */}
        {tab === 'library' && !seeding && seedEvents.length === 0 && (
          <div style={{ padding: '10px 20px', borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
            {gaps.total > 0
              ? <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <AlertCircle size={12} style={{ color: 'rgba(251,191,36,0.50)' }} />
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                    <span style={{ color: 'rgba(251,191,36,0.70)', fontWeight: 500 }}>{gaps.total} scene{gaps.total !== 1 ? 's' : ''} need clips</span>
                    {gaps.topTags.length > 0 && <span style={{ color: 'rgba(255,255,255,0.22)' }}> · {gaps.topTags.join(', ')}</span>}
                  </span>
                </div>
              : <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>Add clips to <code>library/clips/</code> or use Seed Library to auto-download</p>
            }
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </>
  )
}

// ─── LibraryTab ───────────────────────────────────────────────────────────────

function LibraryTab({ clips, allClips, categories, loading, error, query, setQuery, catFilter, setCatFilter, showAddForm, setShowAddForm, deleting, onDelete, onRefresh, onRefreshGaps }) {
  const [addForm,  setAddForm]  = useState({ file: '', tagsRaw: '', mood: 'neutral', category: '', duration: '', description: '', source_url: '' })
  const [adding,   setAdding]   = useState(false)
  const [addError, setAddError] = useState(null)

  const handleAdd = async () => {
    const tags = addForm.tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
    if (!addForm.file || !tags.length || !addForm.mood || !addForm.category) {
      setAddError('File, tags, mood, and category are required.')
      return
    }
    setAdding(true); setAddError(null)
    try {
      const res = await fetch('/api/library/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: addForm.file, tags, mood: addForm.mood, category: addForm.category, duration: parseInt(addForm.duration, 10) || 0, description: addForm.description, source_url: addForm.source_url }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Add failed')
      setAddForm({ file: '', tagsRaw: '', mood: 'neutral', category: '', duration: '', description: '', source_url: '' })
      setShowAddForm(false)
      onRefresh(); onRefreshGaps()
    } catch (err) { setAddError(err.message) }
    finally { setAdding(false) }
  }

  const inp = { width: '100%', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'rgba(255,255,255,0.75)', fontSize: 12, padding: '6px 10px', outline: 'none', boxSizing: 'border-box' }
  const lbl = { fontSize: 11, color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 4 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* Add form */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: showAddForm ? 10 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '6px 10px' }}>
            <Search size={12} style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tags, title, category…" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'rgba(255,255,255,0.70)' }} />
            {query && <button onClick={() => setQuery('')} style={{ color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>}
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: 'rgba(255,255,255,0.40)', outline: 'none', cursor: 'pointer' }}>
            <option value="">All</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => { setShowAddForm(f => !f); setAddError(null) }} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: showAddForm ? 'rgba(99,102,241,0.90)' : 'rgba(255,255,255,0.45)', background: showAddForm ? 'rgba(99,102,241,0.10)' : 'transparent', border: '1px solid ' + (showAddForm ? 'rgba(99,102,241,0.30)' : 'rgba(255,255,255,0.12)'), borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>
            <Plus size={11} /> Add
          </button>
        </div>

        {showAddForm && (
          <div style={{ padding: '12px 14px', background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div><label style={lbl}>File path</label><input type="text" value={addForm.file} onChange={e => setAddForm(f => ({ ...f, file: e.target.value }))} placeholder="/library/clips/my_clip.mp4" style={inp} /></div>
              <div><label style={lbl}>Tags (comma separated)</label><input type="text" value={addForm.tagsRaw} onChange={e => setAddForm(f => ({ ...f, tagsRaw: e.target.value }))} placeholder="finance, wall street, 2008" style={inp} /></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><label style={lbl}>Mood</label><select value={addForm.mood} onChange={e => setAddForm(f => ({ ...f, mood: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>{MOOD_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                <div style={{ flex: 1 }}><label style={lbl}>Category</label><input type="text" value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} placeholder="finance" style={inp} /></div>
                <div style={{ width: 72 }}><label style={lbl}>Dur (s)</label><input type="number" min={0} value={addForm.duration} onChange={e => setAddForm(f => ({ ...f, duration: e.target.value }))} style={{ ...inp, textAlign: 'center' }} /></div>
              </div>
              <div><label style={lbl}>Description</label><input type="text" value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description" style={inp} /></div>
              {addError && <div style={{ fontSize: 11, color: 'rgba(239,68,68,0.75)', display: 'flex', alignItems: 'center', gap: 5 }}><AlertCircle size={11} />{addError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleAdd} disabled={adding} style={{ flex: 1, padding: '6px', fontSize: 12, fontWeight: 500, background: 'rgba(99,102,241,0.18)', color: 'rgba(165,180,252,0.90)', border: '1px solid rgba(99,102,241,0.30)', borderRadius: 6, cursor: adding ? 'not-allowed' : 'pointer' }}>{adding ? 'Adding…' : 'Add to Library'}</button>
                <button onClick={() => { setShowAddForm(false); setAddError(null) }} style={{ padding: '6px 12px', fontSize: 12, color: 'rgba(255,255,255,0.35)', background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Clip list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {loading && <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, padding: '24px 0', display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={14} className="animate-spin" /> Loading…</div>}
        {error   && <div style={{ fontSize: 12, color: 'rgba(239,68,68,0.75)', padding: '12px 0' }}>{error}</div>}
        {!loading && !error && clips.length === 0 && (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>{query || catFilter ? 'No clips match.' : 'Library is empty.'}</p>
            {(query || catFilter) && <button onClick={() => { setQuery(''); setCatFilter('') }} style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear filters</button>}
          </div>
        )}
        {!loading && clips.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {clips.map(clip => (
              <ClipCard key={clip.clip_id} clip={clip} onDelete={() => onDelete(clip.clip_id)} isDeleting={deleting === clip.clip_id} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ClipCard ─────────────────────────────────────────────────────────────────

function ClipCard({ clip, onDelete, isDeleting }) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(251,191,36,0.50)' }}>{clip.clip_id}</span>
            <LicenseBadge license={clip.license} />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{clip.category}</span>
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.20)', marginLeft: 'auto' }}>{clip.duration > 0 ? `${clip.duration}s` : ''}</span>
          </div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.60)', marginBottom: 5 }}>{clip.title || clip.description || clip.file?.split('/').pop()}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {(clip.tags || []).slice(0, 6).map(tag => (
              <span key={tag} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(251,191,36,0.05)', color: 'rgba(251,191,36,0.35)', border: '1px solid rgba(251,191,36,0.10)' }}>{tag}</span>
            ))}
          </div>
        </div>
        {!confirmDelete
          ? <button onClick={() => setConfirmDelete(true)} style={{ color: 'rgba(255,255,255,0.15)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', padding: 2 }} onMouseEnter={e => e.currentTarget.style.color = 'rgba(239,68,68,0.65)'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.15)'}><Trash2 size={12} /></button>
          : <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
              <button onClick={() => { onDelete(); setConfirmDelete(false) }} disabled={isDeleting} style={{ fontSize: 10, color: 'rgba(239,68,68,0.80)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 3, padding: '2px 7px', cursor: 'pointer' }}>{isDeleting ? '…' : 'Delete'}</button>
              <button onClick={() => setConfirmDelete(false)} style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', background: 'none', border: 'none', cursor: 'pointer' }}>No</button>
            </div>
        }
      </div>
    </div>
  )
}

// ─── SourceTab ────────────────────────────────────────────────────────────────

function SourceTab({ source, label, hasSegment, maxSec, warningText, projectId, onDownloaded }) {
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [expanded, setExpanded] = useState(null) // id of expanded download form

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true); setError(null); setResults([])
    try {
      const res  = await fetch(`/api/library/search/${source}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: query.trim(), maxResults: 8 }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')
      setResults(data.results || [])
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {warningText && (
        <div style={{ margin: '12px 20px 0', padding: '8px 12px', background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.18)', borderRadius: 6, display: 'flex', alignItems: 'flex-start', gap: 7 }}>
          <AlertCircle size={12} style={{ color: 'rgba(251,191,36,0.60)', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 11, color: 'rgba(251,191,36,0.70)', lineHeight: 1.5 }}>{warningText}</p>
        </div>
      )}

      {/* Search bar */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0, display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '6px 10px' }}>
          <Search size={12} style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
          <input type="text" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder={`Search ${label}…`} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'rgba(255,255,255,0.70)' }} />
        </div>
        <button onClick={handleSearch} disabled={loading || !query.trim()} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: loading ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 6, color: 'rgba(165,180,252,0.80)', fontSize: 12, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />} Search
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {error && <div style={{ fontSize: 12, color: 'rgba(239,68,68,0.75)', marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 6 }}>{error}</div>}

        {!loading && results.length === 0 && !error && (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', padding: '24px 0', textAlign: 'center' }}>
            {query ? 'No results found.' : `Search ${label} for clips to download.`}
          </p>
        )}

        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map((r, i) => (
              <SearchResult
                key={r.id || i}
                result={r}
                source={source}
                hasSegment={hasSegment}
                maxSec={maxSec}
                projectId={projectId}
                isExpanded={expanded === (r.id || i)}
                onToggle={() => setExpanded(expanded === (r.id || i) ? null : (r.id || i))}
                onDownloaded={() => { setExpanded(null); onDownloaded() }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── SearchResult ─────────────────────────────────────────────────────────────

function SearchResult({ result, source, hasSegment, maxSec, projectId, isExpanded, onToggle, onDownloaded }) {
  const [startSec,    setStartSec]    = useState(0)
  const [endSec,      setEndSec]      = useState(maxSec || Math.min(result.duration || 30, 30))
  const [tagsRaw,     setTagsRaw]     = useState('')
  const [mood,        setMood]        = useState('neutral')
  const [category,    setCategory]    = useState('')
  const [downloading, setDownloading] = useState(false)
  const [dlError,     setDlError]     = useState(null)
  const [done,        setDone]        = useState(false)

  const durationLabel = result.duration > 0 ? `${Math.floor(result.duration / 60)}:${String(result.duration % 60).padStart(2, '0')}` : ''

  const handleDownload = async () => {
    setDlError(null); setDownloading(true)
    try {
      const tags     = tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
      const endpoint = `/api/library/download/${source}`
      const body     = { url: result.url, tags, mood, category: category || 'general', projectId, title: result.title }
      if (hasSegment) { body.startSec = Number(startSec); body.endSec = Number(endSec) }
      if (source === 'archive') { body.identifier = result.id; delete body.url }

      const res  = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Download failed')
      setDone(true)
      setTimeout(onDownloaded, 1200)
    } catch (err) { setDlError(err.message) }
    finally { setDownloading(false) }
  }

  const inp = { width: '100%', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 5, color: 'rgba(255,255,255,0.70)', fontSize: 11, padding: '5px 8px', outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 10 }} onClick={onToggle}>
        {result.thumbnail && <img src={result.thumbnail} alt="" style={{ width: 72, height: 44, objectFit: 'cover', borderRadius: 4, flexShrink: 0, background: 'rgba(255,255,255,0.04)' }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.title}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'rgba(255,255,255,0.30)' }}>
            {result.channel && <span>{result.channel}</span>}
            {durationLabel  && <span>{durationLabel}</span>}
            <LicenseBadge license={source.includes('fair') ? 'fair_use' : source.includes('archive') || source.includes('cspan') ? 'public_domain' : 'creative_commons'} />
          </div>
        </div>
        {done
          ? <CheckCircle size={14} style={{ color: '#4ade80', flexShrink: 0 }} />
          : <Download size={13} style={{ color: isExpanded ? 'rgba(165,180,252,0.60)' : 'rgba(255,255,255,0.20)', flexShrink: 0 }} />
        }
      </div>

      {isExpanded && !done && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {hasSegment && (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', display: 'block', marginBottom: 3 }}>Start (sec)</label>
                  <input type="number" min={0} max={result.duration || 3600} value={startSec} onChange={e => setStartSec(parseFloat(e.target.value) || 0)} style={inp} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', display: 'block', marginBottom: 3 }}>End (sec){maxSec ? ` (max ${maxSec}s)` : ''}</label>
                  <input type="number" min={0} max={maxSec || (result.duration || 3600)} value={endSec} onChange={e => setEndSec(parseFloat(e.target.value) || 0)} style={{ ...inp, borderColor: maxSec && (endSec - startSec) > maxSec ? 'rgba(251,191,36,0.50)' : 'rgba(255,255,255,0.10)' }} />
                </div>
              </div>
            )}
            <div>
              <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', display: 'block', marginBottom: 3 }}>Tags (comma separated)</label>
              <input type="text" value={tagsRaw} onChange={e => setTagsRaw(e.target.value)} placeholder="finance, government, 2008" style={inp} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', display: 'block', marginBottom: 3 }}>Mood</label>
                <select value={mood} onChange={e => setMood(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>{MOOD_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}</select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', display: 'block', marginBottom: 3 }}>Category</label>
                <input type="text" value={category} onChange={e => setCategory(e.target.value)} placeholder="general" style={inp} />
              </div>
            </div>
            {maxSec && (endSec - startSec) > maxSec && (
              <p style={{ fontSize: 10, color: 'rgba(251,191,36,0.70)' }}>⚠ Clip exceeds {maxSec}s fair use limit ({(endSec - startSec).toFixed(1)}s)</p>
            )}
            {dlError && <p style={{ fontSize: 11, color: 'rgba(239,68,68,0.75)' }}>{dlError}</p>}
            <button onClick={handleDownload} disabled={downloading || (maxSec && (endSec - startSec) > maxSec)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 12px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 6, color: 'rgba(165,180,252,0.85)', fontSize: 12, cursor: downloading ? 'not-allowed' : 'pointer' }}>
              {downloading ? <><Loader2 size={11} className="animate-spin" /> Downloading…</> : <><Download size={11} /> Download to Library</>}
            </button>
          </div>
        </div>
      )}

      {done && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(34,197,94,0.10)', background: 'rgba(34,197,94,0.04)', fontSize: 12, color: 'rgba(74,222,128,0.70)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle size={12} /> Added to library
        </div>
      )}
    </div>
  )
}

// ─── SeedProgressBanner ───────────────────────────────────────────────────────

function SeedProgressBanner({ events, seeding, onDismiss }) {
  const lastEvent     = events[events.length - 1]
  const downloadingNow = events.filter(e => e.status === 'downloading' && !events.some(e2 => e2.entity === e.entity && (e2.status === 'done' || e2.status === 'error'))).length
  const doneCount     = events.filter(e => e.status === 'done').length
  const errorCount    = events.filter(e => e.status === 'error').length

  return (
    <div style={{ padding: '10px 20px', borderTop: '1px solid rgba(99,102,241,0.15)', background: 'rgba(99,102,241,0.04)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          {seeding
            ? <Loader2 size={12} className="animate-spin" style={{ color: 'rgba(165,180,252,0.60)', flexShrink: 0 }} />
            : <CheckCircle size={12} style={{ color: '#4ade80', flexShrink: 0 }} />
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            {seeding && lastEvent?.entity && (
              <p style={{ fontSize: 11, color: 'rgba(165,180,252,0.70)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Searching: <strong>{lastEvent.entity}</strong>{downloadingNow > 0 ? ` · downloading…` : ''}
              </p>
            )}
            {!seeding && lastEvent?.type === 'seed_complete' && (
              <p style={{ fontSize: 11, color: 'rgba(74,222,128,0.70)' }}>Seed complete — {lastEvent.clipsAdded} clip{lastEvent.clipsAdded !== 1 ? 's' : ''} added{errorCount > 0 ? ` (${errorCount} skipped)` : ''}</p>
            )}
            {!seeding && lastEvent?.type === 'seed_error' && (
              <p style={{ fontSize: 11, color: 'rgba(239,68,68,0.70)' }}>Seed error: {lastEvent.error}</p>
            )}
            {seeding && (
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{doneCount} downloaded · {errorCount} skipped</p>
            )}
          </div>
        </div>
        {!seeding && (
          <button onClick={onDismiss} style={{ color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex' }}>
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
