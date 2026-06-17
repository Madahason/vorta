import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Search, X, Loader2, AlertCircle, ChevronRight, ChevronLeft, RefreshCw, Sparkles, Globe, TrendingUp, Target, Users, BarChart3, Flame, Compass, Eye, Clock, ArrowRight, RotateCcw } from 'lucide-react'

const LS_KEY = 'vr_channel_profile'
const LS_HISTORY = 'vr_research_history'
const LS_LAST_REPORT = 'vr_last_report'
const MAX_HISTORY = 20

// --- localStorage helpers ---
function loadJson(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null } catch { return null }
}
function saveJson(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true } catch { return false }
}

function loadProfile() { return loadJson(LS_KEY) }
function saveProfile(p) { return saveJson(LS_KEY, p) }

function appendHistory(report) {
  try {
    let history = loadJson(LS_HISTORY) || []
    history.push(report)
    if (history.length > MAX_HISTORY) history = history.slice(history.length - MAX_HISTORY)
    saveJson(LS_HISTORY, history)
    saveJson(LS_LAST_REPORT, report)
  } catch {}
}

function loadLastReport() { return loadJson(LS_LAST_REPORT) }

// --- Relative time ---
function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

// --- Tag Input ---
function TagInput({ tags, onChange, max = 5, placeholder, disabled }) {
  const [input, setInput] = useState('')
  function addTag() {
    const val = input.trim()
    if (!val || tags.length >= max) return
    if (!tags.includes(val)) onChange([...tags, val])
    setInput('')
  }
  function removeTag(idx) { onChange(tags.filter((_, i) => i !== idx)) }
  return (
    <div className="vorta-input" style={{ padding: '6px 8px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 40 }}>
      {tags.map((tag, i) => (
        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium" style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd' }}>
          {tag}
          <button onClick={() => removeTag(i)} className="hover:text-white ml-0.5" type="button"><X size={12} /></button>
        </span>
      ))}
      {tags.length < max && (
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
          placeholder={tags.length === 0 ? placeholder : `${max - tags.length} remaining`}
          className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-white/80 text-sm placeholder:text-white/30"
          disabled={disabled} />
      )}
    </div>
  )
}

// --- Suggestion Chips ---
function SuggestionChips({ suggestions, selected, onSelect }) {
  if (!suggestions || suggestions.length === 0) return null
  return (
    <div className="vorta-suggestion-chips flex flex-wrap gap-1.5 mb-2">
      {suggestions.map((s, i) => (
        <button key={i} type="button" onClick={() => onSelect(i)}
          className="vorta-chip px-2.5 py-1 rounded-md text-xs transition-all cursor-pointer"
          style={{
            background: selected === i ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${selected === i ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.08)'}`,
            color: selected === i ? '#c4b5fd' : 'rgba(255,255,255,0.55)',
          }}>
          {s.length > 60 ? s.slice(0, 57) + '…' : s}
        </button>
      ))}
    </div>
  )
}

// --- Smart Field ---
function SmartField({ label, value, onChange, suggestions, selectedChip, onChipSelect, placeholder, disabled }) {
  const lastChipText = useRef(null)
  function handleChipSelect(idx) {
    const text = suggestions[idx]; lastChipText.current = text; onChipSelect(idx); onChange(text)
  }
  function handleInputChange(e) {
    const newVal = e.target.value; onChange(newVal)
    if (lastChipText.current && newVal !== lastChipText.current) { onChipSelect(null); lastChipText.current = null }
  }
  return (
    <div className="vorta-field">
      <label className="vorta-label">{label}</label>
      <SuggestionChips suggestions={suggestions} selected={selectedChip} onSelect={handleChipSelect} />
      <input className="vorta-input" value={value} onChange={handleInputChange} placeholder={placeholder} disabled={disabled} />
    </div>
  )
}

// --- Setup Form (State A) ---
function SetupForm({ onProfileCreated }) {
  const [tab, setTab] = useState('fresh')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [niche, setNiche] = useState('')
  const [subFocus, setSubFocus] = useState('')
  const [angle, setAngle] = useState('')
  const [tone, setTone] = useState('')
  const [freshCompetitors, setFreshCompetitors] = useState([])
  const [angleSuggestions, setAngleSuggestions] = useState([])
  const [toneSuggestions, setToneSuggestions] = useState([])
  const [selectedAngleChip, setSelectedAngleChip] = useState(null)
  const [selectedToneChip, setSelectedToneChip] = useState(null)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false)
  const suggestNicheRef = useRef('')
  const suggestSubFocusRef = useRef('')
  const [channelUrl, setChannelUrl] = useState('')
  const [existingCompetitors, setExistingCompetitors] = useState([])
  const phaseTimerRef = useRef(null)

  const freshValid = niche.trim() && subFocus.trim() && angle.trim() && tone.trim()
  const existingValid = channelUrl.trim()
  const canSuggest = niche.trim() && subFocus.trim() && !suggestionsLoading && !loading

  useEffect(() => {
    if (!suggestionsLoaded) return
    if (niche.trim() !== suggestNicheRef.current || subFocus.trim() !== suggestSubFocusRef.current) {
      setAngleSuggestions([]); setToneSuggestions([]); setSelectedAngleChip(null); setSelectedToneChip(null); setSuggestionsLoaded(false)
    }
  }, [niche, subFocus, suggestionsLoaded])

  const handleSuggest = useCallback(async () => {
    setSuggestionsLoading(true); setError('')
    try {
      const resp = await fetch('/api/research/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ niche: niche.trim(), subFocus: subFocus.trim() }) })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to get suggestions')
      setAngleSuggestions(data.angles || []); setToneSuggestions(data.tones || [])
      setSelectedAngleChip(null); setSelectedToneChip(null); setSuggestionsLoaded(true)
      suggestNicheRef.current = niche.trim(); suggestSubFocusRef.current = subFocus.trim()
    } catch (err) { setError(err.message) } finally { setSuggestionsLoading(false) }
  }, [niche, subFocus])

  async function handleFresh() {
    setLoading(true); setError(''); setStatus('Building your channel profile...')
    try {
      const resp = await fetch('/api/research/profile/fresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ niche, subFocus, angle, tone, competitors: freshCompetitors }) })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to build profile')
      if (!saveProfile(data)) setError('Warning: Could not save profile to localStorage.')
      onProfileCreated(data)
    } catch (err) { setError(err.message) } finally { setLoading(false); setStatus('') }
  }

  async function handleExisting() {
    setLoading(true); setError(''); setStatus('Pulling channel data...')
    phaseTimerRef.current = setTimeout(() => setStatus('Synthesising profile...'), 10000)
    try {
      const resp = await fetch('/api/research/profile/existing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelUrl, competitors: existingCompetitors }) })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to analyse channel')
      if (!saveProfile(data)) setError('Warning: Could not save profile to localStorage.')
      onProfileCreated(data)
    } catch (err) { setError(err.message) } finally {
      setLoading(false); setStatus('')
      if (phaseTimerRef.current) { clearTimeout(phaseTimerRef.current); phaseTimerRef.current = null }
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
      <div className="flex rounded-lg overflow-hidden mb-6" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <button onClick={() => { setTab('fresh'); setError('') }} className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === 'fresh' ? 'bg-purple-500/20 text-purple-300 border-b-2 border-purple-400' : 'text-white/40 hover:text-white/60'}`}>
          <Sparkles size={14} className="inline mr-1.5 -mt-0.5" />Fresh Channel
        </button>
        <button onClick={() => { setTab('existing'); setError('') }} className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === 'existing' ? 'bg-purple-500/20 text-purple-300 border-b-2 border-purple-400' : 'text-white/40 hover:text-white/60'}`}>
          <Globe size={14} className="inline mr-1.5 -mt-0.5" />Existing Channel
        </button>
      </div>
      <div className="rounded-xl p-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {tab === 'fresh' ? (
          <div className="space-y-4">
            <div className="vorta-field"><label className="vorta-label">Niche</label><input className="vorta-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="e.g. business & finance" disabled={loading} /></div>
            <div className="vorta-field"><label className="vorta-label">Sub-focus</label><input className="vorta-input" value={subFocus} onChange={e => setSubFocus(e.target.value)} placeholder="e.g. corporate fraud and collapse" disabled={loading} /></div>
            {canSuggest && !suggestionsLoaded && (
              <button type="button" onClick={handleSuggest} className="vorta-btn vorta-btn-ghost text-xs flex items-center gap-1.5" style={{ color: '#c4b5fd' }}>
                <Sparkles size={12} />Suggest →
              </button>
            )}
            {suggestionsLoading && <div className="flex items-center gap-2 text-xs text-purple-300/70"><Loader2 size={12} className="animate-spin" />Generating suggestions...</div>}
            <SmartField label="Angle" value={angle} onChange={setAngle} suggestions={angleSuggestions} selectedChip={selectedAngleChip} onChipSelect={setSelectedAngleChip} placeholder="e.g. investigative and critical" disabled={loading} />
            <SmartField label="Tone" value={tone} onChange={setTone} suggestions={toneSuggestions} selectedChip={selectedToneChip} onChipSelect={setSelectedToneChip} placeholder="e.g. dark and clinical like MagnatesMedia" disabled={loading} />
            <div className="vorta-field"><label className="vorta-label">Competitors (max 5)</label><TagInput tags={freshCompetitors} onChange={setFreshCompetitors} placeholder="@handle — press Enter to add" disabled={loading} /></div>
            <button onClick={handleFresh} disabled={loading || !freshValid} className="vorta-btn vorta-btn-primary w-full mt-2" style={{ opacity: loading || !freshValid ? 0.5 : 1 }}>
              {loading ? <><Loader2 size={14} className="animate-spin mr-2" />Building Profile...</> : 'Build Profile'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="vorta-field"><label className="vorta-label">YouTube Channel URL</label><input className="vorta-input" value={channelUrl} onChange={e => setChannelUrl(e.target.value)} placeholder="https://www.youtube.com/@MagnatesMedia" disabled={loading} /></div>
            <div className="vorta-field"><label className="vorta-label">Competitors (max 5)</label><TagInput tags={existingCompetitors} onChange={setExistingCompetitors} placeholder="@handle — press Enter to add" disabled={loading} /></div>
            <div className="rounded-lg px-3 py-2 text-xs text-white/35" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
              Analysing your channel pulls your full video catalog, top performers, and recent uploads via the YouTube API. This takes 15–30 seconds.
            </div>
            <button onClick={handleExisting} disabled={loading || !existingValid} className="vorta-btn vorta-btn-primary w-full mt-2" style={{ opacity: loading || !existingValid ? 0.5 : 1 }}>
              {loading ? <><Loader2 size={14} className="animate-spin mr-2" />Analysing Channel...</> : 'Analyse Channel'}
            </button>
          </div>
        )}
        {loading && status && <div className="mt-4 flex items-center gap-2 text-sm text-purple-300/70"><Loader2 size={14} className="animate-spin" />{status}</div>}
        {error && <div className="mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#fca5a5' }}><AlertCircle size={14} className="shrink-0 mt-0.5" /><span>{error}</span></div>}
      </div>
    </div>
  )
}

// --- Profile Summary (State B) ---
function ProfileSummary({ profile, onEdit, onStartResearch }) {
  const [showConfirm, setShowConfirm] = useState(false)
  function confirmEdit() { localStorage.removeItem(LS_KEY); setShowConfirm(false); onEdit() }
  const pf = profile.performanceFingerprint || {}
  const cd = profile.currentDirection || {}
  const catalogSize = (profile.catalog || []).length
  const cardStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }

  return (
    <div className="vorta-research-profile max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">{profile.channelName || 'Channel Profile'}</h1>
          <p className="text-xs text-white/30 mt-0.5">{profile.path === 'existing' ? 'Analysed from YouTube' : 'Fresh channel'} · Created {new Date(profile.createdAt).toLocaleDateString()}</p>
        </div>
        <button onClick={() => setShowConfirm(true)} className="vorta-btn vorta-btn-ghost text-xs flex items-center gap-1.5"><RefreshCw size={12} />Edit Profile</button>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <InfoCard icon={Target} label="Niche" value={profile.niche} />
        <InfoCard icon={Search} label="Sub-focus" value={profile.subFocus} />
        <InfoCard icon={TrendingUp} label="Angle" value={profile.angle} />
        <InfoCard icon={BarChart3} label="Tone" value={profile.tone} />
      </div>
      {(profile.competitors || []).length > 0 && (
        <div className="vorta-profile-section rounded-xl p-4 mb-4" style={cardStyle}>
          <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2"><Users size={12} className="inline mr-1.5 -mt-0.5" />Competitors</h3>
          <div className="flex flex-wrap gap-2">{profile.competitors.map((c, i) => <span key={i} className="px-2.5 py-1 rounded-md text-xs font-medium" style={{ background: 'rgba(139,92,246,0.1)', color: '#c4b5fd' }}>{c}</span>)}</div>
        </div>
      )}
      {profile.channelVoice && (
        <div className="vorta-profile-section rounded-xl p-4 mb-4" style={cardStyle}>
          <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2">Channel Voice</h3>
          <p className="text-sm text-white/70 leading-relaxed">{profile.channelVoice}</p>
        </div>
      )}
      {pf.topTopics?.length > 0 && (
        <div className="vorta-profile-section rounded-xl p-4 mb-4" style={cardStyle}>
          <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2"><TrendingUp size={12} className="inline mr-1.5 -mt-0.5" />Top-Performing Topics</h3>
          <div className="flex flex-wrap gap-2">{pf.topTopics.map((t, i) => <span key={i} className="px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(34,197,94,0.08)', color: '#86efac', border: '1px solid rgba(34,197,94,0.15)' }}>{t}</span>)}</div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {pf.winningFormats?.length > 0 && (
          <div className="vorta-profile-section rounded-xl p-4" style={cardStyle}>
            <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2">Winning Formats</h3>
            <ul className="space-y-1">{pf.winningFormats.map((f, i) => <li key={i} className="text-xs text-white/60 flex items-start gap-1.5"><ChevronRight size={10} className="shrink-0 mt-0.5 text-purple-400" />{f}</li>)}</ul>
          </div>
        )}
        {profile.path === 'existing' && (
          <div className="vorta-profile-section rounded-xl p-4" style={cardStyle}>
            <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2">Performance</h3>
            <div className="space-y-2">
              {catalogSize > 0 && <div className="text-xs text-white/60"><span className="text-white font-medium">{catalogSize}</span> videos analysed</div>}
              {pf.avgViewsTop20 > 0 && <div className="text-xs text-white/60">Avg views (top 20): <span className="text-white font-medium">{pf.avgViewsTop20.toLocaleString()}</span></div>}
              {pf.bestPerformingTitle && <div className="text-xs text-white/60">Best: <span className="text-white/80 italic">"{pf.bestPerformingTitle}"</span></div>}
            </div>
          </div>
        )}
      </div>
      {(profile.gaps || []).length > 0 && (
        <div className="vorta-profile-section rounded-xl p-4 mb-4" style={cardStyle}>
          <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2">Content Gaps</h3>
          <ul className="space-y-1.5">{profile.gaps.map((g, i) => <li key={i} className="text-xs text-white/60 flex items-start gap-1.5"><span className="text-amber-400 shrink-0">•</span>{g}</li>)}</ul>
        </div>
      )}
      {cd.recentTopics?.length > 0 && (
        <div className="vorta-profile-section rounded-xl p-4 mb-6" style={cardStyle}>
          <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2">Current Direction</h3>
          <div className="flex flex-wrap gap-2 mb-2">{cd.recentTopics.map((t, i) => <span key={i} className="px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(59,130,246,0.08)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.15)' }}>{t}</span>)}</div>
          {cd.editorialShift && <p className="text-xs text-white/50 mt-2">{cd.editorialShift}</p>}
        </div>
      )}
      {/* Start Researching — now active */}
      <button onClick={onStartResearch} className="vorta-btn vorta-btn-primary w-full py-3 text-sm font-medium rounded-xl flex items-center justify-center gap-2">
        Start Researching <ChevronRight size={14} />
      </button>
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

// --- Opportunity Card ---
function ScoreBadge({ score }) {
  const color = score >= 8 ? '#22c55e' : score >= 5 ? '#f59e0b' : '#ef4444'
  const bg = score >= 8 ? 'rgba(34,197,94,0.12)' : score >= 5 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)'
  return (
    <span className="vorta-score-badge inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: bg, color, border: `1px solid ${color}33` }}>
      {score}/10
    </span>
  )
}

function VolumePill({ volume }) {
  const colors = { high: '#86efac', medium: '#fbbf24', low: '#94a3b8' }
  return (
    <span className="vorta-volume-pill px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium" style={{ color: colors[volume] || '#94a3b8', background: 'rgba(255,255,255,0.04)' }}>
      {volume || 'unknown'} volume
    </span>
  )
}

function OpportunityCard({ item, panel, onExplore }) {
  return (
    <div className="vorta-opportunity-card rounded-lg p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-white leading-snug flex-1">{item.title}</h4>
        <ScoreBadge score={item.opportunityScore} />
      </div>
      <p className="text-xs text-white/50 leading-relaxed mb-3">{item.summary}</p>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <VolumePill volume={item.estimatedSearchVolume} />
        {panel === 'trending' && item.trendSignal && (
          <span className="vorta-trend-signal text-[10px] text-white/35 italic">{item.trendSignal}</span>
        )}
        {panel === 'gaps' && (
          <>
            {item.gapReason && <span className="vorta-gap-reason text-[10px] text-amber-400/70">{item.gapReason}</span>}
            {item.lastCoveredYear && <span className="vorta-gap-year text-[10px] text-white/25">Last: {item.lastCoveredYear}</span>}
          </>
        )}
        {panel === 'competitors' && (
          <>
            {item.channel && <span className="vorta-competitor-channel px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'rgba(139,92,246,0.1)', color: '#c4b5fd' }}>{item.channel}</span>}
          </>
        )}
      </div>
      {panel === 'competitors' && item.suggestedAngle && (
        <p className="text-[11px] text-purple-300/60 italic mb-3">"{item.suggestedAngle}"</p>
      )}
      <div className="flex justify-end">
        <button onClick={() => onExplore(item)} className="vorta-btn vorta-btn-ghost text-[11px] flex items-center gap-1 px-2 py-1" style={{ color: '#c4b5fd' }}>
          Explore <ArrowRight size={10} />
        </button>
      </div>
    </div>
  )
}

// --- Skeleton Loader ---
function SkeletonCards() {
  return (
    <div className="vorta-skeleton-cards space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="rounded-lg p-4 animate-pulse" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="h-4 rounded w-3/4 mb-3" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <div className="h-3 rounded w-full mb-2" style={{ background: 'rgba(255,255,255,0.04)' }} />
          <div className="h-3 rounded w-2/3" style={{ background: 'rgba(255,255,255,0.04)' }} />
        </div>
      ))}
    </div>
  )
}

// --- Panel Column ---
function PanelColumn({ title, subtitle, icon: Icon, items, loading, error, panelName, onRetry, onExplore }) {
  const sorted = useMemo(() => (items || []).slice().sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0)), [items])
  return (
    <div className="vorta-panel-column flex flex-col min-w-0">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon size={16} className="text-purple-400 shrink-0" />
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        <p className="text-[11px] text-white/35">{subtitle}</p>
      </div>
      {loading && <SkeletonCards />}
      {error && (
        <div className="vorta-panel-error rounded-lg p-4" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
          <div className="flex items-start gap-2 mb-3">
            <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
          <button onClick={onRetry} className="vorta-btn vorta-btn-ghost text-[11px] flex items-center gap-1.5 text-red-300">
            <RotateCcw size={10} />Retry panel
          </button>
        </div>
      )}
      {!loading && !error && sorted.length === 0 && (
        <div className="vorta-panel-empty rounded-lg p-6 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <p className="text-xs text-white/30">No opportunities found for this panel</p>
        </div>
      )}
      {!loading && !error && sorted.length > 0 && (
        <div className="space-y-3">
          {sorted.map((item, i) => <OpportunityCard key={i} item={item} panel={panelName} onExplore={onExplore} />)}
        </div>
      )}
    </div>
  )
}

// --- Explore Slide-in ---
function ExplorePanel({ item, onClose }) {
  if (!item) return null
  return (
    <div className="vorta-explore-panel fixed inset-y-0 right-0 z-40 w-[480px] flex flex-col" style={{ background: '#141414', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 className="text-sm font-semibold text-white">Idea Card</h3>
        <button onClick={onClose} className="vorta-btn vorta-btn-ghost p-1"><X size={16} /></button>
      </div>
      <div className="flex-1 p-5 overflow-y-auto">
        <h4 className="text-base font-medium text-white mb-3">{item.title}</h4>
        <p className="text-sm text-white/50 mb-6">{item.summary}</p>
        <div className="rounded-lg p-6 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)' }}>
          <p className="text-xs text-white/25">Idea Card — coming in VR-3</p>
        </div>
      </div>
    </div>
  )
}

// --- Research Dashboard (State C) ---
function ResearchDashboard({ profile, onBack }) {
  const [report, setReport] = useState(() => loadLastReport())
  const [panelData, setPanelData] = useState({ trending: null, gaps: null, competitors: null })
  const [panelLoading, setPanelLoading] = useState({ trending: false, gaps: false, competitors: false })
  const [panelErrors, setPanelErrors] = useState({ trending: null, gaps: null, competitors: null })
  const [streaming, setStreaming] = useState(false)
  const [exploreItem, setExploreItem] = useState(null)
  const [genTime, setGenTime] = useState(report?.generatedAt || null)
  const [timeAgoStr, setTimeAgoStr] = useState('')

  // Update relative time every 30s
  useEffect(() => {
    if (!genTime) return
    const update = () => setTimeAgoStr(timeAgo(genTime))
    update()
    const iv = setInterval(update, 30000)
    return () => clearInterval(iv)
  }, [genTime])

  // On mount, populate panelData from cached report
  useEffect(() => {
    if (report) {
      setPanelData({ trending: report.trending || [], gaps: report.gaps || [], competitors: report.competitors || [] })
    }
  }, [])

  const runDiscovery = useCallback(async () => {
    setStreaming(true)
    setPanelData({ trending: null, gaps: null, competitors: null })
    setPanelLoading({ trending: true, gaps: true, competitors: true })
    setPanelErrors({ trending: null, gaps: null, competitors: null })

    try {
      const resp = await fetch('/api/research/discover/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      })

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalReport = { trending: [], gaps: [], competitors: [], reportId: null, generatedAt: null, profileId: profile.profileId }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.type === 'panel') {
              const items = evt.items || []
              finalReport[evt.panel] = items
              setPanelData(prev => ({ ...prev, [evt.panel]: items }))
              setPanelLoading(prev => ({ ...prev, [evt.panel]: false }))
            } else if (evt.type === 'error') {
              setPanelErrors(prev => ({ ...prev, [evt.panel]: evt.message }))
              setPanelLoading(prev => ({ ...prev, [evt.panel]: false }))
            } else if (evt.type === 'done') {
              finalReport.reportId = evt.reportId
              finalReport.generatedAt = evt.generatedAt
              setGenTime(evt.generatedAt)
            }
          } catch {}
        }
      }

      const fullReport = { ...finalReport, profileId: profile.profileId }
      setReport(fullReport)
      appendHistory(fullReport)
    } catch (err) {
      setPanelErrors({ trending: err.message, gaps: err.message, competitors: err.message })
      setPanelLoading({ trending: false, gaps: false, competitors: false })
    } finally {
      setStreaming(false)
    }
  }, [profile])

  // Auto-run if no cached report
  useEffect(() => {
    if (!report) runDiscovery()
  }, [])

  async function retryPanel(panelName) {
    setPanelLoading(prev => ({ ...prev, [panelName]: true }))
    setPanelErrors(prev => ({ ...prev, [panelName]: null }))
    try {
      const resp = await fetch('/api/research/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to retry')
      const items = data[panelName] || []
      setPanelData(prev => ({ ...prev, [panelName]: items }))
      // Update stored report
      setReport(prev => {
        const updated = { ...prev, [panelName]: items }
        saveJson(LS_LAST_REPORT, updated)
        return updated
      })
    } catch (err) {
      setPanelErrors(prev => ({ ...prev, [panelName]: err.message }))
    } finally {
      setPanelLoading(prev => ({ ...prev, [panelName]: false }))
    }
  }

  return (
    <div className="vorta-research-dashboard flex flex-col h-full">
      {/* Top bar */}
      <div className="vorta-dashboard-topbar flex items-center justify-between px-6 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="vorta-btn vorta-btn-ghost text-xs flex items-center gap-1.5 text-white/50 hover:text-white/80">
            <ChevronLeft size={14} />Back to Profile
          </button>
          <div className="vorta-profile-pill px-3 py-1 rounded-full text-[11px] text-white/40" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {profile.channelName || profile.niche} · {profile.subFocus}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {timeAgoStr && (
            <span className="vorta-timestamp flex items-center gap-1.5 text-[11px] text-white/25">
              <Clock size={10} />Research generated {timeAgoStr}
            </span>
          )}
          <button onClick={runDiscovery} disabled={streaming} className="vorta-btn vorta-btn-primary text-xs flex items-center gap-1.5" style={{ opacity: streaming ? 0.5 : 1 }}>
            {streaming ? <><Loader2 size={12} className="animate-spin" />Researching...</> : <><RefreshCw size={12} />New Research</>}
          </button>
        </div>
      </div>

      {/* Three-column grid */}
      <div className="vorta-dashboard-grid flex-1 grid grid-cols-3 gap-6 p-6 overflow-y-auto">
        <PanelColumn title="Trending Now" subtitle="Topics gaining momentum in your niche right now" icon={Flame}
          items={panelData.trending} loading={panelLoading.trending} error={panelErrors.trending}
          panelName="trending" onRetry={() => retryPanel('trending')} onExplore={setExploreItem} />
        <PanelColumn title="Gap Finder" subtitle="High-demand topics with weak or outdated YouTube coverage" icon={Compass}
          items={panelData.gaps} loading={panelLoading.gaps} error={panelErrors.gaps}
          panelName="gaps" onRetry={() => retryPanel('gaps')} onExplore={setExploreItem} />
        <PanelColumn title="Competitor Watch" subtitle="Overperforming videos from competitor channels" icon={Eye}
          items={panelData.competitors} loading={panelLoading.competitors} error={panelErrors.competitors}
          panelName="competitors" onRetry={() => retryPanel('competitors')} onExplore={setExploreItem} />
      </div>

      {/* Explore slide-in */}
      {exploreItem && (
        <>
          <div className="fixed inset-0 z-30" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setExploreItem(null)} />
          <ExplorePanel item={exploreItem} onClose={() => setExploreItem(null)} />
        </>
      )}
    </div>
  )
}

function InfoCard({ icon: Icon, label, value }) {
  return (
    <div className="vorta-info-card rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
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
  const [view, setView] = useState('profile') // 'profile' | 'dashboard'

  if (!profile) {
    return <div className="p-8"><SetupForm onProfileCreated={p => setProfile(p)} /></div>
  }

  if (view === 'dashboard') {
    return <ResearchDashboard profile={profile} onBack={() => setView('profile')} />
  }

  return (
    <div className="p-8">
      <ProfileSummary
        profile={profile}
        onEdit={() => setProfile(null)}
        onStartResearch={() => setView('dashboard')}
      />
    </div>
  )
}
