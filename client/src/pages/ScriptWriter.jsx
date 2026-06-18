import { useState, useMemo, useCallback } from 'react'
import { Search, ArrowRight, AlertTriangle, ChevronDown, ChevronUp, X, Target, Mic, Sparkles, History } from 'lucide-react'
import StyleSelector from '../components/script-writer/StyleSelector'
import VoiceProfileManager from '../components/script-writer/VoiceProfileManager'
import GenerationProgress from '../components/script-writer/GenerationProgress'
import ScriptOutput from '../components/script-writer/ScriptOutput'
import ScriptHistory from '../components/script-writer/ScriptHistory'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'
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
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: bg, color, border: `1px solid ${color}33` }}>
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
    <div className="rounded-xl mb-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: '3px solid rgba(139,92,246,0.5)' }}>
      {isStale && (
        <div className="flex items-center gap-2 px-5 py-2 text-xs" style={{ background: 'rgba(245,158,11,0.06)', borderBottom: '1px solid rgba(245,158,11,0.1)', color: '#fbbf24' }}>
          <AlertTriangle size={12} />
          This idea was researched under a different channel profile.
        </div>
      )}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">Research Brief</h3>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium" style={{ background: 'rgba(139,92,246,0.1)', color: '#c4b5fd' }}>From Video Research</span>
        </div>
      </div>
      <div className="px-5 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-base font-semibold text-white">{idea.topic || 'Untitled topic'}</h4>
          <ScoreBadge score={idea.opportunityScore} />
        </div>
      </div>
      {angle.title && (
        <div className="px-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Target size={11} className="text-purple-400" />
            <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Your angle</span>
          </div>
          <h5 className="text-sm font-medium text-white mb-1">{angle.title}</h5>
          {angle.pitch && <p className="text-xs text-white/45 mb-2">{angle.pitch}</p>}
          {angle.hook && (
            <div className="rounded-lg p-3" style={{ background: 'rgba(139,92,246,0.05)', borderLeft: '3px solid rgba(139,92,246,0.3)' }}>
              <span className="text-[10px] text-purple-300/50 uppercase block mb-1">Suggested opening</span>
              <p className="text-xs text-purple-200/70 italic">"{angle.hook}"</p>
            </div>
          )}
        </div>
      )}
      {(td.summary || td.keyFacts?.length > 0) && (
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <button onClick={() => setTopicOpen(!topicOpen)} className="w-full px-5 py-2.5 flex items-center justify-between text-xs text-white/40 hover:text-white/60 transition-colors">
            <span>{topicOpen ? 'Hide topic research' : 'Show topic research'}</span>
            {topicOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {topicOpen && (
            <div className="px-5 pb-4 space-y-3">
              {td.summary && <p className="text-xs text-white/55 leading-relaxed">{td.summary}</p>}
              {td.keyFacts?.map((f, i) => <p key={i} className="text-xs text-white/50">• {f}</p>)}
            </div>
          )}
        </div>
      )}
      {(cc.length > 0 || ci) && (
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <button onClick={() => setCompOpen(!compOpen)} className="w-full px-5 py-2.5 flex items-center justify-between text-xs text-white/40 hover:text-white/60 transition-colors">
            <span>{compOpen ? 'Hide competitor coverage' : 'Show competitor coverage'}</span>
            {compOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {compOpen && (
            <div className="px-5 pb-4 space-y-3">
              {cc.map((c, i) => (
                <div key={i} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'rgba(139,92,246,0.1)', color: '#c4b5fd' }}>{c.channel || 'Unknown'}</span>
                  <p className="text-xs text-white/55 mt-1">{c.title || ''}</p>
                  {c.weakness && <p className="text-[11px] text-amber-300/50 mt-1">Gap: {c.weakness}</p>}
                </div>
              ))}
              {ci && <p className="text-xs text-white/50 leading-relaxed">{ci}</p>}
            </div>
          )}
        </div>
      )}
      <div className="px-5 py-3 flex items-center justify-between">
        <span className="text-[10px] text-white/25">{profile?.channelName || 'Unknown channel'}</span>
        <span className="text-[10px] text-white/20">Saved {formatSavedDate(idea.savedAt)}</span>
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('video-research')} className="vorta-btn vorta-btn-ghost text-[11px] text-white/40 hover:text-white/60">Change idea</button>
          <button onClick={() => setShowClearConfirm(true)} className="vorta-btn vorta-btn-ghost text-[11px] text-white/40 hover:text-white/60">Clear brief</button>
        </div>
      </div>
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowClearConfirm(false)}>
          <div className="rounded-xl p-6 max-w-sm mx-4" style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white mb-2">Remove research brief?</h3>
            <p className="text-xs text-white/50 mb-4">The idea remains saved in Video Research.</p>
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

function parseSSEStream(text) {
  return text.split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => {
      try { return JSON.parse(line.replace(/^data:\s*/, '')) }
      catch { return null }
    })
    .filter(Boolean)
}

export default function ScriptWriter({ onNavigate }) {
  const idea = useMemo(() => loadJson(LS_SELECTED_IDEA), [])
  const profile = useMemo(() => loadJson(LS_PROFILE), [])
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(LS_BRIEF_DISMISSED) === 'true' } catch { return false }
  })

  const [topic, setTopic] = useState(() => idea?.topic || '')
  const [styleTemplate, setStyleTemplate] = useState('documentary_explainer')
  const [targetLength, setTargetLength] = useState(12)
  const [voiceProfileId, setVoiceProfileId] = useState(null)
  const [phase, setPhase] = useState('idle')
  const [researchBrief, setResearchBrief] = useState('')
  const [angles, setAngles] = useState([])
  const [chosenAngle, setChosenAngle] = useState(null)
  const [passLog, setPassLog] = useState([])
  const [finalScript, setFinalScript] = useState('')
  const [scanResult, setScanResult] = useState(null)
  const [historyId, setHistoryId] = useState(null)
  const [userRating, setUserRating] = useState(null)
  const [showVoiceManager, setShowVoiceManager] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [error, setError] = useState('')

  const showBrief = idea && !dismissed

  const addPassLog = useCallback((entry) => {
    setPassLog(prev => {
      const existing = prev.findIndex(e => e.pass === entry.pass)
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = entry
        return updated
      }
      return [...prev, entry]
    })
  }, [])

  async function readSSE(response, onEvent) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data:')) {
          try {
            const data = JSON.parse(line.replace(/^data:\s*/, ''))
            onEvent(data)
          } catch {}
        }
      }
    }
    if (buffer.startsWith('data:')) {
      try {
        const data = JSON.parse(buffer.replace(/^data:\s*/, ''))
        onEvent(data)
      } catch {}
    }
  }

  async function handleGenerate() {
    if (!topic.trim()) return
    setPhase('researching')
    setPassLog([])
    setAngles([])
    setChosenAngle(null)
    setFinalScript('')
    setResearchBrief('')
    setError('')

    try {
      const res = await fetch(`${API}/api/script-writer/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), styleTemplate, targetLength })
      })

      if (!res.ok) throw new Error('Generation failed')

      await readSSE(res, (event) => {
        if (event.pass === 'error') {
          setError(event.error)
          setPhase('idle')
          return
        }
        if (event.pass === 'research' && event.status === 'complete') {
          setResearchBrief(event.data)
        }
        if (event.pass === 'waiting_for_angle') {
          setAngles(event.data)
          setPhase('choosing_angle')
          return
        }
        addPassLog(event)
      })
    } catch (err) {
      setError(err.message)
      setPhase('idle')
    }
  }

  async function handleChooseAngle(angle) {
    setChosenAngle(angle)
    setPhase('generating')

    try {
      const res = await fetch(`${API}/api/script-writer/generate-from-angle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          styleTemplate,
          targetLength,
          voiceProfileId,
          chosenAngle: angle,
          researchBrief
        })
      })

      if (!res.ok) throw new Error('Generation failed')

      await readSSE(res, (event) => {
        if (event.pass === 'error') {
          setError(event.error)
          setPhase('idle')
          return
        }
        if (event.pass === 'complete') {
          setFinalScript(event.script)
          setScanResult(event.scanResult || null)
          setHistoryId(event.historyId || null)
          setUserRating(null)
          setPhase('complete')
          return
        }
        addPassLog(event)
      })
    } catch (err) {
      setError(err.message)
      setPhase('idle')
    }
  }

  function handleSendToCreator() {
    localStorage.setItem('vorta_script_text', finalScript)
    if (historyId) {
      fetch(`${API}/api/script-writer/history/${historyId}/used`, { method: 'PATCH' }).catch(() => {})
    }
    onNavigate('video-creator')
  }

  function handleReset() {
    setPhase('idle')
    setPassLog([])
    setAngles([])
    setChosenAngle(null)
    setFinalScript('')
    setScanResult(null)
    setHistoryId(null)
    setUserRating(null)
    setResearchBrief('')
    setError('')
  }

  function handleLoadFromHistory(script, entry) {
    setFinalScript(script)
    setHistoryId(entry.id)
    setUserRating(entry.rating)
    setScanResult(entry.scanResult || null)
    setPhase('complete')
    setShowHistory(false)
  }

  const isGenerating = phase === 'researching' || phase === 'generating'

  return (
    <div className="vorta-sw-layout">
      {/* Left column — Form */}
      <div className="vorta-sw-form-panel">
        <div className="p-6">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-xl font-semibold text-white">Script Writer</h1>
            <button onClick={() => setShowHistory(true)} className="vorta-sw-history-btn vorta-btn vorta-btn-ghost vorta-btn-sm">
              <History size={13} /> History
            </button>
          </div>
          <p className="text-xs text-white/40 mb-6">Generate fact-grounded documentary scripts with multi-pass AI refinement.</p>

          {showBrief && (
            <ResearchBrief idea={idea} profile={profile} onNavigate={onNavigate} onDismiss={() => setDismissed(true)} />
          )}

          {!showBrief && onNavigate && (
            <div className="mb-6">
              <button onClick={() => onNavigate('video-research')} className="vorta-btn vorta-btn-ghost text-xs flex items-center gap-1.5 text-purple-300/60 hover:text-purple-300">
                <Search size={12} /> Have a video idea? Research it first <ArrowRight size={10} />
              </button>
            </div>
          )}

          {/* Topic */}
          <div className="mb-5">
            <label className="vorta-label">Topic</label>
            <input
              className="vorta-input"
              placeholder="e.g. The Rise and Fall of WeWork"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              disabled={isGenerating}
            />
          </div>

          {/* Style template */}
          <div className="mb-5">
            <label className="vorta-label">Story Style</label>
            <StyleSelector value={styleTemplate} onChange={setStyleTemplate} />
          </div>

          {/* Target length */}
          <div className="mb-5">
            <label className="vorta-label">Target Length</label>
            <div className="flex gap-2">
              {[8, 12, 20].map(len => (
                <button
                  key={len}
                  onClick={() => setTargetLength(len)}
                  disabled={isGenerating}
                  className={`vorta-btn vorta-btn-sm flex-1 ${targetLength === len ? 'vorta-btn-primary' : 'vorta-btn-ghost'}`}
                >
                  {len} min
                </button>
              ))}
            </div>
          </div>

          {/* Voice profile */}
          <div className="mb-6">
            <label className="vorta-label">Channel Voice (optional)</label>
            <button onClick={() => setShowVoiceManager(true)} className="vorta-btn vorta-btn-ghost vorta-btn-sm w-full justify-start">
              <Mic size={12} />
              {voiceProfileId ? (
                <span className="vorta-sw-voice-badge">Voice profile active</span>
              ) : (
                <span className="text-white/40">No voice profile — default documentary style</span>
              )}
            </button>
          </div>

          {/* Generate button */}
          {phase === 'idle' && (
            <button
              onClick={handleGenerate}
              disabled={!topic.trim()}
              className="vorta-btn vorta-btn-primary w-full"
            >
              <Sparkles size={14} /> Generate Script
            </button>
          )}

          {phase === 'complete' && (
            <button onClick={handleReset} className="vorta-btn vorta-btn-secondary w-full">
              Start New Script
            </button>
          )}

          {error && (
            <div className="mt-4 rounded-lg p-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p className="text-xs text-red-400">{error}</p>
              <button onClick={handleReset} className="vorta-btn vorta-btn-ghost vorta-btn-sm mt-2 text-xs">Reset</button>
            </div>
          )}
        </div>
      </div>

      {/* Right column — Output */}
      <div className="vorta-sw-output-panel">
        <div className="p-6">
          {phase === 'idle' && !finalScript && (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(139,92,246,0.08)' }}>
                <Sparkles size={20} className="text-purple-400/40" />
              </div>
              <h3 className="text-sm font-medium text-white/30 mb-1">No script yet</h3>
              <p className="text-xs text-white/20 max-w-xs">Enter a topic, choose a style, and click Generate to create your documentary script.</p>
            </div>
          )}

          {(phase === 'researching' || phase === 'choosing_angle' || phase === 'generating') && (
            <GenerationProgress
              passLog={passLog}
              phase={phase}
              angles={angles}
              onChooseAngle={handleChooseAngle}
            />
          )}

          {phase === 'complete' && finalScript && (
            <ScriptOutput
              script={finalScript}
              scanResult={scanResult}
              historyId={historyId}
              userRating={userRating}
              onRated={setUserRating}
              onChange={setFinalScript}
              onSendToCreator={handleSendToCreator}
            />
          )}
        </div>
      </div>

      {/* Voice profile manager modal */}
      {showVoiceManager && (
        <VoiceProfileManager
          selectedId={voiceProfileId}
          onSelect={(id) => setVoiceProfileId(id)}
          onClose={() => setShowVoiceManager(false)}
        />
      )}

      {/* Script history panel */}
      {showHistory && (
        <ScriptHistory
          onClose={() => setShowHistory(false)}
          onLoadScript={handleLoadFromHistory}
        />
      )}
    </div>
  )
}
