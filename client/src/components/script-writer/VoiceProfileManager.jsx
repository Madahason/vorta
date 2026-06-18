import { useState, useEffect } from 'react'
import { Trash2, Plus, Loader2, Check, Mic, X } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function VoiceProfileManager({ selectedId, onSelect, onClose }) {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [transcripts, setTranscripts] = useState([''])
  const [error, setError] = useState('')
  const [newFingerprint, setNewFingerprint] = useState('')

  useEffect(() => {
    fetchProfiles()
  }, [])

  async function fetchProfiles() {
    try {
      const res = await fetch(`${API}/api/script-writer/voice-profiles`)
      const data = await res.json()
      setProfiles(data)
    } catch {
      setError('Failed to load voice profiles')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    const filled = transcripts.filter(t => t.trim())
    if (!name.trim() || filled.length === 0) {
      setError('Name and at least one transcript required')
      return
    }
    setCreating(true)
    setError('')
    setNewFingerprint('')
    try {
      const res = await fetch(`${API}/api/script-writer/voice-profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), transcripts: filled })
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      const profile = await res.json()
      setNewFingerprint(profile.fingerprint)
      setProfiles(prev => [...prev, profile])
      setName('')
      setTranscripts([''])
      setShowForm(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id) {
    try {
      await fetch(`${API}/api/script-writer/voice-profiles/${id}`, { method: 'DELETE' })
      setProfiles(prev => prev.filter(p => p.id !== id))
      if (selectedId === id) onSelect(null)
    } catch {}
  }

  function addTranscript() {
    if (transcripts.length < 3) setTranscripts(prev => [...prev, ''])
  }

  function updateTranscript(idx, val) {
    setTranscripts(prev => prev.map((t, i) => i === idx ? val : t))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="vorta-sw-voice-modal rounded-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Mic size={14} /> Voice Profiles</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/70"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          {error && <p className="text-xs text-red-400">{error}</p>}

          {loading ? (
            <div className="flex items-center gap-2 text-white/40 text-sm"><Loader2 size={14} className="animate-spin" /> Loading...</div>
          ) : (
            <>
              {profiles.length === 0 && !showForm && (
                <p className="text-xs text-white/30">No voice profiles yet. Create one from channel transcripts.</p>
              )}

              {profiles.map(p => (
                <div key={p.id} className={`vorta-sw-voice-item rounded-lg p-3 flex items-center justify-between ${selectedId === p.id ? 'selected' : ''}`}
                  style={{ background: selectedId === p.id ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selectedId === p.id ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white font-medium">{p.name}</span>
                      <span className="text-[10px] text-white/30">{p.transcriptCount} transcript{p.transcriptCount !== 1 ? 's' : ''}</span>
                    </div>
                    <span className="text-[10px] text-white/25">{new Date(p.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <button onClick={() => onSelect(selectedId === p.id ? null : p.id)}
                      className={`vorta-btn vorta-btn-sm ${selectedId === p.id ? 'vorta-btn-primary' : 'vorta-btn-ghost'}`}>
                      {selectedId === p.id ? <><Check size={11} /> Active</> : 'Use'}
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="text-white/20 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}

              {newFingerprint && (
                <div className="rounded-lg p-3" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                  <p className="text-[10px] text-green-400 font-medium mb-1">Voice fingerprint generated</p>
                  <p className="text-xs text-white/50 line-clamp-4">{newFingerprint.substring(0, 300)}...</p>
                </div>
              )}
            </>
          )}

          {showForm ? (
            <div className="space-y-3 pt-2 border-t border-white/[0.06]">
              <div>
                <label className="vorta-label">Profile name</label>
                <input className="vorta-input" placeholder="e.g. MagnatesMedia style" value={name} onChange={e => setName(e.target.value)} disabled={creating} />
              </div>
              {transcripts.map((t, i) => (
                <div key={i}>
                  <label className="vorta-label">Transcript {i + 1}{i === 0 ? ' (required)' : ''}</label>
                  <textarea className="vorta-textarea" rows={4} placeholder="Paste a video transcript here..." value={t}
                    onChange={e => updateTranscript(i, e.target.value)} disabled={creating} />
                </div>
              ))}
              {transcripts.length < 3 && (
                <button onClick={addTranscript} className="vorta-btn vorta-btn-ghost vorta-btn-sm" disabled={creating}>
                  <Plus size={12} /> Add another transcript
                </button>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={handleCreate} className="vorta-btn vorta-btn-primary vorta-btn-sm" disabled={creating || !name.trim() || !transcripts[0].trim()}>
                  {creating ? <><Loader2 size={12} className="animate-spin" /> Analyzing...</> : 'Analyze & Save'}
                </button>
                <button onClick={() => { setShowForm(false); setError('') }} className="vorta-btn vorta-btn-ghost vorta-btn-sm" disabled={creating}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowForm(true)} className="vorta-btn vorta-btn-secondary vorta-btn-sm w-full">
              <Plus size={12} /> Create new voice profile
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
