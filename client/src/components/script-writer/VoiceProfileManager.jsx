import { useState, useEffect, useMemo } from 'react'
import { Trash2, Plus, Loader2, Check, Mic, X, Search, ChevronDown, ChevronUp } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function ConfidenceBadge({ score }) {
  if (score == null) return null
  const cls = score >= 8 ? 'high' : score >= 5 ? 'medium' : 'low'
  return <span className={`vorta-sw-confidence-badge ${cls}`}>Confidence: {score}/10</span>
}

function LengthIndicator({ minutes }) {
  const cls = minutes >= 8 ? 'good' : 'short'
  const label = minutes >= 15 ? 'Excellent length' : minutes >= 8 ? 'Good length' : 'Short — may limit quality'
  return <span className={`vorta-sw-length-indicator ${cls}`}>{label}</span>
}

function SelectionGuide() {
  return (
    <div className="vorta-sw-selection-guide">
      <div className="vorta-sw-selection-guide-title">For best results</div>
      <div className="vorta-sw-selection-guide-item"><span className="check">✓</span> Choose transcripts from DIFFERENT video topics</div>
      <div className="vorta-sw-selection-guide-item"><span className="check">✓</span> Each transcript should be 10+ minutes long (1,300+ words)</div>
      <div className="vorta-sw-selection-guide-item"><span className="check">✓</span> Use clean transcripts, not raw auto-captions</div>
      <div className="vorta-sw-selection-guide-item"><span className="check">✓</span> Pick your best videos, not average ones</div>
      <div className="vorta-sw-selection-guide-item"><span className="cross">✗</span> Avoid: all transcripts from the same niche/topic</div>
    </div>
  )
}

function ProfilesTab({ profiles, selectedId, onSelect, onDelete, library, onRefreshProfiles }) {
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [uploaderLabel, setUploaderLabel] = useState(() => localStorage.getItem('vorta_uploader_label') || '')
  const [selectedTids, setSelectedTids] = useState([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [newProfile, setNewProfile] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  function handleUploaderChange(val) {
    setUploaderLabel(val)
    localStorage.setItem('vorta_uploader_label', val)
  }

  function toggleTranscript(id) {
    setSelectedTids(prev => {
      if (prev.includes(id)) return prev.filter(t => t !== id)
      if (prev.length >= 5) return prev
      return [...prev, id]
    })
  }

  async function handleCreate() {
    if (!name.trim() || selectedTids.length === 0) return
    setCreating(true)
    setError('')
    setNewProfile(null)
    try {
      const res = await fetch(`${API}/api/script-writer/voice-profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), transcriptIds: selectedTids, uploaderLabel: uploaderLabel.trim() })
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      const profile = await res.json()
      setNewProfile(profile)
      onRefreshProfiles()
      setName('')
      setSelectedTids([])
      setShowCreate(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      {profiles.length === 0 && !showCreate && (
        <p className="text-xs text-white/30">No voice profiles yet. Create one from your transcript library.</p>
      )}

      {profiles.map(p => (
        <div key={p.id} className="rounded-lg p-3" style={{ background: selectedId === p.id ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selectedId === p.id ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-white font-medium">{p.name}</span>
                <ConfidenceBadge score={p.confidenceScore} />
                <span className="text-[10px] text-white/30">{p.transcriptCount} transcript{p.transcriptCount !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-white/25">{new Date(p.createdAt).toLocaleDateString()}</span>
                {p.uploaderLabel && <span className="text-[10px] text-white/20">by {p.uploaderLabel}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 ml-3">
              <button onClick={() => onSelect(selectedId === p.id ? null : p.id)}
                className={`vorta-btn vorta-btn-sm ${selectedId === p.id ? 'vorta-btn-primary' : 'vorta-btn-ghost'}`}>
                {selectedId === p.id ? <><Check size={11} /> Active</> : 'Use'}
              </button>
              <button onClick={() => onDelete(p.id)} className="text-white/20 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
            </div>
          </div>
          {p.improvementSuggestions && p.confidenceScore < 6 && (
            <div className="vorta-sw-improvement-panel mt-3">
              <strong>To improve this fingerprint</strong>
              {p.improvementSuggestions}
            </div>
          )}
          {p.improvementSuggestions && p.confidenceScore >= 6 && (
            <div className="mt-2">
              <button onClick={() => setExpandedId(expandedId === p.id ? null : p.id)} className="text-[10px] text-white/30 hover:text-white/50 flex items-center gap-1">
                {expandedId === p.id ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                {expandedId === p.id ? 'Hide suggestions' : 'Show improvement tips'}
              </button>
              {expandedId === p.id && <p className="text-xs text-white/40 mt-2 leading-relaxed">{p.improvementSuggestions}</p>}
            </div>
          )}
        </div>
      ))}

      {newProfile && (
        <div className="rounded-lg p-3" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[10px] text-green-400 font-medium">Profile created</p>
            <ConfidenceBadge score={newProfile.confidenceScore} />
          </div>
          <p className="text-xs text-white/50 line-clamp-3">{newProfile.fingerprint?.substring(0, 200)}...</p>
          {newProfile.improvementSuggestions && newProfile.confidenceScore < 6 && (
            <div className="vorta-sw-improvement-panel mt-2">
              <strong>To improve</strong>
              {newProfile.improvementSuggestions}
            </div>
          )}
        </div>
      )}

      {showCreate ? (
        <div className="space-y-3 pt-3 border-t border-white/[0.06]">
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div>
            <label className="vorta-label">Profile name</label>
            <input className="vorta-input" placeholder="e.g. MagnatesMedia style" value={name} onChange={e => setName(e.target.value)} disabled={creating} />
          </div>
          <div>
            <label className="vorta-label">Your name / team (optional)</label>
            <input className="vorta-input" placeholder="Your name or team" value={uploaderLabel} onChange={e => handleUploaderChange(e.target.value)} disabled={creating} />
          </div>

          <SelectionGuide />

          <div>
            <label className="vorta-label">Select transcripts ({selectedTids.length} of 5)</label>
            {library.length === 0 ? (
              <p className="text-xs text-white/30 mt-2">No transcripts in library. Switch to the Library tab to upload some first.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto mt-2">
                {library.map(t => {
                  const checked = selectedTids.includes(t.id)
                  const disabled = !checked && selectedTids.length >= 5
                  return (
                    <label key={t.id} className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-purple-500/10' : 'hover:bg-white/[0.03]'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                      <input type="checkbox" checked={checked} disabled={disabled || creating} onChange={() => toggleTranscript(t.id)} className="mt-0.5 accent-purple-500" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-white/80 block">{t.title}</span>
                        <span className="text-[10px] text-white/30">{t.channelName} · {t.wordCount} words · ~{t.estimatedMinutes} min</span>
                      </div>
                      <LengthIndicator minutes={t.estimatedMinutes} />
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={handleCreate} className="vorta-btn vorta-btn-primary vorta-btn-sm" disabled={creating || !name.trim() || selectedTids.length === 0}>
              {creating ? <><Loader2 size={12} className="animate-spin" /> Analyzing (30-60s)...</> : 'Analyze Voice'}
            </button>
            <button onClick={() => { setShowCreate(false); setError('') }} className="vorta-btn vorta-btn-ghost vorta-btn-sm" disabled={creating}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowCreate(true)} className="vorta-btn vorta-btn-secondary vorta-btn-sm w-full">
          <Plus size={12} /> Create new voice profile
        </button>
      )}
    </div>
  )
}

function LibraryTab({ library, onRefresh }) {
  const [search, setSearch] = useState('')
  const [lengthFilter, setLengthFilter] = useState('all')
  const [sort, setSort] = useState('newest')
  const [showUpload, setShowUpload] = useState(false)
  const [uploaderLabel, setUploaderLabel] = useState(() => localStorage.getItem('vorta_uploader_label') || '')
  const [uploadItems, setUploadItems] = useState([{ title: '', channelName: '', text: '' }])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  function handleUploaderChange(val) {
    setUploaderLabel(val)
    localStorage.setItem('vorta_uploader_label', val)
  }

  const filtered = useMemo(() => {
    let items = [...library]
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(t => t.title.toLowerCase().includes(q) || t.channelName.toLowerCase().includes(q))
    }
    if (lengthFilter === 'short') items = items.filter(t => t.estimatedMinutes < 8)
    if (lengthFilter === 'medium') items = items.filter(t => t.estimatedMinutes >= 8 && t.estimatedMinutes < 15)
    if (lengthFilter === 'long') items = items.filter(t => t.estimatedMinutes >= 15)

    if (sort === 'newest') items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    if (sort === 'most_used') items.sort((a, b) => (b.usedInProfiles?.length || 0) - (a.usedInProfiles?.length || 0))
    if (sort === 'longest') items.sort((a, b) => b.wordCount - a.wordCount)
    return items
  }, [library, search, lengthFilter, sort])

  function addUploadItem() {
    if (uploadItems.length < 3) setUploadItems(prev => [...prev, { title: '', channelName: '', text: '' }])
  }

  function updateUploadItem(idx, field, val) {
    setUploadItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item))
  }

  async function handleUpload() {
    const valid = uploadItems.filter(it => it.text.trim().length >= 100)
    if (valid.length === 0) {
      setError('Each transcript must be at least 100 characters')
      return
    }
    setUploading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/script-writer/transcripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcripts: valid.map(it => ({ ...it, uploaderLabel: uploaderLabel.trim() })) })
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Upload failed')
      setUploadItems([{ title: '', channelName: '', text: '' }])
      setShowUpload(false)
      onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id) {
    try {
      await fetch(`${API}/api/script-writer/transcripts/${id}`, { method: 'DELETE' })
      onRefresh()
    } catch {}
  }

  return (
    <div>
      <div className="vorta-sw-library-header">
        <span className="vorta-sw-library-count">{library.length} transcript{library.length !== 1 ? 's' : ''} in shared library</span>
      </div>

      <div className="vorta-sw-filter-bar">
        <input placeholder="Search title or channel..." value={search} onChange={e => setSearch(e.target.value)} />
        {['all', 'short', 'medium', 'long'].map(f => (
          <button key={f} onClick={() => setLengthFilter(f)} className={`vorta-sw-filter-btn ${lengthFilter === f ? 'active' : ''}`}>
            {{ all: 'All', short: '<8m', medium: '8-15m', long: '15m+' }[f]}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        {['newest', 'most_used', 'longest'].map(s => (
          <button key={s} onClick={() => setSort(s)} className={`vorta-sw-filter-btn ${sort === s ? 'active' : ''}`}>
            {{ newest: 'Newest', most_used: 'Most used', longest: 'Longest' }[s]}
          </button>
        ))}
      </div>

      <div className="space-y-3 max-h-[40vh] overflow-y-auto mb-4">
        {filtered.length === 0 && <p className="text-xs text-white/25 text-center py-6">No transcripts found.</p>}
        {filtered.map(t => (
          <div key={t.id} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/80 font-medium">{t.title}</p>
                <p className="text-[10px] text-white/35 mt-0.5">{t.channelName} · {t.uploaderLabel} · {new Date(t.createdAt).toLocaleDateString()}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-[10px] text-white/30">{t.wordCount} words · ~{t.estimatedMinutes} min</span>
                  <LengthIndicator minutes={t.estimatedMinutes} />
                  {t.usedInProfiles?.length > 0 && <span className="vorta-sw-history-badge green">Used in {t.usedInProfiles.length} profile{t.usedInProfiles.length > 1 ? 's' : ''}</span>}
                </div>
              </div>
              <button onClick={() => handleDelete(t.id)} className="text-white/20 hover:text-red-400 transition-colors shrink-0"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      {showUpload ? (
        <div className="space-y-3 pt-3 border-t border-white/[0.06]">
          <div>
            <label className="vorta-label">Your name / team</label>
            <input className="vorta-input" placeholder="Your name or team" value={uploaderLabel} onChange={e => handleUploaderChange(e.target.value)} disabled={uploading} />
          </div>
          {uploadItems.map((item, i) => {
            const wc = item.text.trim().split(/\s+/).filter(Boolean).length
            const wcClass = wc >= 1300 ? 'good' : wc > 0 ? 'short' : ''
            return (
              <div key={i} className="space-y-2 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex gap-2">
                  <input className="vorta-input" placeholder="Video title" value={item.title} onChange={e => updateUploadItem(i, 'title', e.target.value)} disabled={uploading} style={{ flex: 1 }} />
                  <input className="vorta-input" placeholder="Channel name" value={item.channelName} onChange={e => updateUploadItem(i, 'channelName', e.target.value)} disabled={uploading} style={{ flex: 1 }} />
                </div>
                <textarea className="vorta-textarea" rows={4} placeholder="Paste transcript text here..." value={item.text} onChange={e => updateUploadItem(i, 'text', e.target.value)} disabled={uploading} />
                {wc > 0 && <div className={`vorta-sw-wordcount ${wcClass}`}>{wc.toLocaleString()} words · ~{Math.round(wc / 130)} min</div>}
              </div>
            )
          })}
          {uploadItems.length < 3 && (
            <button onClick={addUploadItem} className="vorta-btn vorta-btn-ghost vorta-btn-sm" disabled={uploading}>
              <Plus size={12} /> Add another transcript
            </button>
          )}
          <div className="flex gap-2 pt-2">
            <button onClick={handleUpload} className="vorta-btn vorta-btn-primary vorta-btn-sm" disabled={uploading || uploadItems.every(it => it.text.trim().length < 100)}>
              {uploading ? <><Loader2 size={12} className="animate-spin" /> Uploading...</> : 'Upload to Library'}
            </button>
            <button onClick={() => { setShowUpload(false); setError('') }} className="vorta-btn vorta-btn-ghost vorta-btn-sm" disabled={uploading}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowUpload(true)} className="vorta-btn vorta-btn-secondary vorta-btn-sm w-full">
          <Plus size={12} /> Upload transcripts
        </button>
      )}
    </div>
  )
}

export default function VoiceProfileManager({ selectedId, onSelect, onClose }) {
  const [tab, setTab] = useState('profiles')
  const [profiles, setProfiles] = useState([])
  const [library, setLibrary] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const [pRes, lRes] = await Promise.all([
        fetch(`${API}/api/script-writer/voice-profiles`),
        fetch(`${API}/api/script-writer/transcripts`)
      ])
      setProfiles(await pRes.json())
      setLibrary(await lRes.json())
    } catch {}
    setLoading(false)
  }

  async function handleDeleteProfile(id) {
    try {
      await fetch(`${API}/api/script-writer/voice-profiles/${id}`, { method: 'DELETE' })
      setProfiles(prev => prev.filter(p => p.id !== id))
      if (selectedId === id) onSelect(null)
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="rounded-xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto" style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Mic size={14} /> Voice Profiles</h3>
            <div className="flex gap-1">
              <button onClick={() => setTab('profiles')} className={`px-3 py-1 rounded-md text-xs transition-colors ${tab === 'profiles' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}>Profiles</button>
              <button onClick={() => setTab('library')} className={`px-3 py-1 rounded-md text-xs transition-colors ${tab === 'library' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}>Transcript Library</button>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/70"><X size={16} /></button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex items-center gap-2 text-white/40 text-sm py-8 justify-center"><Loader2 size={14} className="animate-spin" /> Loading...</div>
          ) : tab === 'profiles' ? (
            <ProfilesTab
              profiles={profiles}
              selectedId={selectedId}
              onSelect={onSelect}
              onDelete={handleDeleteProfile}
              library={library}
              onRefreshProfiles={() => fetchAll()}
            />
          ) : (
            <LibraryTab library={library} onRefresh={() => fetchAll()} />
          )}
        </div>
      </div>
    </div>
  )
}
