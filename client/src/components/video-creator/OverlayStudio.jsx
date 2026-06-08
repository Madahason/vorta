import { useState, useMemo } from 'react'
import { X, Trash2 } from 'lucide-react'
import { VideoPlayer } from './VideoPlayer'
import {
  OVERLAY_TABS, getTemplatesForType,
  ENTER_ANIMATIONS, EXIT_ANIMATIONS, EASING_OPTIONS, FONT_OPTIONS,
} from '../../config/overlayTemplates'

function deepMerge(target, source) {
  if (!source) return target
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      // Always recurse into object values so we never share references with source
      const targetVal = (target?.[key] !== null && typeof target?.[key] === 'object') ? target[key] : {}
      result[key] = deepMerge(targetVal, source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

function genId() { return Math.random().toString(36).slice(2, 9) }

// Convert old flat overlay format {line1, line2, color:{}, font:{}, animation:{}}
// to the new nested format expected by OverlayEditor. Old-format overlays from AI
// analysis have overlay.text as a string — reading .line1 on a string gives undefined,
// which makes every editor field appear blank (the "placeholder" bug).
function normalizeOverlay(o) {
  if (o.text && typeof o.text === 'object') {
    return o.id ? o : { ...o, id: genId() }
  }
  const c = o.color || {}; const f = o.font || {}; const a = o.animation || {}
  return {
    id: o.id || genId(),
    type: o.type,
    template: o.template || null,
    text: {
      line1: o.line1 || (typeof o.text === 'string' ? o.text : '') || '',
      line2: o.line2 || '',
      color: c.textPrimary || '#f0f0f0',
      size: f.sizePrimary || 15,
      weight: f.weight || '500',
      family: f.family || 'Inter',
      letterSpacing: f.letterSpacing || '0em',
      transform: f.transform || 'none',
    },
    background: { color: 'rgba(0,0,0,0)', blur: 0, borderRadius: 0 },
    accent: { color: c.accent || '#3b82f6', width: 3, position: 'left' },
    animation: {
      enter: a.enter || 'slide_left', exit: a.exit || 'slide_left',
      duration: a.duration || 18, easing: a.easing || 'spring', delay: 0,
    },
    position: { x: 'left', y: 'bottom', offsetX: 48, offsetY: 72 },
    timing: { appearAt: o.appearAt ?? 0 },
    opacity: 1,
  }
}

// ── Shared input styles ───────────────────────────────────────────────────────
const label11 = { fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3, display: 'block' }
const inputBase = {
  width: '100%', background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.20)',
  borderRadius: 5, color: 'rgba(255,255,255,0.92)', fontSize: 12, padding: '5px 8px', outline: 'none', boxSizing: 'border-box',
}

function FieldRow({ label, children, grid }) {
  return (
    <div style={{ marginBottom: 9, ...(grid ? { display: 'grid', gridTemplateColumns: grid, gap: 7 } : {}) }}>
      {!grid && <span style={label11}>{label}</span>}
      {grid ? children : <div>{children}</div>}
    </div>
  )
}

function TextInput({ label, value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <span style={label11}>{label}</span>
      <input type="text" value={value || ''} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputBase }} />
    </div>
  )
}

function NumberInput({ label, value, onChange, min = 0, max = 999, step = 1 }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <span style={label11}>{label}</span>
      <input type="number" value={value ?? 0} onChange={e => onChange(Number(e.target.value))}
        min={min} max={max} step={step} style={{ ...inputBase }} />
    </div>
  )
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <span style={label11}>{label}</span>
      <select value={value || ''} onChange={e => onChange(e.target.value)}
        style={{ ...inputBase, cursor: 'pointer' }}>
        {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  )
}

function ColorInput({ label, value, onChange }) {
  const isComplex = (value || '').includes('gradient') || (value || '').startsWith('rgba')
  return (
    <div style={{ marginBottom: 9 }}>
      <span style={label11}>{label}</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {!isComplex && (
          <input type="color" value={value?.startsWith('#') ? value : '#3b82f6'}
            onChange={e => onChange(e.target.value)}
            style={{ width: 30, height: 28, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 4, padding: 0 }} />
        )}
        <input type="text" value={value || ''} onChange={e => onChange(e.target.value)}
          style={{ ...inputBase, flex: 1, fontFamily: 'monospace', fontSize: 10 }} />
      </div>
    </div>
  )
}

function SliderInput({ label, value, onChange, min = 0, max = 1, step = 0.01 }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <span style={label11}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="range" min={min} max={max} step={step} value={value ?? 0}
          onChange={e => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: '#7c3aed' }} />
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', minWidth: 32, textAlign: 'right' }}>
          {Number(value ?? 0).toFixed(step < 0.1 ? 2 : 0)}
        </span>
      </div>
    </div>
  )
}

function SectionHead({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em',
      color: 'rgba(255,255,255,0.22)', margin: '14px 0 8px',
      borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12,
    }}>
      {children}
    </div>
  )
}

// ── Template mini-preview (CSS mockup) ───────────────────────────────────────
function TemplatePreview({ template, type }) {
  const bg = { width: '100%', height: '100%', background: '#161624', position: 'relative', borderRadius: 6, overflow: 'hidden' }
  const bar = (w, h, op = 1) => ({ height: h, background: `rgba(255,255,255,${op})`, borderRadius: 1, width: w })

  if (type === 'lower_third') {
    const isBg      = template.id === 'color_block'
    const isFrost   = template.id === 'frosted_glass'
    const isUline   = template.id === 'underline_reveal'
    return (
      <div style={bg}>
        <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8 }}>
          {isUline ? (
            <div style={{ borderBottom: '1.5px solid #3b82f6', paddingBottom: 3 }}>
              <div style={bar('58%', 3)} /><div style={{ height: 2 }} /><div style={bar('38%', 2, 0.4)} />
            </div>
          ) : (
            <div style={{
              borderLeft: '2px solid #3b82f6',
              background: isBg ? 'rgba(0,0,0,0.82)' : isFrost ? 'rgba(255,255,255,0.08)' : 'none',
              backdropFilter: isFrost ? 'blur(4px)' : 'none', padding: '3px 6px',
            }}>
              <div style={bar('55%', 3)} /><div style={{ height: 3 }} /><div style={bar('36%', 2, 0.4)} />
            </div>
          )}
        </div>
      </div>
    )
  }

  if (type === 'date_stamp') {
    const isCorner = template.id === 'corner_stamp'
    return (
      <div style={bg}>
        <div style={{ position: 'absolute', bottom: 8, right: 8, background: isCorner ? 'none' : 'rgba(0,0,0,0.55)', borderRadius: 12, padding: '3px 7px' }}>
          <div style={bar(38, 2, 0.55)} />
        </div>
      </div>
    )
  }

  if (type === 'kinetic_text') {
    const isBottom = template.id === 'bottom_quote'
    return (
      <div style={{ ...bg, display: 'flex', alignItems: isBottom ? 'flex-end' : 'center', justifyContent: 'center', padding: isBottom ? '0 6px 10px' : 0 }}>
        <div style={bar('65%', 4)} />
      </div>
    )
  }

  if (type === 'stat_callout') {
    const isCorner = template.id === 'corner_stat'
    return (
      <div style={bg}>
        {isCorner ? (
          <div style={{ position: 'absolute', top: 6, right: 6, borderLeft: '2px solid #3b82f6', background: 'rgba(0,0,0,0.7)', padding: '3px 6px' }}>
            <div style={bar(26, 5)} /><div style={{ height: 2 }} /><div style={bar(18, 2, 0.4)} />
          </div>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <div style={bar('48%', 8)} /><div style={bar('32%', 2, 0.4)} />
          </div>
        )}
      </div>
    )
  }

  if (type === 'chapter_title') {
    const isFull = template.id === 'full_screen_chapter'
    return (
      <div style={{ ...bg, background: isFull ? '#0a0a12' : '#161624', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <div style={bar('48%', 4)} /><div style={bar('36%', 2, 0.4)} />
        {isFull && <div style={{ width: 18, height: 2, background: '#3b82f6', borderRadius: 1, marginTop: 4 }} />}
      </div>
    )
  }

  if (type === 'source_citation') {
    return (
      <div style={bg}>
        <div style={{ position: 'absolute', bottom: 7, left: 8 }}><div style={bar(56, 2, 0.3)} /></div>
      </div>
    )
  }

  if (type === 'background_overlay') {
    const grd = template.id === 'gradient_bottom' ? 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%)'
      : template.id === 'gradient_top' ? 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 40%)'
      : template.id === 'color_tint'   ? 'rgba(30,60,120,0.40)' : 'rgba(0,0,0,0.42)'
    return <div style={{ ...bg, background: grd }} />
  }

  if (type === 'watermark') {
    return (
      <div style={bg}>
        <div style={{ position: 'absolute', top: 7, right: 8 }}><div style={bar(36, 2, 0.25)} /></div>
      </div>
    )
  }

  return <div style={{ ...bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={bar('45%', 3, 0.3)} /></div>
}

// ── OverlayEditor ─────────────────────────────────────────────────────────────
function OverlayEditor({ overlay, onUpdate }) {
  const up = (path, val) => {
    const parts = path.split('.')
    if (parts.length === 1) return onUpdate({ [path]: val })
    const obj = {}; let cur = obj
    for (let i = 0; i < parts.length - 1; i++) { cur[parts[i]] = {}; cur = cur[parts[i]] }
    cur[parts[parts.length - 1]] = val
    onUpdate(obj)
  }

  const t   = overlay.text       || {}
  const bg  = overlay.background || {}
  const acc = overlay.accent     || {}
  const an  = overlay.animation  || {}
  const pos = overlay.position   || {}
  const tim = overlay.timing     || {}
  const type = overlay.type

  const hasText   = !['background_overlay', 'vignette', 'grain', 'color_grade'].includes(type)
  const hasAccent = ['lower_third', 'date_stamp', 'stat_callout'].includes(type)
  const hasBg     = !['kinetic_text', 'stat_callout', 'chapter_title', 'source_citation', 'watermark', 'vignette', 'grain', 'color_grade'].includes(type)
  const hasTwoLines = ['lower_third', 'chapter_title', 'stat_callout'].includes(type)
  const hasPos    = !['background_overlay', 'vignette', 'grain', 'color_grade'].includes(type)
  const isBgOnly  = type === 'background_overlay'
  const isSimple  = ['vignette', 'grain', 'color_grade'].includes(type)

  if (isSimple) {
    if (type === 'color_grade') {
      return <SelectField label="Grade" value={overlay.grade || 'cool_blue'} onChange={v => onUpdate({ grade: v })}
        options={[{ id: 'cool_blue', name: 'Cool Blue' }, { id: 'warm_amber', name: 'Warm Amber' }, { id: 'desaturated', name: 'Desaturated' }, { id: 'neutral', name: 'Neutral' }]} />
    }
    return <SliderInput label="Intensity" value={overlay.intensity ?? 0.45} onChange={v => onUpdate({ intensity: v })} min={0} max={1} />
  }

  return (
    <div>
      {hasText && (
        <>
          <SectionHead>Text</SectionHead>
          {type === 'watermark' ? (
            <TextInput label="Watermark Text" value={t.line1} onChange={v => up('text.line1', v)} placeholder="CHANNEL NAME" />
          ) : hasTwoLines ? (
            <>
              <TextInput label="Line 1" value={t.line1} onChange={v => up('text.line1', v)} placeholder="Person Name / Chapter / Stat" />
              <TextInput label="Line 2" value={t.line2} onChange={v => up('text.line2', v)} placeholder="Title · Company / Subtitle" />
            </>
          ) : (
            <TextInput label="Text" value={t.line1} onChange={v => up('text.line1', v)} />
          )}

          {type !== 'watermark' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                <NumberInput label="Size (px)" value={t.size || 15} onChange={v => up('text.size', v)} min={6} max={200} />
                <SelectField label="Weight" value={t.weight || '500'} onChange={v => up('text.weight', v)}
                  options={['300','400','500','600','700','800','900'].map(w => ({ id: w, name: w }))} />
              </div>
              <ColorInput label="Color" value={t.color} onChange={v => up('text.color', v)} />
              <SelectField label="Font Family" value={t.family || 'Inter'} onChange={v => up('text.family', v)} options={FONT_OPTIONS} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                <SelectField label="Transform" value={t.transform || 'none'} onChange={v => up('text.transform', v)}
                  options={[{ id: 'none', name: 'None' }, { id: 'uppercase', name: 'UPPER' }, { id: 'lowercase', name: 'lower' }]} />
                <div>
                  <span style={label11}>Letter Spacing</span>
                  <input type="text" value={t.letterSpacing || '0em'} onChange={e => up('text.letterSpacing', e.target.value)}
                    style={inputBase} />
                </div>
              </div>
            </>
          )}
          {type === 'watermark' && (
            <>
              <SelectField label="Font Family" value={t.family || 'Inter'} onChange={v => up('text.family', v)} options={FONT_OPTIONS} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                <NumberInput label="Size (px)" value={t.size || 11} onChange={v => up('text.size', v)} min={6} max={32} />
                <ColorInput label="Color" value={t.color || '#ffffff'} onChange={v => up('text.color', v)} />
              </div>
              <SliderInput label="Opacity" value={overlay.opacity ?? 0.18} onChange={v => onUpdate({ opacity: v })} />
            </>
          )}
        </>
      )}

      {hasBg && (
        <>
          <SectionHead>Background</SectionHead>
          <ColorInput label="Color / Gradient" value={bg.color} onChange={v => up('background.color', v)} />
          {!isBgOnly && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              <NumberInput label="Blur (px)" value={bg.blur ?? 0} onChange={v => up('background.blur', v)} min={0} max={40} />
              <NumberInput label="Radius (px)" value={bg.borderRadius ?? 0} onChange={v => up('background.borderRadius', v)} min={0} max={32} />
            </div>
          )}
        </>
      )}

      {hasAccent && (
        <>
          <SectionHead>Accent</SectionHead>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            <ColorInput label="Color" value={acc.color} onChange={v => up('accent.color', v)} />
            <NumberInput label="Width (px)" value={acc.width ?? 3} onChange={v => up('accent.width', v)} min={0} max={20} />
          </div>
          <SelectField label="Position" value={acc.position || 'left'} onChange={v => up('accent.position', v)}
            options={[{ id: 'left', name: 'Left Border' }, { id: 'right', name: 'Right Border' }, { id: 'bottom', name: 'Bottom Border' }]} />
        </>
      )}

      {!isBgOnly && type !== 'watermark' && !isSimple && (
        <>
          <SectionHead>Animation</SectionHead>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            <SelectField label="Enter" value={an.enter || 'fade'} onChange={v => up('animation.enter', v)} options={ENTER_ANIMATIONS} />
            <SelectField label="Exit" value={an.exit || 'fade'} onChange={v => up('animation.exit', v)} options={EXIT_ANIMATIONS} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            <NumberInput label="Duration (frames)" value={an.duration || 20} onChange={v => up('animation.duration', v)} min={1} max={90} />
            <NumberInput label="Delay (frames)" value={an.delay || 0} onChange={v => up('animation.delay', v)} min={0} max={90} />
          </div>
          <SelectField label="Easing" value={an.easing || 'ease_out'} onChange={v => up('animation.easing', v)} options={EASING_OPTIONS} />
        </>
      )}

      {hasPos && type !== 'watermark' && !isSimple && (
        <>
          <SectionHead>Position</SectionHead>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            <SelectField label="X Axis" value={pos.x || 'left'} onChange={v => up('position.x', v)}
              options={[{ id: 'left', name: 'Left' }, { id: 'center', name: 'Center' }, { id: 'right', name: 'Right' }]} />
            <SelectField label="Y Axis" value={pos.y || 'bottom'} onChange={v => up('position.y', v)}
              options={[{ id: 'top', name: 'Top' }, { id: 'center', name: 'Center' }, { id: 'bottom', name: 'Bottom' }]} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            <NumberInput label="Offset X (px)" value={pos.offsetX ?? 48} onChange={v => up('position.offsetX', v)} min={0} max={400} />
            <NumberInput label="Offset Y (px)" value={pos.offsetY ?? 48} onChange={v => up('position.offsetY', v)} min={0} max={400} />
          </div>
        </>
      )}

      {type === 'watermark' && (
        <>
          <SectionHead>Position</SectionHead>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            <SelectField label="X" value={pos.x || 'right'} onChange={v => up('position.x', v)}
              options={[{ id: 'left', name: 'Left' }, { id: 'right', name: 'Right' }]} />
            <SelectField label="Y" value={pos.y || 'top'} onChange={v => up('position.y', v)}
              options={[{ id: 'top', name: 'Top' }, { id: 'bottom', name: 'Bottom' }]} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            <NumberInput label="Offset X" value={pos.offsetX ?? 32} onChange={v => up('position.offsetX', v)} min={0} max={200} />
            <NumberInput label="Offset Y" value={pos.offsetY ?? 28} onChange={v => up('position.offsetY', v)} min={0} max={200} />
          </div>
        </>
      )}

      {!isSimple && type !== 'watermark' && (
        <>
          <SectionHead>Timing</SectionHead>
          <NumberInput label="Appear at (seconds from scene start — 0 = immediately)" value={tim.appearAt ?? 0}
            onChange={v => up('timing.appearAt', v)} min={0} max={30} step={0.5} />
          {!isBgOnly && (
            <SliderInput label="Opacity" value={overlay.opacity ?? 1} onChange={v => onUpdate({ opacity: v })} />
          )}
        </>
      )}
    </div>
  )
}

// ── Main OverlayStudio ────────────────────────────────────────────────────────
export default function OverlayStudio({
  scene,
  onClose,
  onSave,
  imagePaths = {},
  selectedClips = {},
  globalSettings = {},
  brand = {},
}) {
  const [activeType, setActiveType] = useState('lower_third')

  // Two-stage state: previewOverlays updates live as the user edits;
  // committedOverlays only advances when the user clicks Apply.
  const [committedOverlays, setCommittedOverlays] = useState(
    () => (scene?.overlays || []).map(normalizeOverlay)
  )
  const [previewOverlays, setPreviewOverlays] = useState(
    () => (scene?.overlays || []).map(normalizeOverlay)
  )
  const [selectedId,  setSelectedId]  = useState(null)
  const [justApplied, setJustApplied] = useState(false)

  const hasUncommittedChanges = JSON.stringify(previewOverlays) !== JSON.stringify(committedOverlays)
  const selectedOverlay = previewOverlays.find(o => o.id === selectedId) || null

  // Preview always reads live from previewOverlays — the right-panel player reflects
  // every keystroke without touching the main video until Apply is clicked.
  const previewScene = useMemo(() => ({
    ...scene,
    overlays: previewOverlays.filter(o => o.status === 'accepted' || !o.status),
  }), [scene, previewOverlays])

  const templates = getTemplatesForType(activeType)

  // All mutations go to previewOverlays only — committed state is untouched
  const handleAddTemplate = (tpl) => {
    const defaults = JSON.parse(JSON.stringify(tpl.defaults))
    if (brand?.accentColor && defaults.accent) defaults.accent.color = brand.accentColor
    if (brand?.fontFamily  && defaults.text)   defaults.text.family  = brand.fontFamily
    const newOverlay = { id: genId(), type: activeType, ...defaults }
    setPreviewOverlays(prev => [...prev, newOverlay])
    setSelectedId(newOverlay.id)
  }

  const handleUpdateOverlay = (id, patch) =>
    setPreviewOverlays(prev => prev.map(o => o.id === id ? deepMerge(o, patch) : o))

  const handleDeleteOverlay = (id) => {
    setPreviewOverlays(prev => prev.filter(o => o.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  // Apply — lock preview into committed state and push to parent
  const handleApply = () => {
    const snapshot = JSON.parse(JSON.stringify(previewOverlays))
    setCommittedOverlays(snapshot)
    onSave(scene.scene_id, previewOverlays)
    setJustApplied(true)
    setTimeout(() => setJustApplied(false), 2000)
  }

  // Reset — discard all preview changes back to last committed state
  const handleReset = () => {
    setPreviewOverlays(JSON.parse(JSON.stringify(committedOverlays)))
    setSelectedId(null)
  }

  // Close with unsaved-changes guard
  const handleClose = () => {
    if (hasUncommittedChanges) {
      const confirmed = window.confirm('You have unsaved overlay changes. Close without applying?')
      if (!confirmed) return
    }
    onClose()
  }

  // Helpers for committed-vs-preview comparison in the overlays list
  const isNewOverlay = (o) => !committedOverlays.find(c => c.id === o.id)
  const isModifiedOverlay = (o) => {
    const committed = committedOverlays.find(c => c.id === o.id)
    return committed ? JSON.stringify(o) !== JSON.stringify(committed) : false
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: '#0d0d16',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>

      {/* Pulse keyframes */}
      <style>{`@keyframes _ovPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '12px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        gap: 10, flexShrink: 0,
        background: 'rgba(0,0,0,0.35)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: '-0.01em' }}>Overlay Studio</span>
        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>—</span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Scene {scene?.scene_id || '?'} — {(scene?.script_excerpt || '').slice(0, 68)}
          {(scene?.script_excerpt || '').length > 68 ? '…' : ''}
        </span>

        {/* Live preview indicator */}
        {hasUncommittedChanges && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 10px',
            background: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.22)',
            borderRadius: 20, flexShrink: 0,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#fbbf24',
              animation: '_ovPulse 1.5s infinite',
            }} />
            <span style={{ color: '#fbbf24', fontSize: 11, whiteSpace: 'nowrap' }}>
              Live preview — not yet applied
            </span>
          </div>
        )}

        {/* Applied feedback */}
        {justApplied && !hasUncommittedChanges && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 10px',
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.22)',
            borderRadius: 20, flexShrink: 0,
          }}>
            <span style={{ color: '#4ade80', fontSize: 11 }}>✓ Applied to video</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {hasUncommittedChanges && (
            <button
              onClick={handleReset}
              style={{
                padding: '6px 13px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.11)',
                borderRadius: 6, color: 'rgba(255,255,255,0.55)',
                fontSize: 12, cursor: 'pointer',
              }}
            >
              ↺ Reset
            </button>
          )}

          <button
            onClick={handleApply}
            disabled={!hasUncommittedChanges}
            style={{
              padding: '6px 18px',
              background: hasUncommittedChanges ? '#7c3aed' : 'rgba(124,58,237,0.18)',
              border: 'none', borderRadius: 6,
              color: hasUncommittedChanges ? '#fff' : 'rgba(255,255,255,0.28)',
              fontSize: 13, fontWeight: 600,
              cursor: hasUncommittedChanges ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s',
            }}
          >
            {justApplied ? '✓ Applied' : 'Apply to video'}
          </button>

          <button
            onClick={handleClose}
            style={{
              padding: '6px 13px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 6, color: 'rgba(255,255,255,0.55)',
              fontSize: 12, cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Left panel ── */}
        <div style={{
          width: 400, flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>

          {/* Type tabs */}
          <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>Overlay Type</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {OVERLAY_TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveType(tab.id)}
                  style={{
                    background: activeType === tab.id ? 'rgba(124,58,237,0.18)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${activeType === tab.id ? 'rgba(124,58,237,0.45)' : 'rgba(255,255,255,0.08)'}`,
                    color: activeType === tab.id ? '#a78bfa' : 'rgba(255,255,255,0.42)',
                    borderRadius: 5, padding: '3px 8px', fontSize: 11, cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}>
                  <span style={{ marginRight: 3, fontSize: 10 }}>{tab.icon}</span>{tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable left content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 24px' }}>

            {/* Template picker */}
            {templates.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                  Templates — click to add
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 7 }}>
                  {templates.map(tpl => (
                    <button key={tpl.id} onClick={() => handleAddTemplate(tpl)} title={tpl.description}
                      style={{
                        background: 'none', border: '1px solid rgba(255,255,255,0.09)',
                        borderRadius: 7, cursor: 'pointer', padding: 0, overflow: 'hidden',
                        display: 'flex', flexDirection: 'column', textAlign: 'left',
                        transition: 'border-color 0.12s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(124,58,237,0.55)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'}>
                      <div style={{ height: 60, width: '100%' }}>
                        <TemplatePreview template={tpl} type={activeType} />
                      </div>
                      <div style={{ padding: '5px 8px 7px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>{tpl.name}</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 1, lineHeight: 1.3 }}>{tpl.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {templates.length === 0 && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginBottom: 18, textAlign: 'center', padding: '12px 0' }}>
                Use the controls below to add a {activeType.replace(/_/g, ' ')} overlay
              </div>
            )}

            {/* Active overlays list — shows committed/modified/new badges */}
            {previewOverlays.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 7 }}>
                  Active ({previewOverlays.length})
                </div>
                {previewOverlays.map(o => {
                  const tab      = OVERLAY_TABS.find(t => t.id === o.type)
                  const isActive = o.id === selectedId
                  const isNew    = isNewOverlay(o)
                  const isEdited = !isNew && isModifiedOverlay(o)
                  const label    = o.text?.line1 || (typeof o.text === 'string' ? o.text : '') || o.line1 || tab?.label || o.type

                  const borderColor = isActive
                    ? 'rgba(124,58,237,0.38)'
                    : (isNew || isEdited) ? 'rgba(251,191,36,0.22)'
                    : 'rgba(255,255,255,0.07)'

                  return (
                    <div key={o.id} onClick={() => setSelectedId(isActive ? null : o.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '6px 9px', borderRadius: 6, cursor: 'pointer', marginBottom: 3,
                        background: isActive ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${borderColor}`,
                        transition: 'all 0.12s',
                      }}>
                      <span style={{ fontSize: 12, opacity: 0.55 }}>{tab?.icon || '▭'}</span>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 12, color: isActive ? '#a78bfa' : 'rgba(255,255,255,0.68)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {label}
                          </span>
                          {isNew && (
                            <span style={{ fontSize: 9, padding: '1px 4px', background: 'rgba(59,130,246,0.2)', color: '#93c5fd', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                              new
                            </span>
                          )}
                          {isEdited && (
                            <span style={{ fontSize: 9, padding: '1px 4px', background: 'rgba(251,191,36,0.15)', color: '#fbbf24', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                              edited
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)' }}>{tab?.label || o.type}</div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); handleDeleteOverlay(o.id) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.22)', padding: 3, display: 'flex', borderRadius: 4, flexShrink: 0 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.22)'}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Editor for selected overlay */}
            {selectedOverlay && (
              <div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                  Edit — {OVERLAY_TABS.find(t => t.id === selectedOverlay.type)?.label || selectedOverlay.type}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', marginBottom: 10, letterSpacing: '0.01em' }}>
                  Preview updates live · click Apply to save to video
                </div>
                <OverlayEditor
                  key={selectedId}
                  overlay={selectedOverlay}
                  onUpdate={patch => handleUpdateOverlay(selectedId, patch)}
                />
              </div>
            )}

            {previewOverlays.length === 0 && templates.length > 0 && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.18)', textAlign: 'center', padding: '16px 0' }}>
                Pick a template above to start
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel — live preview ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 24, gap: 14, overflow: 'hidden', minWidth: 0 }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Live Preview</div>
            <div style={{ fontSize: 10, letterSpacing: '0.03em' }}>
              {hasUncommittedChanges && (
                <span style={{ color: '#fbbf24' }}>● Showing unsaved changes</span>
              )}
              {!hasUncommittedChanges && committedOverlays.length > 0 && (
                <span style={{ color: '#4ade80' }}>✓ Showing applied overlays</span>
              )}
              {!hasUncommittedChanges && committedOverlays.length === 0 && (
                <span style={{ color: 'rgba(255,255,255,0.25)' }}>No overlays added</span>
              )}
            </div>
          </div>

          {!imagePaths[scene?.scene_id] && (
            <div style={{ fontSize: 11, color: 'rgba(255,200,100,0.6)', background: 'rgba(255,180,0,0.07)', border: '1px solid rgba(255,180,0,0.15)', borderRadius: 6, padding: '8px 12px' }}>
              Scene image not yet generated — generate the scene first to preview overlays on the actual footage.
            </div>
          )}

          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '100%', maxWidth: 800 }}>
              <div style={{
                borderRadius: 10, overflow: 'hidden',
                border: hasUncommittedChanges
                  ? '1px solid rgba(251,191,36,0.35)'
                  : justApplied
                    ? '1px solid rgba(34,197,94,0.35)'
                    : '1px solid rgba(255,255,255,0.06)',
                transition: 'border-color 0.3s',
              }}>
                <VideoPlayer
                  scenes={[previewScene]}
                  imagePaths={imagePaths}
                  selectedClips={selectedClips}
                  globalSettings={globalSettings}
                  audioSpecs={[]}
                  autoPlay
                  loop
                />
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>
              Click player to play · overlay animations preview in real time
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
