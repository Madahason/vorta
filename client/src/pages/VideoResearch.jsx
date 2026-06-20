import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Search, X, Loader2, AlertCircle, ChevronRight, ChevronLeft, RefreshCw, Sparkles, Globe, TrendingUp, Target, Users, BarChart3, Flame, Compass, Eye, Clock, ArrowRight, RotateCcw, Check, ChevronDown, Star, PenLine, BookOpen, History, Trash2, Edit3, Filter } from 'lucide-react'
import DeepCompetitorPanel from '../components/video-research/DeepCompetitorPanel'

const LS_KEY = 'vr_channel_profile'
const LS_HISTORY = 'vr_research_history'
const LS_LAST_REPORT = 'vr_last_report'
const LS_SELECTED_IDEA = 'vr_selected_idea'
const LS_BANNER_DISMISSED = 'vr_idea_banner_dismissed'
const LS_BRIEF_DISMISSED = 'vr_brief_dismissed_in_scriptwriter'
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

function appendHistory(report, profile) {
  try {
    const entry = { ...report }
    if (profile && !entry.profileSnapshot) {
      entry.profileSnapshot = { channelName: profile.channelName || '', niche: profile.niche || '', subFocus: profile.subFocus || '' }
    }
    let history = loadJson(LS_HISTORY) || []
    history.push(entry)
    if (history.length > MAX_HISTORY) history = history.slice(history.length - MAX_HISTORY)
    saveJson(LS_HISTORY, history)
    saveJson(LS_LAST_REPORT, entry)
  } catch {}
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
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
      const resp = await fetch('http://localhost:3001/api/research/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ niche: niche.trim(), subFocus: subFocus.trim() }) })
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
      const resp = await fetch('http://localhost:3001/api/research/profile/fresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ niche, subFocus, angle, tone, competitors: freshCompetitors }) })
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
      const resp = await fetch('http://localhost:3001/api/research/profile/existing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelUrl, competitors: existingCompetitors }) })
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
function ProfileSummary({ profile, onEdit, onStartResearch, onOpenHistory, onEditProfile }) {
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
        <button onClick={onEditProfile} className="vorta-btn vorta-btn-ghost text-xs flex items-center gap-1.5"><Edit3 size={12} />Edit Profile</button>
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
      {onOpenHistory && (
        <button onClick={onOpenHistory} className="vorta-btn vorta-btn-ghost w-full mt-2 text-xs flex items-center justify-center gap-1.5 text-white/40 hover:text-white/60">
          <History size={12} />View Research History
        </button>
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

// --- Mini Sparkline ---
function MiniSparkline({ points }) {
  if (!points || points.length < 2) return null
  const vals = points.map(p => p.value || 0)
  const max = Math.max(...vals, 1)
  const w = 60; const h = 20
  const step = w / (vals.length - 1)
  const d = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${i * step},${h - (v / max) * h}`).join(' ')
  return <svg className="vorta-sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`}><path d={d} fill="none" stroke="rgba(139,92,246,0.5)" strokeWidth="1.5" /></svg>
}

function formatK(n) { return n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n) }

function OpportunityCard({ item, panel, onExplore, saved }) {
  const td = item.trendData || {}
  const cd = item.competitionData || {}
  const isEstimate = td.dataSource === 'claude-estimate'

  return (
    <div className="vorta-opportunity-card rounded-lg p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-white leading-snug flex-1">{item.title}</h4>
        <div className="flex items-center gap-1.5 shrink-0">
          {saved && <span className="vorta-saved-chip inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'rgba(34,197,94,0.12)', color: '#86efac' }}><Check size={8} />Saved</span>}
          <ScoreBadge score={item.opportunityScore} />
        </div>
      </div>
      <p className="text-xs text-white/50 leading-relaxed mb-2">{item.summary}</p>

      {/* Enriched trend data for Trending panel */}
      {panel === 'trending' && td.interestScore !== undefined && (
        <div className="vorta-trend-data flex items-center gap-2 mb-2">
          <span className="text-[10px] text-white/45">Interest: {td.interestScore}/100 · <span className={td.trend === 'rising' ? 'text-green-400' : td.trend === 'falling' ? 'text-red-400' : 'text-white/40'}>{td.trend || 'stable'}</span></span>
          <MiniSparkline points={td.timelinePoints} />
          {isEstimate && <span className="vorta-estimate-chip text-[9px] text-white/25 px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)' }}>~est.</span>}
        </div>
      )}

      {/* Enriched competition data for Gaps panel */}
      {panel === 'gaps' && cd.totalResults !== undefined && (
        <div className="vorta-comp-data text-[10px] text-white/35 mb-2">
          {cd.totalResults} videos · median {formatK(cd.medianViews || 0)} views · {cd.competitionLevel || 'unknown'} competition
          {(cd.weakCoverageSignals || []).slice(0, 2).map((s, i) => <span key={i} className="block text-[10px] text-amber-400/50 italic mt-0.5">{s}</span>)}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <VolumePill volume={item.estimatedSearchVolume} />
        {panel === 'trending' && item.trendSignal && !td.interestScore && (
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
            {item.channel && (
              <span className="vorta-competitor-channel px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'rgba(139,92,246,0.1)', color: '#c4b5fd' }}>
                {item.channel}{item.subscriberCount ? ` · ${formatK(item.subscriberCount)} subs` : ''}
              </span>
            )}
            {item.realViews > 0 && <span className="text-[10px] text-white/30">{formatK(item.realViews)} views</span>}
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
function PanelColumn({ title, subtitle, icon: Icon, items, loading, error, panelName, onRetry, onExplore, savedTopic, headerExtra }) {
  const sorted = useMemo(() => (items || []).slice().sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0)), [items])
  return (
    <div className="vorta-panel-column flex flex-col min-w-0">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon size={16} className="text-purple-400 shrink-0" />
          <h3 className="text-sm font-semibold text-white flex-1">{title}</h3>
          {headerExtra}
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
          {sorted.map((item, i) => <OpportunityCard key={i} item={item} panel={panelName} onExplore={onExplore} saved={savedTopic && item.title === savedTopic} />)}
        </div>
      )}
    </div>
  )
}

// --- Difficulty chip ---
function DifficultyChip({ difficulty }) {
  const cfg = { low: { color: '#86efac', bg: 'rgba(34,197,94,0.1)' }, medium: { color: '#fbbf24', bg: 'rgba(245,158,11,0.1)' }, high: { color: '#f87171', bg: 'rgba(239,68,68,0.1)' } }
  const c = cfg[difficulty] || cfg.medium
  return <span className="vorta-difficulty-chip px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ color: c.color, background: c.bg }}>{difficulty}</span>
}

// --- Skeleton for Idea Card ---
function IdeaSkeleton() {
  return (
    <div className="vorta-idea-skeleton space-y-4 animate-pulse p-5">
      <div className="h-5 rounded w-2/3" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="h-3 rounded w-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
      <div className="h-3 rounded w-full" style={{ background: 'rgba(255,255,255,0.04)' }} />
      <div className="h-3 rounded w-3/4" style={{ background: 'rgba(255,255,255,0.04)' }} />
      <div className="space-y-2 mt-6">{[1,2,3,4,5].map(i => <div key={i} className="h-3 rounded w-5/6" style={{ background: 'rgba(255,255,255,0.04)' }} />)}</div>
    </div>
  )
}

// --- Idea Card Panel (VR-3) ---
function IdeaCardPanel({ item, panelSource, profile, onClose, onSaved, onNavigate }) {
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedAngle, setExpandedAngle] = useState(null)
  const [selectedAngle, setSelectedAngle] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const panelRef = useRef(null)
  const itemRef = useRef(item?.title)

  // Fetch angles on open or when item changes
  useEffect(() => {
    if (!item) return
    if (item.title === itemRef.current && data && !loading) return
    itemRef.current = item.title
    setTab('overview')
    setData(null)
    setLoading(true)
    setError(null)
    setExpandedAngle(null)
    setSelectedAngle(null)
    setSaveSuccess(false)
    setSaveError(null)
    let cancelled = false
    async function fetchAngles() {
      try {
        const resp = await fetch('http://localhost:3001/api/research/angles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ opportunity: item, profile }),
        })
        const json = await resp.json()
        if (!resp.ok) throw new Error(json.error || 'Failed to load angles')
        if (!cancelled) {
          setData(json)
          const rec = json.recommendedAngleId
          if (rec) setExpandedAngle(rec)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchAngles()
    return () => { cancelled = true }
  }, [item?.title])

  // Escape key
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleSave() {
    if (!selectedAngle || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const resp = await fetch('http://localhost:3001/api/research/idea/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunity: item, selectedAngle, profile }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json.error || 'Failed to save idea')
      const enriched = {
        ...json,
        panelSource: panelSource || null,
        topicDepth: data?.topicDepth || {},
        competitorCoverage: data?.competitorCoverage || [],
        competitorInsight: data?.competitorInsight || '',
      }
      saveJson(LS_SELECTED_IDEA, enriched)
      localStorage.removeItem(LS_BRIEF_DISMISSED)
      setSaveSuccess(true)
      if (onSaved) onSaved(enriched)
      setTimeout(() => {
        if (onNavigate) onNavigate('script-writer')
      }, 1500)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function retryFetch() {
    setData(null)
    setLoading(true)
    setError(null)
    setSelectedAngle(null)
    setSaveSuccess(false)
    setSaveError(null)
    async function doFetch() {
      try {
        const resp = await fetch('http://localhost:3001/api/research/angles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ opportunity: item, profile }),
        })
        const json = await resp.json()
        if (!resp.ok) throw new Error(json.error || 'Failed to load angles')
        setData(json)
        const rec = json.recommendedAngleId
        if (rec) setExpandedAngle(rec)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    doFetch()
  }

  if (!item) return null

  const angles = data?.angles || []
  const sortedAngles = [...angles].sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0))
  const td = data?.topicDepth || {}
  const cc = data?.competitorCoverage || []
  const panelLabel = { trending: 'Trending', gaps: 'Gap', competitors: 'Competitor' }[panelSource] || 'Research'

  return (
    <div ref={panelRef} className="vorta-idea-panel fixed inset-y-0 right-0 z-40 w-[520px] flex flex-col" style={{ background: '#141414', borderLeft: '1px solid rgba(255,255,255,0.08)' }} onClick={e => e.stopPropagation()}>
      {/* Header */}
      <div className="vorta-idea-header shrink-0 px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Idea Card</h3>
          <button onClick={onClose} className="vorta-btn vorta-btn-ghost p-1"><X size={16} /></button>
        </div>
        {/* Tabs */}
        <div className="vorta-idea-tabs flex gap-1">
          {[{ id: 'overview', label: 'Overview', icon: BookOpen }, { id: 'angles', label: 'Angles', icon: Target }, { id: 'competitors', label: 'Competitors', icon: Eye }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`vorta-idea-tab flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === t.id ? 'text-purple-300' : 'text-white/40 hover:text-white/60'}`}
              style={tab === t.id ? { background: 'rgba(139,92,246,0.15)' } : {}}>
              <t.icon size={12} />{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="vorta-idea-content flex-1 overflow-y-auto">
        {loading && <IdeaSkeleton />}
        {error && (
          <div className="p-5">
            <div className="vorta-idea-error rounded-lg p-4" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
              <div className="flex items-start gap-2 mb-3"><AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" /><p className="text-xs text-red-300">{error}</p></div>
              <button onClick={retryFetch} className="vorta-btn vorta-btn-ghost text-[11px] flex items-center gap-1.5 text-red-300">
                <RotateCcw size={10} />Retry
              </button>
            </div>
          </div>
        )}
        {!loading && !error && data && (
          <>
            {/* Tab 1 — Overview */}
            {tab === 'overview' && (
              <div className="vorta-idea-overview p-5 space-y-5">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-base font-semibold text-white">{data.topic}</h4>
                    <span className="vorta-panel-chip px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'rgba(139,92,246,0.1)', color: '#c4b5fd' }}>{panelLabel}</span>
                    <ScoreBadge score={item.opportunityScore} />
                  </div>
                  <p className="text-xs text-white/50 leading-relaxed">{item.summary}</p>
                </div>
                {td.summary && (
                  <div className="vorta-topic-summary rounded-lg p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <p className="text-xs text-white/60 leading-relaxed">{td.summary}</p>
                  </div>
                )}
                {td.keyFacts?.length > 0 && (
                  <div>
                    <h5 className="text-[11px] font-medium text-white/50 uppercase tracking-wider mb-2">Key Facts</h5>
                    <ol className="vorta-key-facts space-y-1.5 list-decimal list-inside">
                      {td.keyFacts.map((f, i) => <li key={i} className="text-xs text-white/55 leading-relaxed">{f}</li>)}
                    </ol>
                  </div>
                )}
                {td.timeline?.length > 0 && (
                  <div>
                    <h5 className="text-[11px] font-medium text-white/50 uppercase tracking-wider mb-2">Timeline</h5>
                    <div className="vorta-timeline space-y-2 pl-3" style={{ borderLeft: '2px solid rgba(139,92,246,0.2)' }}>
                      {td.timeline.map((t, i) => <div key={i} className="text-xs text-white/55 leading-relaxed pl-2">{t}</div>)}
                    </div>
                  </div>
                )}
                {td.mainCharacters?.length > 0 && (
                  <div>
                    <h5 className="text-[11px] font-medium text-white/50 uppercase tracking-wider mb-2">Key Players</h5>
                    <div className="flex flex-wrap gap-1.5">
                      {td.mainCharacters.map((c, i) => <span key={i} className="vorta-character-chip px-2 py-0.5 rounded text-[11px] text-white/60" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>{c}</span>)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2 — Angles */}
            {tab === 'angles' && (
              <div className="vorta-idea-angles p-5">
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-white mb-1">Choose your angle</h4>
                  <p className="text-[11px] text-white/35">4 approaches to this topic, ranked by fit with your channel.</p>
                </div>
                <div className="space-y-3">
                  {sortedAngles.map(angle => {
                    const isExpanded = expandedAngle === angle.angleId
                    const isSelected = selectedAngle?.angleId === angle.angleId
                    const isRecommended = data.recommendedAngleId === angle.angleId
                    return (
                      <div key={angle.angleId}
                        className="vorta-angle-card rounded-lg transition-all"
                        style={{
                          background: isSelected ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${isSelected ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                        }}>
                        <button className="w-full text-left p-3" onClick={() => setExpandedAngle(isExpanded ? null : angle.angleId)}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              {isRecommended && <span className="vorta-recommended-badge inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium mb-1.5" style={{ background: 'rgba(139,92,246,0.12)', color: '#c4b5fd' }}><Star size={8} />Best fit for your channel</span>}
                              <h5 className="text-sm font-medium text-white">{angle.title}</h5>
                              <p className="text-xs text-white/45 mt-0.5">{angle.pitch}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <ScoreBadge score={angle.fitScore} />
                              <ChevronDown size={14} className={`text-white/30 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </div>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="vorta-angle-expanded px-3 pb-3 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                            <div className="pt-3">
                              <p className="text-xs text-white/55 leading-relaxed mb-2">{angle.approach}</p>
                              <div className="space-y-2">
                                <div><span className="text-[10px] text-white/30 uppercase">Fit reason:</span><p className="text-xs text-white/50">{angle.fitReason}</p></div>
                                <div><span className="text-[10px] text-white/30 uppercase">Competitor gap:</span><p className="text-xs text-white/50">{angle.competitorGap}</p></div>
                              </div>
                              <div className="flex items-center gap-2 mt-3">
                                <span className="vorta-duration-chip px-1.5 py-0.5 rounded text-[10px] font-medium text-white/50" style={{ background: 'rgba(255,255,255,0.04)' }}>{angle.estimatedDuration}</span>
                                <DifficultyChip difficulty={angle.difficulty} />
                              </div>
                              {angle.hook && (
                                <div className="vorta-hook-block mt-3 rounded-lg p-3" style={{ background: 'rgba(139,92,246,0.05)', borderLeft: '3px solid rgba(139,92,246,0.3)' }}>
                                  <span className="text-[10px] text-purple-300/50 uppercase block mb-1">Opening line</span>
                                  <p className="text-xs text-purple-200/70 italic">"{angle.hook}"</p>
                                </div>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); setSelectedAngle(angle); setSaveError(null) }}
                                className={`vorta-btn mt-3 text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${isSelected ? 'text-green-300' : 'text-purple-300 hover:text-purple-200'}`}
                                style={{ background: isSelected ? 'rgba(34,197,94,0.1)' : 'rgba(139,92,246,0.1)' }}>
                                {isSelected ? <><Check size={12} />Selected</> : <>Use this angle <ArrowRight size={10} /></>}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Tab 3 — Competitors */}
            {tab === 'competitors' && (
              <div className="vorta-idea-competitors p-5">
                <h4 className="text-sm font-semibold text-white mb-1">How competitors covered this</h4>
                <p className="text-[11px] text-white/35 mb-4">What's already out there and where the gaps are.</p>
                {cc.length === 0 ? (
                  <div className="vorta-comp-empty rounded-lg p-6 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <p className="text-xs text-white/30">No direct competitor coverage found — this may be an unclaimed topic.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cc.map((c, i) => (
                      <div key={i} className="vorta-comp-card rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="vorta-comp-channel px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'rgba(139,92,246,0.1)', color: '#c4b5fd' }}>{c.channel}</span>
                        </div>
                        <h5 className="text-xs font-medium text-white mb-1">{c.title}</h5>
                        <p className="text-[11px] text-white/45 mb-1.5">{c.angle}</p>
                        {c.weakness && (
                          <div className="vorta-comp-gap flex items-start gap-1.5 text-[11px]">
                            <span className="text-amber-400 shrink-0">Gap:</span>
                            <span className="text-amber-300/60">{c.weakness}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {data?.competitorInsight && (
                  <div className="vorta-comp-insight mt-4 rounded-lg p-4" style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.1)' }}>
                    <h5 className="text-[11px] font-medium text-purple-300/60 uppercase tracking-wider mb-1.5">What this means for you</h5>
                    <p className="text-xs text-white/55 leading-relaxed">{data.competitorInsight}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="vorta-idea-footer shrink-0 px-5 py-3 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={onClose} className="vorta-btn vorta-btn-ghost text-xs flex items-center gap-1.5 text-white/50">
          <ChevronLeft size={12} />Back
        </button>
        <div className="flex items-center gap-2">
          {saveError && <span className="text-[10px] text-red-400">{saveError}</span>}
          {saveSuccess ? (
            <span className="vorta-btn text-xs flex items-center gap-1.5 px-4 py-1.5 rounded-md font-medium" style={{ background: 'rgba(34,197,94,0.15)', color: '#86efac' }}>
              <Check size={12} />Idea saved ✓
            </span>
          ) : (
            <button onClick={handleSave} disabled={!selectedAngle || saving}
              className="vorta-btn vorta-btn-primary text-xs flex items-center gap-1.5 px-4 py-1.5"
              style={{ opacity: !selectedAngle || saving ? 0.4 : 1 }}>
              {saving ? <><Loader2 size={12} className="animate-spin" />Saving...</> : <>Save Idea <ArrowRight size={10} /></>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// --- History Panel (left slide-in) ---
function HistoryPanel({ onClose, currentReportId, onLoadReport, onClearAll }) {
  const [history, setHistory] = useState(() => (loadJson(LS_HISTORY) || []).slice().reverse())
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  function handleClear() {
    saveJson(LS_HISTORY, [])
    localStorage.removeItem(LS_LAST_REPORT)
    setHistory([])
    setShowClearConfirm(false)
    if (onClearAll) onClearAll()
    onClose()
  }

  return (
    <div className="vorta-history-panel fixed inset-y-0 left-0 z-40 w-[380px] flex flex-col" style={{ background: '#141414', borderRight: '1px solid rgba(255,255,255,0.08)' }} onClick={e => e.stopPropagation()}>
      <div className="vorta-history-header shrink-0 px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <h3 className="text-sm font-semibold text-white">Research History</h3>
          <p className="text-[11px] text-white/30 mt-0.5">{history.length} session{history.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button onClick={() => setShowClearConfirm(true)} className="vorta-btn vorta-btn-ghost text-[11px] text-red-400 flex items-center gap-1"><Trash2 size={10} />Clear All</button>
          )}
          <button onClick={onClose} className="vorta-btn vorta-btn-ghost p-1"><X size={16} /></button>
        </div>
      </div>
      <div className="vorta-history-list flex-1 overflow-y-auto p-4 space-y-3">
        {history.length === 0 && (
          <div className="vorta-history-empty rounded-lg p-6 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <p className="text-xs text-white/30">No research history yet. Run your first research session to see it here.</p>
          </div>
        )}
        {history.map((entry, i) => {
          const isCurrent = entry.reportId === currentReportId
          const ps = entry.profileSnapshot || {}
          const tCount = (entry.trending || []).length
          const gCount = (entry.gaps || []).length
          const cCount = (entry.competitors || []).length
          return (
            <div key={entry.reportId || i} className="vorta-history-card rounded-lg p-3" style={{ background: isCurrent ? 'rgba(139,92,246,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isCurrent ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.06)'}` }}>
              <div className="flex items-start justify-between mb-1.5">
                <span className="text-[11px] text-white/40">{formatDate(entry.generatedAt)}</span>
                {isCurrent ? (
                  <span className="vorta-current-chip px-1.5 py-0.5 rounded text-[9px] font-medium" style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd' }}>Current</span>
                ) : (
                  <button onClick={() => onLoadReport(entry)} className="vorta-btn vorta-btn-ghost text-[10px] flex items-center gap-1 text-purple-300">Load <ArrowRight size={8} /></button>
                )}
              </div>
              {(ps.niche || ps.subFocus) && <p className="text-xs text-white/55 mb-1">{ps.niche}{ps.subFocus ? ` · ${ps.subFocus}` : ''}</p>}
              <div className="text-[10px] text-white/30">{tCount} trending · {gCount} gaps · {cCount} competitor</div>
              <div className="text-[10px] text-white/25 mt-0.5">{tCount + gCount + cCount} total opportunities</div>
            </div>
          )
        })}
      </div>
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowClearConfirm(false)}>
          <div className="rounded-xl p-6 max-w-sm mx-4" style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-2">Clear all research history?</h3>
            <p className="text-xs text-white/50 mb-4">This will permanently delete all {history.length} research session{history.length !== 1 ? 's' : ''}. Your channel profile and saved idea will not be affected.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowClearConfirm(false)} className="vorta-btn vorta-btn-ghost text-xs">Cancel</button>
              <button onClick={handleClear} className="vorta-btn vorta-btn-danger text-xs">Clear All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Edit Profile Modal ---
function EditProfileModal({ profile, onClose, onSave }) {
  const [tab, setTab] = useState('settings')
  const [niche, setNiche] = useState(profile.niche || '')
  const [subFocus, setSubFocus] = useState(profile.subFocus || '')
  const [angle, setAngle] = useState(profile.angle || '')
  const [tone, setTone] = useState(profile.tone || '')
  const [competitors, setCompetitors] = useState(profile.competitors || [])
  const [channelUrl, setChannelUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [angleSuggestions, setAngleSuggestions] = useState([])
  const [toneSuggestions, setToneSuggestions] = useState([])
  const [selectedAngleChip, setSelectedAngleChip] = useState(null)
  const [selectedToneChip, setSelectedToneChip] = useState(null)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false)
  const suggestNicheRef = useRef('')
  const suggestSubFocusRef = useRef('')

  const freshValid = niche.trim() && subFocus.trim() && angle.trim() && tone.trim()
  const canSuggest = niche.trim() && subFocus.trim() && !suggestionsLoading && !loading

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    if (!suggestionsLoaded) return
    if (niche.trim() !== suggestNicheRef.current || subFocus.trim() !== suggestSubFocusRef.current) {
      setAngleSuggestions([]); setToneSuggestions([]); setSelectedAngleChip(null); setSelectedToneChip(null); setSuggestionsLoaded(false)
    }
  }, [niche, subFocus, suggestionsLoaded])

  const handleSuggest = useCallback(async () => {
    setSuggestionsLoading(true); setError('')
    try {
      const resp = await fetch('http://localhost:3001/api/research/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ niche: niche.trim(), subFocus: subFocus.trim() }) })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to get suggestions')
      setAngleSuggestions(data.angles || []); setToneSuggestions(data.tones || [])
      setSelectedAngleChip(null); setSelectedToneChip(null); setSuggestionsLoaded(true)
      suggestNicheRef.current = niche.trim(); suggestSubFocusRef.current = subFocus.trim()
    } catch (err) { setError(err.message) } finally { setSuggestionsLoading(false) }
  }, [niche, subFocus])

  async function handleSave() {
    if (!freshValid || loading) return
    setLoading(true); setError('')
    try {
      const endpoint = tab === 'source' && channelUrl.trim()
        ? '/api/research/profile/existing'
        : '/api/research/profile/fresh'
      const body = tab === 'source' && channelUrl.trim()
        ? { channelUrl, competitors }
        : { niche, subFocus, angle, tone, competitors }
      const resp = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to save profile')
      saveProfile(data)
      localStorage.removeItem(LS_LAST_REPORT)
      onSave(data)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="vorta-edit-modal rounded-xl w-[600px] max-h-[85vh] flex flex-col mx-4" style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
        <div className="vorta-edit-header shrink-0 px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-sm font-semibold text-white">Edit Profile</h3>
          <button onClick={onClose} className="vorta-btn vorta-btn-ghost p-1"><X size={16} /></button>
        </div>
        {/* Tabs */}
        <div className="vorta-edit-tabs flex px-6 pt-3 gap-1">
          <button onClick={() => setTab('settings')} className={`vorta-edit-tab px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'settings' ? 'text-purple-300' : 'text-white/40 hover:text-white/60'}`} style={tab === 'settings' ? { background: 'rgba(139,92,246,0.15)' } : {}}>Channel Settings</button>
          <button onClick={() => setTab('source')} className={`vorta-edit-tab px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'source' ? 'text-purple-300' : 'text-white/40 hover:text-white/60'}`} style={tab === 'source' ? { background: 'rgba(139,92,246,0.15)' } : {}}>Channel Source</button>
        </div>
        <div className="vorta-edit-body flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {tab === 'settings' && (
            <>
              <div className="vorta-field"><label className="vorta-label">Niche</label><input className="vorta-input" value={niche} onChange={e => setNiche(e.target.value)} disabled={loading} /></div>
              <div className="vorta-field"><label className="vorta-label">Sub-focus</label><input className="vorta-input" value={subFocus} onChange={e => setSubFocus(e.target.value)} disabled={loading} /></div>
              {canSuggest && !suggestionsLoaded && (
                <button type="button" onClick={handleSuggest} className="vorta-btn vorta-btn-ghost text-xs flex items-center gap-1.5" style={{ color: '#c4b5fd' }}><Sparkles size={12} />Suggest →</button>
              )}
              {suggestionsLoading && <div className="flex items-center gap-2 text-xs text-purple-300/70"><Loader2 size={12} className="animate-spin" />Generating suggestions...</div>}
              <SmartField label="Angle" value={angle} onChange={setAngle} suggestions={angleSuggestions} selectedChip={selectedAngleChip} onChipSelect={setSelectedAngleChip} placeholder="" disabled={loading} />
              <SmartField label="Tone" value={tone} onChange={setTone} suggestions={toneSuggestions} selectedChip={selectedToneChip} onChipSelect={setSelectedToneChip} placeholder="" disabled={loading} />
              <div className="vorta-field"><label className="vorta-label">Competitors (max 5)</label><TagInput tags={competitors} onChange={setCompetitors} placeholder="@handle — press Enter to add" disabled={loading} /></div>
            </>
          )}
          {tab === 'source' && (
            <div className="space-y-4">
              <div className="vorta-field">
                <label className="vorta-label">Current source</label>
                <p className="text-xs text-white/50">{profile.path === 'existing' ? 'Analysed from YouTube' : 'Fresh channel (manual)'}</p>
              </div>
              <div className="vorta-field">
                <label className="vorta-label">{profile.path === 'existing' ? 'Re-analyse or switch to fresh' : 'Switch to existing channel'}</label>
                <input className="vorta-input" value={channelUrl} onChange={e => setChannelUrl(e.target.value)} placeholder="https://www.youtube.com/@handle" disabled={loading} />
                <p className="text-[10px] text-white/25 mt-1">Enter a YouTube URL to re-analyse, or leave blank to save with current settings.</p>
              </div>
            </div>
          )}
        </div>
        <div className="vorta-edit-footer shrink-0 px-6 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[10px] text-amber-400/60 mb-2">Saving will clear your last research report. History is preserved.</p>
          {error && <p className="text-[10px] text-red-400 mb-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="vorta-btn vorta-btn-ghost text-xs">Cancel</button>
            <button onClick={handleSave} disabled={!freshValid || loading} className="vorta-btn vorta-btn-primary text-xs" style={{ opacity: !freshValid || loading ? 0.4 : 1 }}>
              {loading ? <><Loader2 size={12} className="animate-spin mr-1.5" />Saving...</> : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Research Dashboard (State C) ---
function ResearchDashboard({ profile, onBack, onNavigate, onEditProfile }) {
  const [report, setReport] = useState(() => loadLastReport())
  const [panelData, setPanelData] = useState(() => {
    const r = loadLastReport()
    if (r) return { trending: r.trending || [], gaps: r.gaps || [], competitors: r.competitors || [] }
    return { trending: null, gaps: null, competitors: null }
  })
  const [panelLoading, setPanelLoading] = useState({ trending: false, gaps: false, competitors: false })
  const [panelErrors, setPanelErrors] = useState({ trending: null, gaps: null, competitors: null })
  const [streaming, setStreaming] = useState(false)
  const [exploreItem, setExploreItem] = useState(null)
  const [explorePanel, setExplorePanel] = useState(null)
  const [genTime, setGenTime] = useState(report?.generatedAt || null)
  const [timeAgoStr, setTimeAgoStr] = useState('')
  const [savedIdea, setSavedIdea] = useState(() => loadJson(LS_SELECTED_IDEA))
  const [bannerDismissed, setBannerDismissed] = useState(() => loadJson(LS_BANNER_DISMISSED) || false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [reportDataSources, setReportDataSources] = useState(null)
  const [dsPopoverOpen, setDsPopoverOpen] = useState(false)
  const [deepDiveOpen, setDeepDiveOpen] = useState(false)
  const [compFilterDate, setCompFilterDate] = useState('all')
  const [compFilterMinViews, setCompFilterMinViews] = useState('')
  const [compFilterSort, setCompFilterSort] = useState('views')
  const [compFilteredItems, setCompFilteredItems] = useState(null)
  const [compFilterLoading, setCompFilterLoading] = useState(false)

  async function applyCompetitorFilters() {
    if (!profile?.competitors?.length) return
    setCompFilterLoading(true)
    try {
      const filters = { dateRange: compFilterDate, sortBy: compFilterSort }
      if (compFilterMinViews) filters.minViews = parseInt(compFilterMinViews)
      const resp = await fetch('http://localhost:3001/api/research/competitors/filtered', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, filters }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error)
      const mapped = (data.videos || []).slice(0, 10).map(v => ({
        title: v.title,
        channel: v.channelName,
        summary: `${v.viewCount?.toLocaleString()} views`,
        opportunityScore: v.viewsPerSubscriber !== null ? Math.min(10, Math.round(v.viewsPerSubscriber * 2)) : 5,
        subscriberCount: v.channelSubscriberCount,
        realViews: v.viewCount,
        suggestedAngle: null,
      }))
      setCompFilteredItems(mapped)
    } catch {} finally { setCompFilterLoading(false) }
  }

  function resetCompFilters() {
    setCompFilterDate('all'); setCompFilterMinViews(''); setCompFilterSort('views'); setCompFilteredItems(null)
  }

  function handleExplore(item, panelName) { setHistoryOpen(false); setExploreItem(item); setExplorePanel(panelName) }
  function handleOpenHistory() { setExploreItem(null); setHistoryOpen(true) }
  function handleIdeaSaved(idea) { setSavedIdea(idea); setBannerDismissed(false); saveJson(LS_BANNER_DISMISSED, false) }
  function dismissBanner() { setBannerDismissed(true); saveJson(LS_BANNER_DISMISSED, true) }
  function handleLoadReport(entry) {
    saveJson(LS_LAST_REPORT, entry)
    setReport(entry)
    setPanelData({ trending: entry.trending || [], gaps: entry.gaps || [], competitors: entry.competitors || [] })
    setGenTime(entry.generatedAt)
    setHistoryOpen(false)
  }
  function handleClearAll() { onBack() }
  const savedTopic = savedIdea?.topic || null

  // Update relative time every 30s
  useEffect(() => {
    if (!genTime) return
    const update = () => setTimeAgoStr(timeAgo(genTime))
    update()
    const iv = setInterval(update, 30000)
    return () => clearInterval(iv)
  }, [genTime])

  const runDiscovery = useCallback(async () => {
    setStreaming(true)
    setPanelData({ trending: null, gaps: null, competitors: null })
    setPanelLoading({ trending: true, gaps: true, competitors: true })
    setPanelErrors({ trending: null, gaps: null, competitors: null })

    try {
      // Connect directly to Express — Vite's http-proxy buffers text/event-stream
      const resp = await fetch('http://localhost:3001/api/research/discover/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      })

      if (!resp.ok) {
        let msg = `Server error ${resp.status}`
        try { const body = await resp.json(); msg = body.error || msg } catch {}
        throw new Error(msg)
      }

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
              finalReport.dataSources = evt.dataSources || null
              setGenTime(evt.generatedAt)
              setReportDataSources(evt.dataSources || null)
            }
          } catch {}
        }
      }

      const fullReport = { ...finalReport, profileId: profile.profileId }
      setReport(fullReport)
      appendHistory(fullReport, profile)
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
      const resp = await fetch(`http://localhost:3001/api/research/discover?panel=${panelName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to retry')
      const items = data[panelName] || []
      setPanelData(prev => ({ ...prev, [panelName]: items }))
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
      {/* Saved idea banner */}
      {savedIdea && !bannerDismissed && (
        <div className="vorta-saved-banner flex items-center justify-between px-6 py-2.5 shrink-0" style={{ background: 'rgba(34,197,94,0.06)', borderBottom: '1px solid rgba(34,197,94,0.12)' }}>
          <div className="flex items-center gap-2 text-xs text-green-300/80">
            <Check size={12} />
            <span>You have a saved idea — <strong>{savedIdea.topic}</strong>. Ready to write the script?</span>
            <button onClick={() => onNavigate && onNavigate('script-writer')} className="vorta-btn vorta-btn-ghost text-xs text-green-300 flex items-center gap-1 ml-1">
              Go to Script Writer <ArrowRight size={10} />
            </button>
          </div>
          <button onClick={dismissBanner} className="vorta-btn vorta-btn-ghost p-0.5 text-white/30 hover:text-white/60"><X size={14} /></button>
        </div>
      )}

      {/* Top bar */}
      <div className="vorta-dashboard-topbar flex items-center justify-between px-6 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="vorta-btn vorta-btn-ghost text-xs flex items-center gap-1.5 text-white/50 hover:text-white/80">
            <ChevronLeft size={14} />Back to Profile
          </button>
          <button onClick={onEditProfile} className="vorta-profile-pill px-3 py-1 rounded-full text-[11px] text-white/40 hover:text-white/60 transition-colors cursor-pointer flex items-center gap-1.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {profile.channelName || profile.niche} · {profile.subFocus}
            <Edit3 size={9} />
          </button>
        </div>
        <div className="flex items-center gap-4">
          {timeAgoStr && (
            <span className="vorta-timestamp flex items-center gap-1.5 text-[11px] text-white/25">
              <Clock size={10} />Research generated {timeAgoStr}
            </span>
          )}
          {reportDataSources && (
            <div className="vorta-ds-popover-wrap relative">
              <button onClick={() => setDsPopoverOpen(!dsPopoverOpen)} className="vorta-btn vorta-btn-ghost text-[10px] text-white/30 hover:text-white/50 flex items-center gap-1">
                <BarChart3 size={10} />Data sources
              </button>
              {dsPopoverOpen && (
                <>
                <div className="fixed inset-0 z-40" onClick={() => setDsPopoverOpen(false)} />
                <div className="vorta-ds-popover absolute right-0 top-full mt-1 w-72 rounded-lg p-3 z-50" style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <h4 className="text-[10px] font-medium text-white/50 uppercase tracking-wider mb-2">Data sources for this report</h4>
                  <div className="space-y-1.5 text-[11px]">
                    {reportDataSources.trending?.trends && <div className="flex items-center gap-2"><span className="text-green-400">✓</span><span className="text-white/50">Trending: {reportDataSources.trending.trends === 'serpapi' ? 'Google Trends (SerpApi)' : reportDataSources.trending.trends === 'google-trends-api' ? 'Google Trends API' : reportDataSources.trending.trends}</span></div>}
                    {reportDataSources.gaps?.competition && <div className="flex items-center gap-2"><span className="text-green-400">✓</span><span className="text-white/50">Gaps: {reportDataSources.gaps.competition}</span></div>}
                    {reportDataSources.competitors?.competitors && <div className="flex items-center gap-2"><span className="text-green-400">✓</span><span className="text-white/50">Competitors: {reportDataSources.competitors.competitors}</span></div>}
                    {(reportDataSources.trendFallbacks || []).length > 0 && <div className="flex items-center gap-2"><span className="text-amber-400">~</span><span className="text-white/40">{reportDataSources.trendFallbacks.length} topic{reportDataSources.trendFallbacks.length !== 1 ? 's' : ''}: AI estimated</span></div>}
                  </div>
                </div>
                </>
              )}
            </div>
          )}
          <button onClick={handleOpenHistory} className="vorta-btn vorta-btn-ghost text-xs flex items-center gap-1.5 text-white/40 hover:text-white/60">
            <History size={12} />History
          </button>
          <button onClick={runDiscovery} disabled={streaming} className="vorta-btn vorta-btn-primary text-xs flex items-center gap-1.5" style={{ opacity: streaming ? 0.5 : 1 }}>
            {streaming ? <><Loader2 size={12} className="animate-spin" />Researching...</> : <><RefreshCw size={12} />New Research</>}
          </button>
        </div>
      </div>

      {/* Three-column grid */}
      <div className="vorta-dashboard-grid flex-1 grid grid-cols-3 gap-6 p-6 overflow-y-auto">
        <PanelColumn title="Trending Now" subtitle="Topics gaining momentum in your niche right now" icon={Flame}
          items={panelData.trending} loading={panelLoading.trending} error={panelErrors.trending}
          panelName="trending" onRetry={() => retryPanel('trending')} onExplore={(item) => handleExplore(item, 'trending')} savedTopic={savedTopic} />
        <PanelColumn title="Gap Finder" subtitle="High-demand topics with weak or outdated YouTube coverage" icon={Compass}
          items={panelData.gaps} loading={panelLoading.gaps} error={panelErrors.gaps}
          panelName="gaps" onRetry={() => retryPanel('gaps')} onExplore={(item) => handleExplore(item, 'gaps')} savedTopic={savedTopic} />
        <PanelColumn title="Competitor Watch" subtitle="Overperforming videos from competitor channels" icon={Eye}
          items={compFilteredItems || panelData.competitors} loading={compFilterLoading || panelLoading.competitors} error={panelErrors.competitors}
          panelName="competitors" onRetry={() => retryPanel('competitors')} onExplore={(item) => handleExplore(item, 'competitors')} savedTopic={savedTopic}
          headerExtra={
            <button onClick={() => setDeepDiveOpen(true)} className="vorta-btn vorta-btn-ghost text-[9px] flex items-center gap-1 shrink-0" style={{ color: '#c4b5fd' }}>
              <Filter size={9} />Deep dive
            </button>
          }
        />
      </div>

      {/* Idea Card slide-in (right) */}
      {exploreItem && (
        <>
          <div className="fixed inset-0 z-30" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setExploreItem(null)} />
          <IdeaCardPanel item={exploreItem} panelSource={explorePanel} profile={profile} onClose={() => setExploreItem(null)} onSaved={handleIdeaSaved} onNavigate={onNavigate} />
        </>
      )}

      {/* History slide-in (left) */}
      {historyOpen && (
        <>
          <div className="fixed inset-0 z-30" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setHistoryOpen(false)} />
          <HistoryPanel onClose={() => setHistoryOpen(false)} currentReportId={report?.reportId} onLoadReport={handleLoadReport} onClearAll={handleClearAll} />
        </>
      )}

      {/* Deep competitor panel (right slide-in) */}
      {deepDiveOpen && (
        <>
          <div className="fixed inset-0 z-30" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setDeepDiveOpen(false)} />
          <DeepCompetitorPanel profile={profile} onClose={() => setDeepDiveOpen(false)} />
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
export default function VideoResearch({ onNavigate }) {
  const [profile, setProfile] = useState(() => loadProfile())
  const [view, setView] = useState('profile')
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [historyOpenB, setHistoryOpenB] = useState(false)

  function handleProfileSaved(newProfile) {
    setProfile(newProfile)
    setEditModalOpen(false)
    setView('profile')
  }

  if (!profile) {
    return <div className="p-8"><SetupForm onProfileCreated={p => setProfile(p)} /></div>
  }

  if (view === 'dashboard') {
    return (
      <>
        <ResearchDashboard profile={profile} onBack={() => setView('profile')} onNavigate={onNavigate} onEditProfile={() => setEditModalOpen(true)} />
        {editModalOpen && <EditProfileModal profile={profile} onClose={() => setEditModalOpen(false)} onSave={handleProfileSaved} />}
      </>
    )
  }

  return (
    <div className="p-8">
      <ProfileSummary
        profile={profile}
        onEdit={() => setProfile(null)}
        onStartResearch={() => setView('dashboard')}
        onOpenHistory={() => setHistoryOpenB(true)}
        onEditProfile={() => setEditModalOpen(true)}
      />
      {historyOpenB && (
        <>
          <div className="fixed inset-0 z-30" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setHistoryOpenB(false)} />
          <HistoryPanel onClose={() => setHistoryOpenB(false)} currentReportId={null} onLoadReport={(entry) => {
            saveJson(LS_LAST_REPORT, entry)
            setHistoryOpenB(false)
            setView('dashboard')
          }} onClearAll={() => setHistoryOpenB(false)} />
        </>
      )}
      {editModalOpen && <EditProfileModal profile={profile} onClose={() => setEditModalOpen(false)} onSave={handleProfileSaved} />}
    </div>
  )
}
