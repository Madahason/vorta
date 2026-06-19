import { useState, useEffect, useCallback, useRef } from 'react'
import { ImageIcon, Loader2, AlertCircle, ChevronRight, RefreshCw, Check, Type, Sparkles, ArrowRight, Image, AlertTriangle, Download, Save, AlignLeft, AlignRight, AlignCenter, ArrowUp, ArrowDown, Move } from 'lucide-react'

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

const STYLE_MODES = [
  { id: 'curiosity_gap', label: 'Curiosity Gap', desc: 'Shadow, mystery, dramatic light' },
  { id: 'stat_driven', label: 'Stat Driven', desc: 'Bold number/chart dominant' },
  { id: 'face_or_figure', label: 'Face / Figure', desc: 'Person in one third, expression-driven' },
  { id: 'object_icon', label: 'Object Icon', desc: 'Product/symbol hero, studio bg' },
  { id: 'before_after', label: 'Before / After', desc: 'Split composition, two states' },
  { id: 'scene_dramatization', label: 'Scene Drama', desc: 'Dramatized real-world moment' },
]

// --- State C: Thumbnail Generation ---
function ThumbnailGeneration({ brief, selectedTitle, onContinue, onBack, persistBrief }) {
  const [styleMode, setStyleMode] = useState(() => {
    const saved = loadJson('tt_current_brief')
    return saved?.styleMode || null
  })
  const [images, setImages] = useState(() => {
    const saved = loadJson('tt_current_brief')
    return saved?.thumbnailImages || []
  })
  const [selectedImage, setSelectedImage] = useState(() => {
    const saved = loadJson('tt_current_brief')
    return saved?.selectedThumbnail || null
  })
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [failedCount, setFailedCount] = useState(0)
  const [prompt, setPrompt] = useState(null)

  async function handleGenerate(overrideMode) {
    const modeToUse = overrideMode !== undefined ? overrideMode : styleMode
    setGenerating(true)
    setError(null)
    setSelectedImage(null)
    try {
      const currentBrief = loadJson('tt_current_brief') || {}
      const resp = await fetch('/api/title-thumbnail/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          briefId: currentBrief.briefId || brief?.briefId || `tt_${Date.now()}`,
          idea: brief?.idea || currentBrief.idea,
          angle: brief?.angle || currentBrief.angle,
          title: selectedTitle,
          styleMode: modeToUse,
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to generate thumbnails')
      setImages(data.images || [])
      setStyleMode(data.styleMode)
      setFailedCount(data.failedCount || 0)
      setPrompt(data.prompt || null)
      persistBrief({
        styleMode: data.styleMode,
        thumbnailImages: data.images || [],
        thumbnailPrompt: data.prompt || null,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  function handleSelectImage(imgPath) {
    setSelectedImage(imgPath)
    persistBrief({ selectedThumbnail: imgPath })
  }

  function handleStyleChange(modeId) {
    setStyleMode(modeId)
    persistBrief({ styleMode: modeId })
  }

  function handleContinue() {
    if (!selectedImage) return
    onContinue(selectedImage)
  }

  const canContinue = !!selectedImage

  return (
    <div className="vorta-tt-thumbnails max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Generate Thumbnails</h2>
          <p className="text-xs text-white/35 mt-0.5">Title: "{selectedTitle}"</p>
        </div>
        <button onClick={onBack} className="vorta-btn vorta-btn-ghost text-xs text-white/40">← Back to titles</button>
      </div>

      {/* Style mode selector */}
      <div className="mb-6">
        <label className="vorta-label mb-2 block">Style Mode</label>
        <div className="grid grid-cols-3 gap-2">
          {STYLE_MODES.map(m => {
            const isActive = styleMode === m.id
            return (
              <button
                key={m.id}
                onClick={() => handleStyleChange(m.id)}
                disabled={generating}
                className="vorta-style-chip text-left rounded-lg px-3 py-2.5 transition-all"
                style={{
                  background: isActive ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isActive ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  opacity: generating ? 0.5 : 1,
                }}
              >
                <div className="text-xs font-medium" style={{ color: isActive ? '#c4b5fd' : 'rgba(255,255,255,0.7)' }}>{m.label}</div>
                <div className="text-[10px] mt-0.5" style={{ color: isActive ? '#c4b5fd80' : 'rgba(255,255,255,0.3)' }}>{m.desc}</div>
              </button>
            )
          })}
        </div>
        {!styleMode && (
          <p className="text-[10px] text-white/25 mt-1.5">Leave unselected for auto-detection based on your idea and niche.</p>
        )}
      </div>

      {/* Generate / Regenerate button */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => handleGenerate(styleMode)}
          disabled={generating}
          className="vorta-btn vorta-btn-primary flex items-center gap-2 px-6 py-2.5"
          style={{ opacity: generating ? 0.5 : 1 }}
        >
          {generating ? (
            <><Loader2 size={14} className="animate-spin" />Generating 3 variations...</>
          ) : images.length > 0 ? (
            <><RefreshCw size={14} />Regenerate</>
          ) : (
            <><Image size={14} />Generate Thumbnails</>
          )}
        </button>
        {styleMode && images.length > 0 && !generating && (
          <span className="text-[10px] text-white/25">Mode: {STYLE_MODES.find(m => m.id === styleMode)?.label || styleMode}</span>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#fca5a5' }}>
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {generating && (
        <div className="text-center py-12">
          <Loader2 size={32} className="animate-spin text-purple-400 mx-auto mb-4" />
          <p className="text-sm text-white/50">Generating 3 thumbnail variations via Higgsfield...</p>
          <p className="text-[10px] text-white/25 mt-1">This typically takes 30-60 seconds per variation</p>
        </div>
      )}

      {/* Image variant grid */}
      {!generating && images.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-4">
            {images.map((img, i) => {
              const isSelected = selectedImage === img.path
              return (
                <button
                  key={i}
                  onClick={() => handleSelectImage(img.path)}
                  className="vorta-thumbnail-card relative rounded-lg overflow-hidden transition-all group"
                  style={{
                    border: `2px solid ${isSelected ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.06)'}`,
                    boxShadow: isSelected ? '0 0 20px rgba(139,92,246,0.15)' : 'none',
                  }}
                >
                  <div className="aspect-video bg-black/50">
                    <img
                      src={img.path}
                      alt={`Thumbnail variation ${i + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                  </div>
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.9)' }}>
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' }}>
                    <span className="text-[10px] text-white/60">Variation {i + 1}</span>
                  </div>
                </button>
              )
            })}
          </div>

          {failedCount > 0 && (
            <div className="flex items-center gap-2 mb-4 text-[11px]" style={{ color: '#fbbf24' }}>
              <AlertTriangle size={12} />
              <span>{failedCount} variation{failedCount > 1 ? 's' : ''} failed — click Regenerate to retry</span>
            </div>
          )}
        </>
      )}

      {/* Continue button */}
      {images.length > 0 && !generating && (
        <button
          onClick={handleContinue}
          disabled={!canContinue}
          className="vorta-btn vorta-btn-primary w-full py-3 text-sm font-medium rounded-xl flex items-center justify-center gap-2"
          style={{ opacity: canContinue ? 1 : 0.5 }}
        >
          Continue <ArrowRight size={14} />
        </button>
      )}
    </div>
  )
}

const PRESETS = [
  { id: 'left',   label: 'Left',   icon: AlignLeft,   x: 0.25, y: 0.5 },
  { id: 'center', label: 'Center', icon: AlignCenter,  x: 0.5,  y: 0.5 },
  { id: 'right',  label: 'Right',  icon: AlignRight,  x: 0.75, y: 0.5 },
  { id: 'top',    label: 'Top',    icon: ArrowUp,     x: 0.5,  y: 0.15 },
  { id: 'bottom', label: 'Bottom', icon: ArrowDown,   x: 0.5,  y: 0.85 },
]

const FONT_FAMILIES = [
  {
    id: 'anton', name: 'Anton', css: 'Anton, Impact, sans-serif',
    weights: [{ value: 400, label: 'Regular' }],
    defaultWeight: 400, italicAvailable: false,
  },
  {
    id: 'inter', name: 'Inter', css: 'Inter, "Helvetica Neue", sans-serif',
    weights: [{ value: 700, label: 'Bold' }, { value: 900, label: 'Black' }],
    defaultWeight: 900, italicAvailable: false,
  },
  {
    id: 'playfair', name: 'Playfair', css: '"Playfair Display", Georgia, serif',
    weights: [{ value: 700, label: 'Bold' }, { value: 900, label: 'Black' }],
    defaultWeight: 700, italicAvailable: false,
  },
  {
    id: 'oswald', name: 'Oswald', css: 'Oswald, "Arial Narrow", sans-serif',
    weights: [{ value: 700, label: 'Bold' }],
    defaultWeight: 700, italicAvailable: false,
  },
]

const EXCL_W = 0.15
const EXCL_H = 0.12

function clampToSafeZone(nx, ny) {
  let cx = Math.max(0.02, Math.min(0.98, nx))
  let cy = Math.max(0.02, Math.min(0.98, ny))
  if (cx > (1 - EXCL_W - 0.05) && cy > (1 - EXCL_H - 0.05)) {
    const overX = cx - (1 - EXCL_W - 0.05)
    const overY = cy - (1 - EXCL_H - 0.05)
    if (overX < overY) cx = 1 - EXCL_W - 0.06
    else cy = 1 - EXCL_H - 0.06
  }
  return { x: cx, y: cy }
}

// --- State D: Overlay Editor ---
function OverlayEditor({ brief, selectedTitle, selectedImage, onBack, persistBrief }) {
  const saved = loadJson('tt_current_brief')
  const savedOverlay = saved?.overlayState || {}

  const [text, setText] = useState(savedOverlay.text || selectedTitle || '')
  const [posX, setPosX] = useState(savedOverlay.x ?? 0.25)
  const [posY, setPosY] = useState(savedOverlay.y ?? 0.5)
  const [fontSize, setFontSize] = useState(savedOverlay.fontSize || 72)
  const [color, setColor] = useState(savedOverlay.color || '#FFFFFF')
  const [strokeColor, setStrokeColor] = useState(savedOverlay.strokeColor || '#000000')
  const [strokeWidth, setStrokeWidth] = useState(savedOverlay.strokeWidth ?? 4)
  const [fontFamily, setFontFamily] = useState(savedOverlay.fontFamily || 'anton')
  const [fontWeight, setFontWeight] = useState(savedOverlay.fontWeight || null)
  const [italic, setItalic] = useState(savedOverlay.italic || false)
  const [uppercase, setUppercase] = useState(savedOverlay.uppercase !== undefined ? savedOverlay.uppercase : true)
  const [letterSpacing, setLetterSpacing] = useState(savedOverlay.letterSpacing || 0)
  const [backgroundPill, setBackgroundPill] = useState(savedOverlay.backgroundPill || false)
  const [pillColor, setPillColor] = useState(savedOverlay.backgroundPillColor || '#000000')
  const [pillOpacity, setPillOpacity] = useState(savedOverlay.backgroundPillOpacity ?? 0.6)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [finalImage, setFinalImage] = useState(() => saved?.finalImagePath || null)
  const [showFinal, setShowFinal] = useState(() => !!saved?.finalImagePath)
  const [dragging, setDragging] = useState(false)
  const [activePreset, setActivePreset] = useState(null)

  const canvasRef = useRef(null)

  const currentFont = FONT_FAMILIES.find(f => f.id === fontFamily) || FONT_FAMILIES[0]
  const resolvedWeight = fontWeight && currentFont.weights.some(w => w.value === fontWeight)
    ? fontWeight : currentFont.defaultWeight

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length
  const wordCountColor = wordCount > 4 ? '#fbbf24' : 'rgba(255,255,255,0.3)'
  const displayText = uppercase ? text : text

  function handlePreset(preset) {
    const clamped = clampToSafeZone(preset.x, preset.y)
    setPosX(clamped.x)
    setPosY(clamped.y)
    setActivePreset(preset.id)
    setShowFinal(false)
  }

  function handlePointerDown(e) {
    if (showFinal) return
    e.preventDefault()
    setDragging(true)
    e.target.setPointerCapture(e.pointerId)
    updatePosFromEvent(e)
  }

  function handlePointerMove(e) {
    if (!dragging) return
    updatePosFromEvent(e)
  }

  function handlePointerUp() {
    setDragging(false)
  }

  function updatePosFromEvent(e) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const rawX = (e.clientX - rect.left) / rect.width
    const rawY = (e.clientY - rect.top) / rect.height
    const clamped = clampToSafeZone(rawX, rawY)
    setPosX(clamped.x)
    setPosY(clamped.y)
    setActivePreset(null)
    setShowFinal(false)
  }

  function handleFontFamilyChange(id) {
    setFontFamily(id)
    const newFont = FONT_FAMILIES.find(f => f.id === id) || FONT_FAMILIES[0]
    if (!newFont.weights.some(w => w.value === fontWeight)) {
      setFontWeight(newFont.defaultWeight)
    }
    if (italic && !newFont.italicAvailable) setItalic(false)
    setShowFinal(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const currentBrief = loadJson('tt_current_brief') || {}
      const resp = await fetch('/api/title-thumbnail/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          briefId: currentBrief.briefId || brief?.briefId,
          text,
          x: posX,
          y: posY,
          fontSize,
          color,
          strokeColor,
          strokeWidth,
          fontFamily,
          fontWeight: resolvedWeight,
          italic,
          uppercase,
          letterSpacing,
          backgroundPill,
          backgroundPillColor: pillColor,
          backgroundPillOpacity: pillOpacity,
          selectedThumbnail: selectedImage,
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to compose thumbnail')
      setFinalImage(data.finalImagePath)
      setShowFinal(true)
      if (data.overlayState) {
        setPosX(data.overlayState.x)
        setPosY(data.overlayState.y)
      }
      persistBrief({
        overlayState: data.overlayState,
        finalImagePath: data.finalImagePath,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleControlChange() {
    setShowFinal(false)
  }

  const previewFontSize = Math.round(fontSize * 0.55)

  return (
    <div className="vorta-tt-overlay max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Text Overlay</h2>
          <p className="text-xs text-white/35 mt-0.5">Drag text to position or use presets — add text to your thumbnail</p>
        </div>
        <button onClick={onBack} className="vorta-btn vorta-btn-ghost text-xs text-white/40">← Back to thumbnails</button>
      </div>

      <div className="grid grid-cols-[1fr_300px] gap-6">
        {/* Preview area */}
        <div>
          <div
            ref={canvasRef}
            className="vorta-overlay-preview relative rounded-lg overflow-hidden select-none"
            style={{ border: '1px solid rgba(255,255,255,0.08)', cursor: showFinal ? 'default' : 'crosshair' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <div className="aspect-video relative bg-black">
              <img
                src={showFinal && finalImage ? finalImage + '?t=' + Date.now() : selectedImage}
                alt="Thumbnail preview"
                className="w-full h-full object-cover pointer-events-none"
                draggable={false}
              />

              {/* Exclusion zone overlay — visible during editing */}
              {!showFinal && (
                <div
                  className="vorta-exclusion-zone absolute pointer-events-none"
                  style={{
                    right: 0,
                    bottom: 0,
                    width: `${EXCL_W * 100}%`,
                    height: `${EXCL_H * 100}%`,
                    background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(239,68,68,0.12) 3px, rgba(239,68,68,0.12) 6px)',
                    border: '1px dashed rgba(239,68,68,0.25)',
                    borderRight: 'none',
                    borderBottom: 'none',
                  }}
                >
                  <span className="absolute top-1 left-1 text-[8px] text-red-400/40">duration badge</span>
                </div>
              )}

              {/* Live CSS text overlay — draggable via pointer events */}
              {!showFinal && text.trim() && (
                <>
                  {backgroundPill && (
                    <div
                      className="vorta-overlay-pill absolute pointer-events-none"
                      style={{
                        left: `${posX * 100}%`,
                        top: `${posY * 100}%`,
                        transform: 'translate(-50%, -50%)',
                        background: pillColor,
                        opacity: pillOpacity,
                        borderRadius: Math.round(previewFontSize * 0.15),
                        padding: `${Math.round(previewFontSize * 0.25)}px ${Math.round(previewFontSize * 0.4)}px`,
                        maxWidth: '55%',
                        textAlign: 'center',
                        fontSize: previewFontSize,
                        fontFamily: currentFont.css,
                        fontWeight: resolvedWeight,
                        letterSpacing: letterSpacing,
                        lineHeight: 1.15,
                        color: 'transparent',
                        wordBreak: 'break-word',
                        userSelect: 'none',
                        fontStyle: italic ? 'italic' : 'normal',
                      }}
                    >
                      {uppercase ? text.toUpperCase() : text}
                    </div>
                  )}
                  <div
                    className="vorta-overlay-text absolute pointer-events-none"
                    style={{
                      left: `${posX * 100}%`,
                      top: `${posY * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      fontFamily: currentFont.css,
                      fontWeight: resolvedWeight,
                      fontStyle: italic ? 'italic' : 'normal',
                      textTransform: uppercase ? 'uppercase' : 'none',
                      letterSpacing: letterSpacing,
                      lineHeight: 1.15,
                      fontSize: previewFontSize,
                      color: color,
                      WebkitTextStroke: `${Math.max(1, Math.round(strokeWidth * 0.55))}px ${strokeColor}`,
                      textShadow: `2px 2px 4px rgba(0,0,0,0.6)`,
                      paintOrder: 'stroke fill',
                      maxWidth: '50%',
                      textAlign: 'center',
                      wordBreak: 'break-word',
                      userSelect: 'none',
                    }}
                  >
                    {text}
                  </div>
                </>
              )}

              {/* Drag crosshair indicator */}
              {!showFinal && dragging && (
                <div className="absolute pointer-events-none" style={{ left: `${posX * 100}%`, top: `${posY * 100}%`, transform: 'translate(-50%, -50%)' }}>
                  <Move size={16} className="text-purple-400/60" />
                </div>
              )}
            </div>
          </div>

          {!showFinal && (
            <p className="text-[10px] text-white/20 mt-1.5 flex items-center gap-1"><Move size={9} />Click or drag on the image to reposition text</p>
          )}

          {showFinal && (
            <div className="flex items-center gap-3 mt-3">
              <span className="text-[10px] text-green-400 flex items-center gap-1"><Check size={10} />Saved</span>
              <a
                href={finalImage}
                download="thumbnail.jpg"
                className="vorta-btn vorta-btn-ghost text-xs flex items-center gap-1.5"
                style={{ color: '#c4b5fd' }}
              >
                <Download size={12} />Download JPEG
              </a>
              <button
                onClick={() => setShowFinal(false)}
                className="vorta-btn vorta-btn-ghost text-xs text-white/40"
              >
                Edit again
              </button>
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#fca5a5' }}>
              <AlertCircle size={12} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Controls panel */}
        <div className="vorta-overlay-controls rounded-xl p-4 space-y-3 overflow-y-auto" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', maxHeight: 'calc(100vh - 180px)' }}>
          {/* Text input */}
          <div className="vorta-field">
            <label className="vorta-label">Overlay Text</label>
            <input
              className="vorta-input"
              value={text}
              onChange={e => { setText(e.target.value); handleControlChange() }}
              placeholder="Text on thumbnail..."
            />
            <p className="text-[10px] mt-1" style={{ color: wordCountColor }}>
              {wordCount} word{wordCount !== 1 ? 's' : ''}{wordCount > 4 ? ' — consider keeping to 3-4 words' : ''}
            </p>
          </div>

          {/* Font family picker */}
          <div className="vorta-field">
            <label className="vorta-label">Font</label>
            <div className="grid grid-cols-2 gap-1.5">
              {FONT_FAMILIES.map(f => {
                const isActive = fontFamily === f.id
                return (
                  <button
                    key={f.id}
                    onClick={() => { handleFontFamilyChange(f.id); handleControlChange() }}
                    className="vorta-font-chip text-left rounded-md px-2.5 py-2 transition-all"
                    style={{
                      background: isActive ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isActive ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    <span className="block text-xs" style={{ fontFamily: f.css, fontWeight: f.defaultWeight, color: isActive ? '#c4b5fd' : 'rgba(255,255,255,0.6)' }}>{f.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Weight + Italic + Uppercase row */}
          <div className="flex items-center gap-1.5">
            {currentFont.weights.length > 1 && currentFont.weights.map(w => (
              <button
                key={w.value}
                onClick={() => { setFontWeight(w.value); handleControlChange() }}
                className="vorta-weight-btn px-2 py-1 rounded text-[9px] transition-all"
                style={{
                  background: resolvedWeight === w.value ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${resolvedWeight === w.value ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  color: resolvedWeight === w.value ? '#c4b5fd' : 'rgba(255,255,255,0.4)',
                  fontWeight: w.value,
                }}
              >
                {w.label}
              </button>
            ))}
            <button
              onClick={() => { setItalic(!italic); handleControlChange() }}
              disabled={!currentFont.italicAvailable && !italic}
              className="vorta-italic-btn px-2 py-1 rounded text-[9px] transition-all"
              title={!currentFont.italicAvailable ? 'Italic not available for this font (CSS skew used)' : ''}
              style={{
                background: italic ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${italic ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                color: italic ? '#c4b5fd' : 'rgba(255,255,255,0.4)',
                fontStyle: 'italic',
              }}
            >
              I
            </button>
            <button
              onClick={() => { setUppercase(!uppercase); handleControlChange() }}
              className="vorta-uppercase-btn px-2 py-1 rounded text-[9px] font-bold transition-all"
              style={{
                background: uppercase ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${uppercase ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                color: uppercase ? '#c4b5fd' : 'rgba(255,255,255,0.4)',
              }}
            >
              AA
            </button>
          </div>

          {/* Position presets */}
          <div className="vorta-field">
            <label className="vorta-label">Position</label>
            <div className="grid grid-cols-5 gap-1">
              {PRESETS.map(p => {
                const isActive = activePreset === p.id
                const Icon = p.icon
                return (
                  <button
                    key={p.id}
                    onClick={() => handlePreset(p)}
                    className="vorta-position-btn flex flex-col items-center gap-0.5 py-1.5 rounded-md text-[9px] transition-all"
                    style={{
                      background: isActive ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isActive ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      color: isActive ? '#c4b5fd' : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    <Icon size={11} />
                    {p.label}
                  </button>
                )
              })}
            </div>
            <p className="text-[9px] text-white/15 mt-1">x: {posX.toFixed(2)} · y: {posY.toFixed(2)}</p>
          </div>

          {/* Font size + letter spacing */}
          <div className="vorta-field">
            <label className="vorta-label">Size: {fontSize}px</label>
            <input type="range" min="32" max="140" value={fontSize}
              onChange={e => { setFontSize(Number(e.target.value)); handleControlChange() }} className="w-full" />
          </div>
          <div className="vorta-field">
            <label className="vorta-label">Letter Spacing: {letterSpacing}px</label>
            <input type="range" min="-4" max="20" value={letterSpacing}
              onChange={e => { setLetterSpacing(Number(e.target.value)); handleControlChange() }} className="w-full" />
          </div>

          {/* Colors */}
          <div className="grid grid-cols-2 gap-2">
            <div className="vorta-field">
              <label className="vorta-label">Fill</label>
              <div className="flex items-center gap-2">
                <input type="color" value={color}
                  onChange={e => { setColor(e.target.value); handleControlChange() }}
                  className="w-7 h-7 rounded cursor-pointer border-0" style={{ background: 'transparent' }} />
                <span className="text-[9px] text-white/30 font-mono">{color}</span>
              </div>
            </div>
            <div className="vorta-field">
              <label className="vorta-label">Stroke</label>
              <div className="flex items-center gap-2">
                <input type="color" value={strokeColor}
                  onChange={e => { setStrokeColor(e.target.value); handleControlChange() }}
                  className="w-7 h-7 rounded cursor-pointer border-0" style={{ background: 'transparent' }} />
                <span className="text-[9px] text-white/30 font-mono">{strokeColor}</span>
              </div>
            </div>
          </div>
          <div className="vorta-field">
            <label className="vorta-label">Stroke Width: {strokeWidth}px</label>
            <input type="range" min="0" max="12" value={strokeWidth}
              onChange={e => { setStrokeWidth(Number(e.target.value)); handleControlChange() }} className="w-full" />
          </div>

          {/* Background pill */}
          <div className="vorta-field">
            <div className="flex items-center justify-between">
              <label className="vorta-label">Background Pill</label>
              <button
                onClick={() => { setBackgroundPill(!backgroundPill); handleControlChange() }}
                className="vorta-pill-toggle w-8 h-4.5 rounded-full relative transition-all"
                style={{
                  background: backgroundPill ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.1)',
                  padding: 2,
                }}
              >
                <div className="w-3.5 h-3.5 rounded-full transition-all" style={{
                  background: backgroundPill ? '#c4b5fd' : 'rgba(255,255,255,0.3)',
                  transform: backgroundPill ? 'translateX(14px)' : 'translateX(0)',
                }} />
              </button>
            </div>
            {backgroundPill && (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <input type="color" value={pillColor}
                    onChange={e => { setPillColor(e.target.value); handleControlChange() }}
                    className="w-7 h-7 rounded cursor-pointer border-0" style={{ background: 'transparent' }} />
                  <span className="text-[9px] text-white/30 font-mono">{pillColor}</span>
                  <span className="text-[9px] text-white/20 ml-auto">{Math.round(pillOpacity * 100)}%</span>
                </div>
                <input type="range" min="0" max="100" value={Math.round(pillOpacity * 100)}
                  onChange={e => { setPillOpacity(Number(e.target.value) / 100); handleControlChange() }} className="w-full" />
              </div>
            )}
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving || !text.trim()}
            className="vorta-btn vorta-btn-primary w-full flex items-center justify-center gap-2 py-2.5"
            style={{ opacity: saving || !text.trim() ? 0.5 : 1 }}
          >
            {saving ? (
              <><Loader2 size={14} className="animate-spin" />Compositing...</>
            ) : (
              <><Save size={14} />Save Thumbnail</>
            )}
          </button>
        </div>
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
  const [selectedThumbnail, setSelectedThumbnail] = useState(() => {
    const saved = loadJson(LS_KEY)
    return saved?.selectedThumbnail || null
  })
  const [view, setView] = useState(() => {
    const saved = loadJson(LS_KEY)
    if (saved?.selectedThumbnail) return 'overlay'
    if (saved?.selectedTitle) return 'thumbnails'
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

    setView('thumbnails')
  }

  function handleThumbnailSelected(imagePath) {
    setSelectedThumbnail(imagePath)
    persistBrief({ selectedThumbnail: imagePath })
    setView('overlay')
  }

  function handleBackToSetup() {
    setView('setup')
  }

  function handleBackToSelection() {
    setView('selection')
  }

  function handleBackToThumbnails() {
    setView('thumbnails')
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

      {!loading && view === 'thumbnails' && selectedTitle && (
        <ThumbnailGeneration
          brief={brief}
          selectedTitle={selectedTitle}
          onContinue={handleThumbnailSelected}
          onBack={handleBackToSelection}
          persistBrief={persistBrief}
        />
      )}

      {!loading && view === 'overlay' && selectedTitle && (
        <OverlayEditor
          brief={brief}
          selectedTitle={selectedTitle}
          selectedImage={selectedThumbnail}
          onBack={handleBackToThumbnails}
          persistBrief={persistBrief}
        />
      )}
    </div>
  )
}
