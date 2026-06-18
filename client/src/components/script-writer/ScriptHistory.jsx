import { useState, useEffect } from 'react'
import { X, Loader2, Trash2, FileText } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const STYLE_NAMES = {
  documentary_explainer: 'Documentary Explainer',
  rise_and_fall: 'Rise & Fall',
  business_model: 'Business Model',
  hidden_system: 'Hidden System',
  investigative: 'Investigative',
  contrarian: 'Contrarian',
  case_study: 'Case Study',
  founder_psychology: 'Founder Psychology'
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function OrigBadge({ scanResult }) {
  if (!scanResult || scanResult.skipped) return null
  const orig = scanResult.originality ?? 0
  const cls = orig >= 90 ? 'green' : orig >= 75 ? 'amber' : 'red'
  return <span className={`vorta-sw-history-badge ${cls}`}>{orig}% orig</span>
}

function Stars({ rating }) {
  return (
    <div className="vorta-sw-history-stars">
      {[1, 2, 3, 4, 5].map(s => (
        <span key={s} className={`vorta-sw-history-star ${s <= (rating || 0) ? 'filled' : ''}`}>★</span>
      ))}
    </div>
  )
}

export default function ScriptHistory({ onClose, onLoadScript }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingId, setLoadingId] = useState(null)

  useEffect(() => {
    fetchHistory()
  }, [])

  async function fetchHistory() {
    try {
      const res = await fetch(`${API}/api/script-writer/history`)
      const data = await res.json()
      setEntries(data)
    } catch {}
    setLoading(false)
  }

  async function handleLoad(id) {
    setLoadingId(id)
    try {
      const res = await fetch(`${API}/api/script-writer/history/${id}`)
      if (!res.ok) throw new Error('Not found')
      const entry = await res.json()
      onLoadScript(entry.script, entry)
    } catch {}
    setLoadingId(null)
  }

  async function handleDelete(id) {
    try {
      await fetch(`${API}/api/script-writer/history/${id}`, { method: 'DELETE' })
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch {}
  }

  return (
    <div className="vorta-sw-history-panel">
      <div className="vorta-sw-history-header">
        <h3>Script History</h3>
        <button onClick={onClose} className="text-white/40 hover:text-white/70"><X size={18} /></button>
      </div>

      <div className="vorta-sw-history-list">
        {loading && (
          <div className="flex items-center gap-2 text-white/40 text-sm p-4">
            <Loader2 size={14} className="animate-spin" /> Loading...
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="text-center py-12">
            <FileText size={24} className="text-white/15 mx-auto mb-3" />
            <p className="text-xs text-white/30">No scripts generated yet.</p>
          </div>
        )}

        {entries.map(entry => (
          <div key={entry.id} className="vorta-sw-history-card">
            <div className="vorta-sw-history-card-topic">{entry.topic}</div>
            <Stars rating={entry.rating} />
            <div className="vorta-sw-history-card-meta">
              <span className="vorta-sw-history-badge">{STYLE_NAMES[entry.styleTemplate] || entry.styleTemplate}</span>
              <span className="vorta-sw-history-badge">{entry.targetLength} min</span>
              <span className="vorta-sw-history-badge">{entry.wordCount?.toLocaleString() || '?'} words</span>
              <OrigBadge scanResult={entry.scanResult} />
              {entry.usedCount > 0 && <span className="vorta-sw-history-badge green">Used {entry.usedCount}×</span>}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/25">{formatDate(entry.createdAt)}</span>
              <div className="vorta-sw-history-card-actions">
                <button
                  onClick={() => handleLoad(entry.id)}
                  disabled={loadingId === entry.id}
                  className="vorta-btn vorta-btn-ghost vorta-btn-sm"
                >
                  {loadingId === entry.id ? <Loader2 size={11} className="animate-spin" /> : 'Load'}
                </button>
                <button onClick={() => handleDelete(entry.id)} className="text-white/20 hover:text-red-400 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
