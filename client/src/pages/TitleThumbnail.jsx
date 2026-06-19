import { useState, useEffect, useCallback } from 'react'
import { ImageIcon, Loader2, AlertCircle, ChevronRight, RefreshCw, Check, Type, Sparkles, ArrowRight } from 'lucide-react'

const LS_KEY = 'tt_current_brief'

const STRATEGY_COLORS = {
  curiosity_gap:     { bg: 'rgba(139,92,246,0.12)', color: '#c4b5fd', label: 'Curiosity Gap' },
  contrarian_claim:  { bg: 'rgba(239,68,68,0.10)', color: '#fca5a5', label: 'Contrarian' },
  number_driven:     { bg: 'rgba(34,197,94,0.10)', color: '#86efac', label: 'Number Driven' },
  direct_claim:      { bg: 'rgba(59,130,246,0.10)', color: '#93c5fd', label: 'Direct Claim' },
  shock_framing:     { bg: 'rgba(245,158,11,0.10)', color: '#fbbf24', label: 'Shock Framing' },
}

function loadJson(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null } catch { return null }
}
function saveJson(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true } catch { return false }
}

function StrategyChip({ strategy }) {
  const cfg = STRATEGY_COLORS[strategy] || STRATEGY_COLORS.direct_claim
  return (
    <span className="vorta-strategy-chip inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

// --- State A: Setup Form ---
function SetupForm({ onBriefReady, initialBrief }) {
  const [idea, setIdea] = useState(initialBrief?.idea || '')
  const [angle, setAngle] = useState(initialBrief?.angle || '')
  const [niche, setNiche] = useState(initialBrief?.niche || '')
  const [targetAudience, setTargetAudience] = useState(initialBrief?.targetAudience || '')
  const [vrLoaded, setVrLoaded] = useState(false)

  const vrIdea = loadJson('vr_selected_idea')
  const vrAvailable = !!vrIdea

  function handleLoadFromVR() {
    if (!vrIdea) return
    setIdea(vrIdea.topic || '')
    const sa = vrIdea.selectedAngle || {}
    setAngle(sa.hook || sa.pitch || '')
    const profile = loadJson('vr_channel_profile')
    setNiche(profile?.niche || '')
    setTargetAudience('')
    setVrLoaded(true)
  }

  const canGenerate = idea.trim() && angle.trim() && niche.trim()

  function handleSubmit() {
    if (!canGenerate) return
    onBriefReady({
      idea: idea.trim(),
      angle: angle.trim(),
      niche: niche.trim(),
      targetAudience: targetAudience.trim(),
      linkedVrIdeaId: vrLoaded && vrIdea ? (vrIdea.ideaId || null) : null,
    })
  }

  return (
    <div className="vorta-tt-setup max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4" style={{ background: 'rgba(139,92,246,0.12)' }}>
          <ImageIcon size={22} className="text-purple-400" />
        </div>
        <h1 className="text-xl font-semibold text-white mb-1">Title & Thumbnail</h1>
        <p className="text-sm text-white/40">Generate optimized titles for your next video</p>
      </div>

      <div className="rounded-xl p-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="space-y-4">
          {/* Load from VR button */}
          <div className="relative">
            <button
              onClick={handleLoadFromVR}
              disabled={!vrAvailable}
              className="vorta-btn vorta-btn-ghost text-xs flex items-center gap-1.5 w-full justify-center py-2.5 rounded-lg transition-colors"
              style={{
                background: vrAvailable ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${vrAvailable ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)'}`,
                color: vrAvailable ? '#c4b5fd' : 'rgba(255,255,255,0.25)',
                cursor: vrAvailable ? 'pointer' : 'default',
                opacity: vrAvailable ? 1 : 0.5,
              }}
              title={vrAvailable ? 'Load idea from Video Research' : 'No saved idea yet — research one in Video Research, or enter details manually.'}
            >
              <Sparkles size={12} />
              {vrLoaded ? 'Loaded from Video Research ✓' : 'Load from Video Research'}
            </button>
            {!vrAvailable && (
              <p className="text-[10px] text-white/25 text-center mt-1">No saved idea yet — research one in Video Research, or enter details manually.</p>
            )}
          </div>

          <div className="vorta-field">
            <label className="vorta-label">Idea</label>
            <input className="vorta-input" value={idea} onChange={e => setIdea(e.target.value)} placeholder="e.g. The Rise and Fall of WeWork" />
          </div>
          <div className="vorta-field">
            <label className="vorta-label">Angle</label>
            <input className="vorta-input" value={angle} onChange={e => setAngle(e.target.value)} placeholder="e.g. How one man's ego destroyed a $47B company" />
          </div>
          <div className="vorta-field">
            <label className="vorta-label">Niche</label>
            <input className="vorta-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="e.g. business & finance" />
          </div>
          <div className="vorta-field">
            <label className="vorta-label">Target Audience <span className="text-white/20">(optional)</span></label>
            <input className="vorta-input" value={targetAudience} onChange={e => setTargetAudience(e.target.value)} placeholder="e.g. 18-35 male, interested in entrepreneurship" />
          </div>

          <button onClick={handleSubmit} disabled={!canGenerate}
            className="vorta-btn vorta-btn-primary w-full mt-2 flex items-center justify-center gap-2"
            style={{ opacity: canGenerate ? 1 : 0.5 }}>
            Generate Titles <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

// --- State B: Title Selection ---
function TitleSelection({ brief, titles, onSelect, onRegenerate, onBack, regenerating }) {
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [customTitle, setCustomTitle] = useState('')
  const [useCustom, setUseCustom] = useState(false)

  const selectedTitle = useCustom
    ? customTitle.trim()
    : (selectedIdx !== null && titles[selectedIdx] ? titles[selectedIdx].text : '')

  const canContinue = selectedTitle.length > 0

  function handleCardClick(idx) {
    setSelectedIdx(idx)
    setUseCustom(false)
  }

  function handleCustomFocus() {
    if (customTitle.trim()) {
      setUseCustom(true)
      setSelectedIdx(null)
    }
  }

  function handleCustomChange(e) {
    setCustomTitle(e.target.value)
    if (e.target.value.trim()) {
      setUseCustom(true)
      setSelectedIdx(null)
    } else {
      setUseCustom(false)
    }
  }

  return (
    <div className="vorta-tt-selection max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Choose Your Title</h2>
          <p className="text-xs text-white/35 mt-0.5">{titles.length} candidates generated for "{brief.idea}"</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="vorta-btn vorta-btn-ghost text-xs text-white/40">← Back</button>
          <button onClick={onRegenerate} disabled={regenerating}
            className="vorta-btn vorta-btn-ghost text-xs flex items-center gap-1.5"
            style={{ color: '#c4b5fd', opacity: regenerating ? 0.5 : 1 }}>
            {regenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Regenerate
          </button>
        </div>
      </div>

      {/* Title cards grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {titles.map((t, i) => {
          const isSelected = !useCustom && selectedIdx === i
          return (
            <button
              key={i}
              onClick={() => handleCardClick(i)}
              className="vorta-title-card text-left rounded-lg p-4 transition-all"
              style={{
                background: isSelected ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isSelected ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm font-medium text-white leading-snug flex-1">{t.text}</p>
                {isSelected && <Check size={14} className="text-purple-400 shrink-0 mt-0.5" />}
              </div>
              <StrategyChip strategy={t.strategy} />
            </button>
          )
        })}
      </div>

      {/* Custom title input */}
      <div className="rounded-xl p-4 mb-6" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${useCustom && customTitle.trim() ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
        <div className="flex items-center gap-2 mb-2">
          <Type size={12} className="text-white/30" />
          <span className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Or type your own</span>
          {useCustom && customTitle.trim() && <Check size={12} className="text-purple-400" />}
        </div>
        <input
          className="vorta-input"
          value={customTitle}
          onChange={handleCustomChange}
          onFocus={handleCustomFocus}
          placeholder="Type a custom title..."
        />
      </div>

      {/* Continue button */}
      <button
        onClick={() => onSelect(selectedTitle)}
        disabled={!canContinue}
        className="vorta-btn vorta-btn-primary w-full py-3 text-sm font-medium rounded-xl flex items-center justify-center gap-2"
        style={{ opacity: canContinue ? 1 : 0.5 }}
      >
        Continue <ArrowRight size={14} />
      </button>
    </div>
  )
}

// --- State C: Placeholder ---
function ThumbnailPlaceholder({ selectedTitle, onBack }) {
  return (
    <div className="vorta-tt-placeholder max-w-2xl mx-auto text-center">
      <div className="rounded-xl p-8" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl mb-4" style={{ background: 'rgba(139,92,246,0.08)' }}>
          <ImageIcon size={24} className="text-purple-400/50" />
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">Title Selected</h2>
        <p className="text-sm text-purple-300/70 font-medium mb-4">"{selectedTitle}"</p>
        <p className="text-xs text-white/30 mb-6">Thumbnail generation coming in TT-2</p>
        <button onClick={onBack} className="vorta-btn vorta-btn-ghost text-xs text-white/40">← Back to titles</button>
      </div>
    </div>
  )
}

// --- Main Page ---
export default function TitleThumbnail({ onNavigate }) {
  const [brief, setBrief] = useState(() => {
    const saved = loadJson(LS_KEY)
    if (saved && saved.idea) return saved
    return null
  })
  const [titles, setTitles] = useState(() => {
    const saved = loadJson(LS_KEY)
    return saved?.titleCandidates || []
  })
  const [selectedTitle, setSelectedTitle] = useState(() => {
    const saved = loadJson(LS_KEY)
    return saved?.selectedTitle || null
  })
  const [view, setView] = useState(() => {
    const saved = loadJson(LS_KEY)
    if (saved?.selectedTitle) return 'placeholder'
    if (saved?.titleCandidates?.length > 0) return 'selection'
    return 'setup'
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function persistBrief(updates) {
    const current = loadJson(LS_KEY) || {}
    const merged = { ...current, ...updates }
    saveJson(LS_KEY, merged)
  }

  const generateTitles = useCallback(async (briefData) => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('/api/title-thumbnail/generate-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(briefData),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to generate titles')
      setTitles(data.titles)
      persistBrief({ ...briefData, titleCandidates: data.titles })
      setView('selection')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  function handleBriefReady(briefData) {
    setBrief(briefData)
    persistBrief(briefData)
    generateTitles(briefData)
  }

  function handleRegenerate() {
    if (!brief) return
    generateTitles(brief)
  }

  async function handleTitleSelected(title) {
    setSelectedTitle(title)
    persistBrief({ selectedTitle: title })

    try {
      const currentBrief = loadJson(LS_KEY) || {}
      const resp = await fetch('/api/title-thumbnail/brief/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea: currentBrief.idea,
          angle: currentBrief.angle,
          niche: currentBrief.niche,
          targetAudience: currentBrief.targetAudience || '',
          titleCandidates: currentBrief.titleCandidates || [],
          selectedTitle: title,
          linkedVrIdeaId: currentBrief.linkedVrIdeaId || null,
        }),
      })
      const data = await resp.json()
      if (resp.ok && data.briefId) {
        persistBrief({ briefId: data.briefId })
      }
    } catch {}

    setView('placeholder')
  }

  function handleBackToSetup() {
    setView('setup')
  }

  function handleBackToSelection() {
    setView('selection')
  }

  return (
    <div className="vorta-title-thumbnail p-8">
      {error && (
        <div className="max-w-2xl mx-auto mb-6">
          <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#fca5a5' }}>
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {loading && (
        <div className="max-w-2xl mx-auto text-center py-16">
          <Loader2 size={28} className="animate-spin text-purple-400 mx-auto mb-4" />
          <p className="text-sm text-white/50">Generating title candidates...</p>
        </div>
      )}

      {!loading && view === 'setup' && (
        <SetupForm onBriefReady={handleBriefReady} initialBrief={brief} />
      )}

      {!loading && view === 'selection' && titles.length > 0 && (
        <TitleSelection
          brief={brief}
          titles={titles}
          onSelect={handleTitleSelected}
          onRegenerate={handleRegenerate}
          onBack={handleBackToSetup}
          regenerating={loading}
        />
      )}

      {!loading && view === 'placeholder' && selectedTitle && (
        <ThumbnailPlaceholder selectedTitle={selectedTitle} onBack={handleBackToSelection} />
      )}
    </div>
  )
}
