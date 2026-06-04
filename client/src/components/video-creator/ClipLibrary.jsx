import { useState, useEffect, useRef } from 'react'
import { X, Search, Film, Plus, Trash2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'

const MOOD_OPTIONS = ['tense', 'formal', 'intense', 'neutral']

const MOOD_STYLES = {
  tense:   'bg-red-500/[0.07] text-red-400/60 border-red-500/[0.14]',
  formal:  'bg-slate-500/[0.07] text-slate-400/60 border-slate-500/[0.14]',
  intense: 'bg-orange-500/[0.07] text-orange-400/60 border-orange-500/[0.14]',
  neutral: 'bg-white/[0.04] text-white/30 border-white/[0.08]',
}

const EMPTY_FORM = {
  file: '', tagsRaw: '', mood: 'neutral', category: '',
  duration: '', description: '', source_url: '',
}

export default function ClipLibrary({ onClose }) {
  const [visible,    setVisible]    = useState(false)
  const [allClips,   setAllClips]   = useState([])  // unfiltered total
  const [clips,      setClips]      = useState([])
  const [categories, setCategories] = useState([])
  const [moods,      setMoods]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [query,      setQuery]      = useState('')
  const [category,   setCategory]   = useState('')
  const [mood,       setMood]       = useState('')
  const [showAddForm,setShowAddForm]= useState(false)
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [adding,     setAdding]     = useState(false)
  const [addError,   setAddError]   = useState(null)
  const [gaps,       setGaps]       = useState({ total: 0, topTags: [] })
  const [deleting,   setDeleting]   = useState(null) // clip_id being deleted

  // Slide-in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 280)
  }

  // Fetch clips (with filters)
  const fetchClips = (q = query, cat = category, m = mood) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q)   params.set('q', q)
    if (cat) params.set('category', cat)
    if (m)   params.set('mood', m)

    fetch(`/api/library?${params}`)
      .then(r => r.json())
      .then(data => {
        setClips(data.clips || [])
        if (!q && !cat && !m) setAllClips(data.clips || [])
        if (data.categories) setCategories(data.categories)
        if (data.moods)      setMoods(data.moods)
        setError(null)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  // Fetch gap insights
  const fetchGaps = () => {
    fetch('/api/library/gaps')
      .then(r => r.json())
      .then(data => setGaps({ total: data.total || 0, topTags: data.topTags || [] }))
      .catch(() => {})
  }

  useEffect(() => { fetchClips(); fetchGaps() }, [])

  // Re-fetch when filters change
  useEffect(() => { fetchClips(query, category, mood) }, [query, category, mood])

  // Add Clip
  const handleAdd = async () => {
    setAddError(null)
    const tags = form.tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
    if (!form.file || tags.length === 0 || !form.mood || !form.category) {
      setAddError('File path, at least one tag, mood, and category are required.')
      return
    }
    setAdding(true)
    try {
      const res  = await fetch('/api/library/add', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          file:        form.file,
          tags,
          mood:        form.mood,
          category:    form.category,
          duration:    parseInt(form.duration, 10) || 0,
          description: form.description,
          source_url:  form.source_url,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Add failed')
      setForm(EMPTY_FORM)
      setShowAddForm(false)
      fetchClips(query, category, mood)
      fetchGaps()
    } catch (err) {
      setAddError(err.message)
    } finally {
      setAdding(false)
    }
  }

  // Delete Clip
  const handleDelete = async (clip_id) => {
    setDeleting(clip_id)
    try {
      const res = await fetch(`/api/library/${clip_id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Delete failed')
      }
      fetchClips(query, category, mood)
      fetchGaps()
    } catch (err) {
      console.error('[ClipLibrary] delete error:', err.message)
    } finally {
      setDeleting(null)
    }
  }

  const totalCount = allClips.length || clips.length

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(0,0,0,0.55)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.28s ease',
        }}
      />

      {/* Side panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
        width: '480px', maxWidth: '100vw',
        background: '#111111',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', flexDirection: 'column',
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Film size={15} style={{ color: 'rgba(251,191,36,0.6)' }} />
            <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.70)' }}>
              Library
            </span>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>
              · {loading ? '…' : `${totalCount} clip${totalCount !== 1 ? 's' : ''}`}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => { setShowAddForm(f => !f); setAddError(null) }}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                fontSize: '12px', color: showAddForm ? 'rgba(99,102,241,0.9)' : 'rgba(255,255,255,0.45)',
                background: showAddForm ? 'rgba(99,102,241,0.1)' : 'transparent',
                border: '1px solid ' + (showAddForm ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.12)'),
                borderRadius: '6px', padding: '5px 10px', cursor: 'pointer',
              }}
            >
              <Plus size={11} />
              Add Clip
            </button>
            <button onClick={handleClose} style={{ color: 'rgba(255,255,255,0.30)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.70)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.30)'}
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Add Clip form */}
        {showAddForm && (
          <AddClipForm
            form={form}
            setForm={setForm}
            onAdd={handleAdd}
            adding={adding}
            error={addError}
            onCancel={() => { setShowAddForm(false); setForm(EMPTY_FORM); setAddError(null) }}
          />
        )}

        {/* Search + filters */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '8px', padding: '6px 10px',
          }}>
            <Search size={12} style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search tags, category, description…"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontSize: '12px', color: 'rgba(255,255,255,0.70)',
              }}
            />
            {query && (
              <button onClick={() => setQuery('')} style={{ color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>✕</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <FilterSelect value={category} onChange={setCategory} options={categories} placeholder="All categories" />
            <FilterSelect value={mood}     onChange={setMood}     options={moods}      placeholder="All moods" />
          </div>
        </div>

        {/* Clips list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.25)', fontSize: '13px', padding: '24px 0' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.15)', borderTopColor: 'rgba(255,255,255,0.5)', animation: 'spin 0.8s linear infinite' }} />
              Loading library…
            </div>
          )}
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.20)', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: 'rgba(239,68,68,0.80)' }}>
              {error}
            </div>
          )}
          {!loading && !error && clips.length === 0 && (
            <div style={{ padding: '32px 0', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.25)', marginBottom: '8px' }}>
                {query || category || mood ? 'No clips match these filters.' : 'Library is empty.'}
              </p>
              {(query || category || mood) && (
                <button
                  onClick={() => { setQuery(''); setCategory(''); setMood('') }}
                  style={{ fontSize: '12px', color: 'rgba(255,255,255,0.30)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Clear filters
                </button>
              )}
              {!query && !category && !mood && (
                <button
                  onClick={() => setShowAddForm(true)}
                  style={{ fontSize: '12px', color: 'rgba(99,102,241,0.70)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Add your first clip
                </button>
              )}
            </div>
          )}
          {!loading && clips.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {clips.map(clip => (
                <ClipCard
                  key={clip.clip_id}
                  clip={clip}
                  onDelete={() => handleDelete(clip.clip_id)}
                  isDeleting={deleting === clip.clip_id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer — gap insights */}
        <GapInsightsFooter gaps={gaps} />

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </>
  )
}

// ─── AddClipForm ──────────────────────────────────────────────────────────────

function AddClipForm({ form, setForm, onAdd, adding, error, onCancel }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const inputStyle = {
    width: '100%', background: '#1a1a1a',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px',
    color: 'rgba(255,255,255,0.75)', fontSize: '12px',
    padding: '6px 10px', outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle = {
    fontSize: '11px', color: 'rgba(255,255,255,0.35)',
    display: 'block', marginBottom: '4px',
  }

  return (
    <div style={{
      padding: '14px 20px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(99,102,241,0.04)',
      flexShrink: 0,
    }}>
      <p style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
        New Clip
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div>
          <label style={labelStyle}>File path</label>
          <input type="text" value={form.file} onChange={e => set('file', e.target.value)}
            placeholder="/library/clips/my_clip.mp4" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Tags (comma separated)</label>
          <input type="text" value={form.tagsRaw} onChange={e => set('tagsRaw', e.target.value)}
            placeholder="finance, wall street, trading, 2008" style={inputStyle} />
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Mood</label>
            <select value={form.mood} onChange={e => set('mood', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              {MOOD_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Category</label>
            <input type="text" value={form.category} onChange={e => set('category', e.target.value)}
              placeholder="finance" style={inputStyle} />
          </div>
          <div style={{ width: '72px' }}>
            <label style={labelStyle}>Duration (s)</label>
            <input type="number" min={0} value={form.duration} onChange={e => set('duration', e.target.value)}
              placeholder="6" style={{ ...inputStyle, textAlign: 'center' }} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Description</label>
          <input type="text" value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="Brief description of clip content" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Source URL (optional)</label>
          <input type="text" value={form.source_url} onChange={e => set('source_url', e.target.value)}
            placeholder="https://youtube.com/…" style={inputStyle} />
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'rgba(239,68,68,0.75)' }}>
            <AlertCircle size={11} /> {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button
            onClick={onAdd}
            disabled={adding}
            style={{
              flex: 1, padding: '7px', fontSize: '12px', fontWeight: 500,
              background: adding ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.20)',
              color: 'rgba(165,180,252,0.90)', border: '1px solid rgba(99,102,241,0.30)',
              borderRadius: '6px', cursor: adding ? 'not-allowed' : 'pointer',
            }}
          >
            {adding ? 'Adding…' : 'Add to Library'}
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: '7px 14px', fontSize: '12px', color: 'rgba(255,255,255,0.35)',
              background: 'none', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '6px', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ClipCard ─────────────────────────────────────────────────────────────────

function ClipCard({ clip, onDelete, isDeleting }) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '10px', padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '3px' }}>
            <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'rgba(251,191,36,0.55)' }}>{clip.clip_id}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded border ${MOOD_STYLES[clip.mood] || MOOD_STYLES.neutral}`}>
              {clip.mood}
            </span>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>{clip.category}</span>
            <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.22)', marginLeft: 'auto' }}>{clip.duration}s</span>
          </div>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.60)', marginBottom: '6px' }}>{clip.description || clip.file.split('/').pop()}</p>
        </div>

        {/* Delete button */}
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{ color: 'rgba(255,255,255,0.18)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', padding: '2px' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(239,68,68,0.65)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.18)'}
            title="Delete clip"
          >
            <Trash2 size={13} />
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button
              onClick={() => { onDelete(); setConfirmDelete(false) }}
              disabled={isDeleting}
              style={{ fontSize: '11px', color: 'rgba(239,68,68,0.80)', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}
            >
              {isDeleting ? '…' : 'Delete'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
        {clip.tags.map(tag => (
          <span key={tag} style={{
            fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
            background: 'rgba(251,191,36,0.05)', color: 'rgba(251,191,36,0.40)',
            border: '1px solid rgba(251,191,36,0.10)',
          }}>
            {tag}
          </span>
        ))}
      </div>

      <p style={{ fontSize: '10px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.15)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {clip.file}
      </p>
    </div>
  )
}

// ─── GapInsightsFooter ────────────────────────────────────────────────────────

function GapInsightsFooter({ gaps }) {
  if (gaps.total === 0) {
    return (
      <div style={{ padding: '10px 20px', borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.18)' }}>
          Add clips to <span style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.28)' }}>library/clips/</span> · Use <span style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.28)' }}>yt-dlp</span> to download
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '10px 20px', borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px' }}>
        <AlertCircle size={12} style={{ color: 'rgba(251,191,36,0.50)', flexShrink: 0, marginTop: '1px' }} />
        <div>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.40)' }}>
            <span style={{ color: 'rgba(251,191,36,0.70)', fontWeight: 500 }}>{gaps.total} scene{gaps.total !== 1 ? 's' : ''} need clips</span>
          </p>
          {gaps.topTags.length > 0 && (
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>
              Most requested: {gaps.topTags.join(', ')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── FilterSelect ─────────────────────────────────────────────────────────────

function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '6px', padding: '5px 8px', fontSize: '12px',
        color: value ? 'rgba(255,255,255,0.60)' : 'rgba(255,255,255,0.30)',
        outline: 'none', cursor: 'pointer',
      }}
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}
