import { useState, useMemo } from 'react'
import { Search, ChevronDown, ChevronUp, X, AlertTriangle, Check, ArrowRight, BookOpen, Target, Eye, Star } from 'lucide-react'

const LS_SELECTED_IDEA = 'vr_selected_idea'
const LS_PROFILE = 'vr_channel_profile'
const LS_BRIEF_DISMISSED = 'vr_brief_dismissed_in_scriptwriter'

function loadJson(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null } catch { return null }
}

function formatSavedDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function ScoreBadge({ score }) {
  const s = parseInt(score, 10) || 0
  const color = s >= 8 ? '#22c55e' : s >= 5 ? '#f59e0b' : '#ef4444'
  const bg = s >= 8 ? 'rgba(34,197,94,0.12)' : s >= 5 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)'
  return (
    <span className="vorta-score-badge inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: bg, color, border: `1px solid ${color}33` }}>
      {s}/10
    </span>
  )
}

function ResearchBrief({ idea, profile, onNavigate, onDismiss }) {
  const [topicOpen, setTopicOpen] = useState(false)
  const [compOpen, setCompOpen] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const angle = idea.selectedAngle || {}
  const td = idea.topicDepth || angle.topicDepth || {}
  const cc = idea.competitorCoverage || angle.competitorCoverage || []
  const ci = idea.competitorInsight || angle.competitorInsight || ''

  const isStale = profile && idea.profileId && profile.profileId !== idea.profileId

  function handleClear() {
    try { localStorage.setItem(LS_BRIEF_DISMISSED, 'true') } catch {}
    setShowClearConfirm(false)
    if (onDismiss) onDismiss()
  }

  return (
    <div className="vorta-research-brief rounded-xl mb-8" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: '3px solid rgba(139,92,246,0.5)' }}>
      {/* Stale warning */}
      {isStale && (
        <div className="vorta-brief-stale flex items-center gap-2 px-5 py-2 text-xs" style={{ background: 'rgba(245,158,11,0.06)', borderBottom: '1px solid rgba(245,158,11,0.1)', color: '#fbbf24' }}>
          <AlertTriangle size={12} />
          This idea was researched under a different channel profile. Some context may not apply to your current channel.
        </div>
      )}

      {/* Header */}
      <div className="vorta-brief-header px-5 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">Research Brief</h3>
          <span className="vorta-brief-chip px-1.5 py-0.5 rounded text-[9px] font-medium" style={{ background: 'rgba(139,92,246,0.1)', color: '#c4b5fd' }}>From Video Research</span>
        </div>
      </div>

      {/* Row 1 — Topic */}
      <div className="vorta-brief-topic px-5 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-base font-semibold text-white">{idea.topic || 'Untitled topic'}</h4>
          <ScoreBadge score={idea.opportunityScore} />
        </div>
      </div>

      {/* Row 2 — Selected angle */}
      <div className="vorta-brief-angle px-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-1.5 mb-2">
          <Target size={11} className="text-purple-400" />
          <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Your angle</span>
        </div>
        <h5 className="text-sm font-medium text-white mb-1">{angle.title || 'No angle selected'}</h5>
        {angle.pitch && <p className="text-xs text-white/45 mb-2">{angle.pitch}</p>}
        {angle.approach && <p className="text-xs text-white/55 leading-relaxed mb-3">{angle.approach}</p>}
        {angle.hook && (
          <div className="vorta-brief-hook rounded-lg p-3" style={{ background: 'rgba(139,92,246,0.05)', borderLeft: '3px solid rgba(139,92,246,0.3)' }}>
            <span className="text-[10px] text-purple-300/50 uppercase block mb-1">Suggested opening</span>
            <p className="text-xs text-purple-200/70 italic">"{angle.hook}"</p>
          </div>
        )}
      </div>

      {/* Row 3 — Topic depth (collapsible) */}
      {(td.summary || td.keyFacts?.length > 0 || td.timeline?.length > 0 || td.mainCharacters?.length > 0) && (
        <div className="vorta-brief-depth" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <button onClick={() => setTopicOpen(!topicOpen)} className="w-full px-5 py-2.5 flex items-center justify-between text-xs text-white/40 hover:text-white/60 transition-colors">
            <span>{topicOpen ? 'Hide topic research' : 'Show topic research'}</span>
            {topicOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {topicOpen && (
            <div className="px-5 pb-4 space-y-4">
              {td.summary && <p className="text-xs text-white/55 leading-relaxed">{td.summary}</p>}
              {td.keyFacts?.length > 0 && (
                <div>
                  <h6 className="text-[10px] font-medium text-white/40 uppercase tracking-wider mb-1.5">Key Facts</h6>
                  <ol className="vorta-brief-facts space-y-1 list-decimal list-inside">
                    {td.keyFacts.map((f, i) => <li key={i} className="text-xs text-white/50">{f}</li>)}
                  </ol>
                </div>
              )}
              {td.timeline?.length > 0 && (
                <div>
                  <h6 className="text-[10px] font-medium text-white/40 uppercase tracking-wider mb-1.5">Timeline</h6>
                  <div className="vorta-brief-timeline space-y-1.5 pl-3" style={{ borderLeft: '2px solid rgba(139,92,246,0.2)' }}>
                    {td.timeline.map((t, i) => <div key={i} className="text-xs text-white/50 pl-2">{t}</div>)}
                  </div>
                </div>
              )}
              {td.mainCharacters?.length > 0 && (
                <div>
                  <h6 className="text-[10px] font-medium text-white/40 uppercase tracking-wider mb-1.5">Key Players</h6>
                  <div className="flex flex-wrap gap-1.5">
                    {td.mainCharacters.map((c, i) => <span key={i} className="vorta-brief-character px-2 py-0.5 rounded text-[11px] text-white/55" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>{c}</span>)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Row 4 — Competitor context (collapsible) */}
      {(cc.length > 0 || ci) && (
        <div className="vorta-brief-comp" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <button onClick={() => setCompOpen(!compOpen)} className="w-full px-5 py-2.5 flex items-center justify-between text-xs text-white/40 hover:text-white/60 transition-colors">
            <span>{compOpen ? 'Hide competitor coverage' : 'Show competitor coverage'}</span>
            {compOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {compOpen && (
            <div className="px-5 pb-4 space-y-3">
              {cc.map((c, i) => (
                <div key={i} className="vorta-brief-comp-card rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'rgba(139,92,246,0.1)', color: '#c4b5fd' }}>{c.channel || 'Unknown'}</span>
                  </div>
                  <p className="text-xs text-white/55">{c.title || ''}</p>
                  {c.weakness && <p className="text-[11px] text-amber-300/50 mt-1">Gap: {c.weakness}</p>}
                </div>
              ))}
              {ci && (
                <div className="vorta-brief-insight rounded-lg p-3" style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.08)' }}>
                  <h6 className="text-[10px] font-medium text-purple-300/50 uppercase tracking-wider mb-1">What this means for you</h6>
                  <p className="text-xs text-white/50 leading-relaxed">{ci}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Row 5 — Footer */}
      <div className="vorta-brief-footer px-5 py-3 flex items-center justify-between">
        <span className="text-[10px] text-white/25">{profile?.channelName || 'Unknown channel'}{profile?.niche && profile.niche !== profile.channelName ? ` · ${profile.niche}` : ''}</span>
        <span className="text-[10px] text-white/20">Idea saved {formatSavedDate(idea.savedAt)}</span>
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('video-research')} className="vorta-btn vorta-btn-ghost text-[11px] text-white/40 hover:text-white/60">Change idea</button>
          <button onClick={() => setShowClearConfirm(true)} className="vorta-btn vorta-btn-ghost text-[11px] text-white/40 hover:text-white/60">Clear brief</button>
        </div>
      </div>

      {/* Clear confirm modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowClearConfirm(false)}>
          <div className="rounded-xl p-6 max-w-sm mx-4" style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-2">Remove research brief?</h3>
            <p className="text-xs text-white/50 mb-4">This will remove the research brief from Script Writer. The idea remains saved in Video Research.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowClearConfirm(false)} className="vorta-btn vorta-btn-ghost text-xs">Cancel</button>
              <button onClick={handleClear} className="vorta-btn vorta-btn-danger text-xs">Clear Brief</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ScriptWriter({ onNavigate }) {
  const idea = useMemo(() => loadJson(LS_SELECTED_IDEA), [])
  const profile = useMemo(() => loadJson(LS_PROFILE), [])
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(LS_BRIEF_DISMISSED) === 'true' } catch { return false }
  })

  const showBrief = idea && !dismissed

  return (
    <div className="p-8">
      {showBrief ? (
        <ResearchBrief idea={idea} profile={profile} onNavigate={onNavigate} onDismiss={() => setDismissed(true)} />
      ) : (
        <div className="vorta-brief-link mb-8">
          {onNavigate && (
            <button onClick={() => onNavigate('video-research')} className="vorta-btn vorta-btn-ghost text-xs flex items-center gap-1.5 text-purple-300/60 hover:text-purple-300">
              <Search size={12} />Have a video idea? Research it in Video Research <ArrowRight size={10} />
            </button>
          )}
        </div>
      )}

      {/* Existing placeholder */}
      <h1 className="text-2xl font-semibold text-white/20">Script Writer</h1>
      <p className="text-white/20 mt-1 text-sm">Coming soon.</p>
    </div>
  )
}
