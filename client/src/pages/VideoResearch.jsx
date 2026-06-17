import { useState, useEffect, useRef } from 'react'
import { Search, Plus, X, Loader2, AlertCircle, ChevronRight, RefreshCw, Sparkles, Globe, TrendingUp, Target, Users, BarChart3 } from 'lucide-react'

const LS_KEY = 'vr_channel_profile'

function loadProfile() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveProfile(profile) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(profile))
    return true
  } catch {
    return false
  }
}

// --- Tag Input ---
function TagInput({ tags, onChange, max = 5, placeholder }) {
  const [input, setInput] = useState('')

  function addTag() {
    const val = input.trim()
    if (!val || tags.length >= max) return
    if (!tags.includes(val)) {
      onChange([...tags, val])
    }
    setInput('')
  }

  function removeTag(idx) {
    onChange(tags.filter((_, i) => i !== idx))
  }

  return (
    <div className="vorta-input" style={{ padding: '6px 8px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 40 }}>
      {tags.map((tag, i) => (
        <span key={i} className="vorta-tag inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium" style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd' }}>
          {tag}
          <button onClick={() => removeTag(i)} className="hover:text-white ml-0.5">
            <X size={12} />
          </button>
        </span>
      ))}
      {tags.length < max && (
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); addTag() }
          }}
          placeholder={tags.length === 0 ? placeholder : `${max - tags.length} remaining`}
          className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-white/80 text-sm placeholder:text-white/30"
        />
      )}
    </div>
  )
}

// --- Setup Form (State A) ---
function SetupForm({ onProfileCreated }) {
  const [tab, setTab] = useState('fresh')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  // Fresh fields
  const [niche, setNiche] = useState('')
  const [subFocus, setSubFocus] = useState('')
  const [angle, setAngle] = useState('')
  const [tone, setTone] = useState('')
  const [freshCompetitors, setFreshCompetitors] = useState([])

  // Existing fields
  const [channelUrl, setChannelUrl] = useState('')
  const [existingCompetitors, setExistingCompetitors] = useState([])

  const freshValid = niche.trim() && subFocus.trim() && angle.trim() && tone.trim()
  const existingValid = channelUrl.trim()

  async function handleFresh() {
    setLoading(true)
    setError('')
    setStatus('Synthesising profile...')
    try {
      const resp = await fetch('/api/research/profile/fresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche, subFocus, angle, tone, competitors: freshCompetitors }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to build profile')
      if (!saveProfile(data)) {
        setError('Warning: Could not save profile to localStorage. Your browser storage may be full.')
      }
      onProfileCreated(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setStatus('')
    }
  }

  async function handleExisting() {
    setLoading(true)
    setError('')
    setStatus('Pulling channel data...')
    try {
      const resp = await fetch('/api/research/profile/existing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelUrl, competitors: existingCompetitors }),
      })
      setStatus('Synthesising profile...')
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to analyse channel')
      if (!saveProfile(data)) {
        setError('Warning: Could not save profile to localStorage. Your browser storage may be full.')
      }
      onProfileCreated(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setStatus('')
    }
  }

  return (
    <div className="vorta-research-setup max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4" style={{ background: 'rgba(139,92,246,0.12)' }}>
          <Search size={22} className="text-purple-400" />
        </div>
        <h1 className="text-xl font-semibold text-white mb-1">Channel Profile Setup</h1>
        <p className="text-sm text-white/40">Define your channel identity to power video research</p>
      </div>

      {/* Tabs */}
      <div className="flex rounded-lg overflow-hidden mb-6" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <button
          onClick={() => { setTab('fresh'); setError('') }}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === 'fresh' ? 'bg-purple-500/20 text-purple-300 border-b-2 border-purple-400' : 'text-white/40 hover:text-white/60'}`}
        >
          <Sparkles size={14} className="inline mr-1.5 -mt-0.5" />
          Fresh Channel
        </button>
        <button
          onClick={() => { setTab('existing'); setError('') }}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === 'existing' ? 'bg-purple-500/20 text-purple-300 border-b-2 border-purple-400' : 'text-white/40 hover:text-white/60'}`}
        >
          <Globe size={14} className="inline mr-1.5 -mt-0.5" />
          Existing Channel
        </button>
      </div>

      {/* Form */}
      <div className="rounded-xl p-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {tab === 'fresh' ? (
          <div className="space-y-4">
            <div className="vorta-field">
              <label className="vorta-label">Niche</label>
              <input className="vorta-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="e.g. business & finance" disabled={loading} />
            </div>
            <div className="vorta-field">
              <label className="vorta-label">Sub-focus</label>
              <input className="vorta-input" value={subFocus} onChange={e => setSubFocus(e.target.value)} placeholder="e.g. corporate fraud and collapse" disabled={loading} />
            </div>
            <div className="vorta-field">
              <label className="vorta-label">Angle</label>
              <input className="vorta-input" value={angle} onChange={e => setAngle(e.target.value)} placeholder="e.g. investigative and critical" disabled={loading} />
            </div>
            <div className="vorta-field">
              <label className="vorta-label">Tone</label>
              <input className="vorta-input" value={tone} onChange={e => setTone(e.target.value)} placeholder="e.g. dark and clinical like MagnatesMedia" disabled={loading} />
            </div>
            <div className="vorta-field">
              <label className="vorta-label">Competitors (max 5)</label>
              <TagInput tags={freshCompetitors} onChange={setFreshCompetitors} placeholder="@handle — press Enter to add" />
            </div>
            <button
              onClick={handleFresh}
              disabled={loading || !freshValid}
              className="vorta-btn vorta-btn-primary w-full mt-2"
              style={{ opacity: loading || !freshValid ? 0.5 : 1 }}
            >
              {loading ? <><Loader2 size={14} className="animate-spin mr-2" />Building Profile...</> : 'Build Profile'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="vorta-field">
              <label className="vorta-label">YouTube Channel URL</label>
              <input className="vorta-input" value={channelUrl} onChange={e => setChannelUrl(e.target.value)} placeholder="https://www.youtube.com/@MagnatesMedia" disabled={loading} />
            </div>
            <div className="vorta-field">
              <label className="vorta-label">Competitors (max 5)</label>
              <TagInput tags={existingCompetitors} onChange={setExistingCompetitors} placeholder="@handle — press Enter to add" />
            </div>
            <div className="rounded-lg px-3 py-2 text-xs text-white/35" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
              Analysing your channel pulls your full video catalog, top performers, and recent uploads via the YouTube API. This takes 15–30 seconds.
            </div>
            <button
              onClick={handleExisting}
              disabled={loading || !existingValid}
              className="vorta-btn vorta-btn-primary w-full mt-2"
              style={{ opacity: loading || !existingValid ? 0.5 : 1 }}
            >
              {loading ? <><Loader2 size={14} className="animate-spin mr-2" />Analysing Channel...</> : 'Analyse Channel'}
            </button>
          </div>
        )}

        {/* Loading status */}
        {loading && status && (
          <div className="mt-4 flex items-center gap-2 text-sm text-purple-300/70">
            <Loader2 size={14} className="animate-spin" />
            {status}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#fca5a5' }}>
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Profile Summary (State B) ---
function ProfileSummary({ profile, onEdit }) {
  const [showConfirm, setShowConfirm] = useState(false)

  function handleEdit() {
    setShowConfirm(true)
  }

  function confirmEdit() {
    localStorage.removeItem(LS_KEY)
    setShowConfirm(false)
    onEdit()
  }

  const pf = profile.performanceFingerprint || {}
  const cd = profile.currentDirection || {}
  const catalogSize = (profile.catalog || []).length

  return (
    <div className="vorta-research-profile max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">{profile.channelName || 'Channel Profile'}</h1>
          <p className="text-xs text-white/30 mt-0.5">
            {profile.path === 'existing' ? 'Analysed from YouTube' : 'Fresh channel'} · Created {new Date(profile.createdAt).toLocaleDateString()}
          </p>
        </div>
        <button onClick={handleEdit} className="vorta-btn vorta-btn-ghost text-xs flex items-center gap-1.5">
          <RefreshCw size={12} />
          Edit Profile
        </button>
      </div>

      {/* Summary Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <InfoCard icon={Target} label="Niche" value={profile.niche} />
        <InfoCard icon={Search} label="Sub-focus" value={profile.subFocus} />
        <InfoCard icon={TrendingUp} label="Angle" value={profile.angle} />
        <InfoCard icon={BarChart3} label="Tone" value={profile.tone} />
      </div>

      {/* Competitors */}
      {(profile.competitors || []).length > 0 && (
        <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
            <Users size={12} className="inline mr-1.5 -mt-0.5" />
            Competitors
          </h3>
          <div className="flex flex-wrap gap-2">
            {profile.competitors.map((c, i) => (
              <span key={i} className="px-2.5 py-1 rounded-md text-xs font-medium" style={{ background: 'rgba(139,92,246,0.1)', color: '#c4b5fd' }}>
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Channel Voice */}
      {profile.channelVoice && (
        <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2">Channel Voice</h3>
          <p className="text-sm text-white/70 leading-relaxed">{profile.channelVoice}</p>
        </div>
      )}

      {/* Top Topics */}
      {pf.topTopics?.length > 0 && (
        <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
            <TrendingUp size={12} className="inline mr-1.5 -mt-0.5" />
            Top-Performing Topics
          </h3>
          <div className="flex flex-wrap gap-2">
            {pf.topTopics.map((t, i) => (
              <span key={i} className="px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(34,197,94,0.08)', color: '#86efac', border: '1px solid rgba(34,197,94,0.15)' }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Winning Formats + Performance */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {pf.winningFormats?.length > 0 && (
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2">Winning Formats</h3>
            <ul className="space-y-1">
              {pf.winningFormats.map((f, i) => (
                <li key={i} className="text-xs text-white/60 flex items-start gap-1.5">
                  <ChevronRight size={10} className="shrink-0 mt-0.5 text-purple-400" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}
        {profile.path === 'existing' && (
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2">Performance</h3>
            <div className="space-y-2">
              {catalogSize > 0 && (
                <div className="text-xs text-white/60">
                  <span className="text-white font-medium">{catalogSize}</span> videos analysed
                </div>
              )}
              {pf.avgViewsTop20 > 0 && (
                <div className="text-xs text-white/60">
                  Avg views (top 20): <span className="text-white font-medium">{pf.avgViewsTop20.toLocaleString()}</span>
                </div>
              )}
              {pf.bestPerformingTitle && (
                <div className="text-xs text-white/60">
                  Best: <span className="text-white/80 italic">"{pf.bestPerformingTitle}"</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Gaps */}
      {(profile.gaps || []).length > 0 && (
        <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2">Content Gaps</h3>
          <ul className="space-y-1.5">
            {profile.gaps.map((g, i) => (
              <li key={i} className="text-xs text-white/60 flex items-start gap-1.5">
                <span className="text-amber-400 shrink-0">•</span>
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Current Direction */}
      {cd.recentTopics?.length > 0 && (
        <div className="rounded-xl p-4 mb-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2">Current Direction</h3>
          <div className="flex flex-wrap gap-2 mb-2">
            {cd.recentTopics.map((t, i) => (
              <span key={i} className="px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(59,130,246,0.08)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.15)' }}>
                {t}
              </span>
            ))}
          </div>
          {cd.editorialShift && (
            <p className="text-xs text-white/50 mt-2">{cd.editorialShift}</p>
          )}
        </div>
      )}

      {/* Start Researching CTA */}
      <div className="relative group">
        <button
          disabled
          className="vorta-btn w-full py-3 text-sm font-medium rounded-xl flex items-center justify-center gap-2"
          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.25)', cursor: 'not-allowed', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          Start Researching
          <ChevronRight size={14} />
        </button>
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded text-[10px] text-white/50 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)' }}>
          Coming in next phase
        </div>
      </div>

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowConfirm(false)}>
          <div className="rounded-xl p-6 max-w-sm mx-4" style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-2">Clear current profile?</h3>
            <p className="text-xs text-white/50 mb-4">This will clear your current profile. Research history will be kept.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowConfirm(false)} className="vorta-btn vorta-btn-ghost text-xs">Cancel</button>
              <button onClick={confirmEdit} className="vorta-btn vorta-btn-danger text-xs">Clear Profile</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={11} className="text-white/30" />
        <span className="text-[10px] font-medium text-white/35 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm text-white/80">{value || '—'}</p>
    </div>
  )
}

// --- Main Page ---
export default function VideoResearch() {
  const [profile, setProfile] = useState(() => loadProfile())

  if (profile) {
    return (
      <div className="p-8">
        <ProfileSummary profile={profile} onEdit={() => setProfile(null)} />
      </div>
    )
  }

  return (
    <div className="p-8">
      <SetupForm onProfileCreated={(p) => setProfile(p)} />
    </div>
  )
}
