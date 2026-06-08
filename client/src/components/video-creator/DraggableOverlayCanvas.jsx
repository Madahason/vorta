import Moveable from 'react-moveable'
import { useRef, useState, useEffect, useCallback } from 'react'

// Scale from 1920×1080 coordinate space to display canvas pixels
function toCanvasPos(overlay, scaleX, scaleY, canvasWidth, canvasHeight) {
  const pos = overlay.position || {}
  const rawX = pos.offsetX ?? 48
  const rawY = pos.offsetY ?? 48

  let x = rawX * scaleX
  let y = rawY * scaleY

  if (pos.x === 'right')  x = canvasWidth  - x - 240 * scaleX
  if (pos.x === 'center') x = canvasWidth  / 2 - 120 * scaleX
  if (pos.y === 'bottom') y = canvasHeight - y -  60 * scaleY
  if (pos.y === 'center') y = canvasHeight / 2 -  30 * scaleY

  return { x: Math.max(0, x), y: Math.max(0, y) }
}

// Convert display canvas position back to 1920×1080 coordinate system
function toVideoPos(canvasX, canvasY, scaleX, scaleY, canvasWidth, canvasHeight) {
  const xFrac = canvasX / canvasWidth
  const yFrac = canvasY / canvasHeight

  let xAlign = 'left', yAlign = 'top'
  let offsetX = Math.round(canvasX / scaleX)
  let offsetY = Math.round(canvasY / scaleY)

  if (xFrac > 0.6) {
    xAlign  = 'right'
    offsetX = Math.round((canvasWidth - canvasX) / scaleX)
  } else if (xFrac > 0.35) {
    xAlign  = 'center'
    offsetX = 0
  }

  if (yFrac > 0.6) {
    yAlign  = 'bottom'
    offsetY = Math.round((canvasHeight - canvasY) / scaleY)
  } else if (yFrac > 0.35) {
    yAlign  = 'center'
    offsetY = 0
  }

  return { x: xAlign, y: yAlign, offsetX, offsetY }
}

// ── Mini visual representation of each overlay type ────────────────────────────
function OverlayElement({ overlay, scale, brand, isSelected }) {
  const accent   = overlay.accent?.color || brand?.accentColor || '#3b82f6'
  const textCol  = overlay.text?.color   || '#ffffff'
  const bgCol    = overlay.background?.color || 'rgba(0,0,0,0.65)'
  const fs       = Math.max(8, (overlay.text?.size || 15) * scale)
  const fs2      = Math.max(7, (overlay.text?.size || 15) * scale * 0.75)
  const sel      = isSelected ? '2px solid rgba(59,130,246,0.85)' : '1px solid rgba(255,255,255,0.22)'
  const shadow   = isSelected ? '0 0 0 3px rgba(59,130,246,0.25)' : 'none'
  const rad      = Math.max(2, (overlay.background?.borderRadius || 4) * scale)

  const base = { border: sel, boxShadow: shadow, borderRadius: rad, whiteSpace: 'nowrap', transition: 'border 0.1s, box-shadow 0.1s' }

  switch (overlay.type) {
    case 'lower_third':
      return (
        <div style={{ ...base, background: bgCol, display: 'flex', alignItems: 'stretch', overflow: 'hidden', minWidth: 100 * scale }}>
          {(overlay.accent?.width ?? 3) > 0 && overlay.accent?.position === 'left' && (
            <div style={{ width: Math.max(2, (overlay.accent.width || 3) * scale), background: accent, flexShrink: 0 }} />
          )}
          <div style={{ padding: `${4 * scale}px ${7 * scale}px` }}>
            <div style={{ color: textCol, fontSize: fs, fontWeight: overlay.text?.weight || '600', lineHeight: 1.2 }}>
              {overlay.text?.line1 || 'Name'}
            </div>
            {overlay.text?.line2 && (
              <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: fs2, marginTop: 2 * scale }}>
                {overlay.text.line2}
              </div>
            )}
          </div>
        </div>
      )

    case 'date_stamp':
      return (
        <div style={{ ...base, background: bgCol, padding: `${3 * scale}px ${9 * scale}px`, color: textCol, fontSize: Math.max(7, 11 * scale), textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {overlay.text?.line1 || 'Location · Year'}
        </div>
      )

    case 'kinetic_text':
      return (
        <div style={{ ...base, background: 'transparent', color: textCol, fontSize: Math.max(10, (overlay.text?.size || 48) * scale * 0.5), fontWeight: '800', textAlign: 'center', padding: `${3 * scale}px`, textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}>
          {overlay.text?.line1 || 'KEY TEXT'}
        </div>
      )

    case 'stat_callout':
      return (
        <div style={{ ...base, background: bgCol, padding: `${5 * scale}px ${9 * scale}px`, textAlign: 'center', minWidth: 70 * scale }}>
          <div style={{ color: accent, fontSize: Math.max(12, (overlay.text?.size || 64) * scale * 0.35), fontWeight: '800' }}>
            {overlay.text?.line1 || '$3T'}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: Math.max(7, 11 * scale) }}>
            {overlay.text?.line2 || 'context'}
          </div>
        </div>
      )

    case 'chapter_title':
      return (
        <div style={{ ...base, background: bgCol, padding: `${7 * scale}px ${13 * scale}px`, textAlign: 'center', minWidth: 120 * scale }}>
          <div style={{ color: accent, fontSize: Math.max(8, 12 * scale), textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {overlay.text?.line1 || 'Chapter 1'}
          </div>
          <div style={{ color: textCol, fontSize: Math.max(10, 19 * scale), fontWeight: '700', marginTop: 2 * scale }}>
            {overlay.text?.line2 || 'The Beginning'}
          </div>
        </div>
      )

    case 'source_citation':
      return (
        <div style={{ ...base, background: 'rgba(0,0,0,0.42)', padding: `${2 * scale}px ${6 * scale}px`, color: 'rgba(255,255,255,0.5)', fontSize: Math.max(7, 10 * scale) }}>
          {overlay.text?.line1 || 'Source: Publication'}
        </div>
      )

    default:
      return (
        <div style={{ ...base, background: 'rgba(59,130,246,0.2)', padding: `${4 * scale}px ${9 * scale}px`, color: textCol, fontSize: Math.max(8, 12 * scale) }}>
          {overlay.type || 'overlay'}
        </div>
      )
  }
}

// ── Main draggable canvas component ───────────────────────────────────────────
export function DraggableOverlayCanvas({ scene, overlays, selectedOverlayId, onSelectOverlay, onUpdatePosition, brand }) {
  const containerRef = useRef(null)
  const moveableRef  = useRef(null)
  const [size, setSize] = useState({ width: 800, height: 450 })
  const [dragging, setDragging] = useState(false)

  // Observe container size for responsive scaling
  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = e.contentRect.width
        if (w > 0) setSize({ width: w, height: w * (9 / 16) })
      }
    })
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  const scaleX = size.width  / 1920
  const scaleY = size.height / 1080

  const selectedOverlay = overlays.find(o => o.id === selectedOverlayId) || null
  const selectedPos     = selectedOverlay ? toCanvasPos(selectedOverlay, scaleX, scaleY, size.width, size.height) : null

  // Re-sync Moveable target when selectedOverlayId changes
  useEffect(() => {
    if (moveableRef.current) {
      setTimeout(() => moveableRef.current?.updateRect(), 50)
    }
  }, [selectedOverlayId, size])

  const handleDragEnd = useCallback(({ target, lastEvent }) => {
    if (!lastEvent || !selectedOverlayId) return
    setDragging(false)
    const rect   = containerRef.current?.getBoundingClientRect()
    const left   = parseFloat(target.style.left) || 0
    const top    = parseFloat(target.style.top)  || 0
    const newPos = toVideoPos(left, top, scaleX, scaleY, size.width, size.height)
    onUpdatePosition(selectedOverlayId, newPos)
  }, [selectedOverlayId, scaleX, scaleY, size, onUpdatePosition]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedTarget = selectedOverlayId
    ? document.getElementById(`ovcanvas-${selectedOverlayId}`)
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Status line */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Drag overlays to reposition
        </span>
        {selectedOverlay && (
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.42)' }}>
            {selectedOverlay.text?.line1 || selectedOverlay.type} ·
            {' '}{selectedOverlay.position?.x} {selectedOverlay.position?.y}
            {' '}({selectedOverlay.position?.offsetX ?? 0}px, {selectedOverlay.position?.offsetY ?? 0}px)
          </span>
        )}
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        style={{
          position:    'relative',
          width:       '100%',
          aspectRatio: '16/9',
          borderRadius: 8,
          overflow:    'hidden',
          border:      `1px solid ${dragging ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.10)'}`,
          background:  '#000',
          transition:  'border-color 0.2s',
        }}
      >
        {/* Scene image */}
        {scene?.image_path && (
          <img
            src={scene.image_path}
            alt=""
            draggable={false}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
          />
        )}

        {/* Placeholder gradient when no image */}
        {!scene?.image_path && (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #0a0a14 0%, #14142a 100%)' }} />
        )}

        {/* Rule-of-thirds guides — shown while dragging */}
        {dragging && [1/3, 2/3].map(r => (
          <div key={`h${r}`} style={{ position: 'absolute', top: `${r * 100}%`, left: 0, right: 0, height: 0, borderTop: '1px dashed rgba(255,255,255,0.2)', pointerEvents: 'none', zIndex: 1 }} />
        ))}
        {dragging && [1/3, 2/3].map(r => (
          <div key={`v${r}`} style={{ position: 'absolute', left: `${r * 100}%`, top: 0, bottom: 0, width: 0, borderLeft: '1px dashed rgba(255,255,255,0.2)', pointerEvents: 'none', zIndex: 1 }} />
        ))}

        {/* Overlay elements */}
        {overlays.map(overlay => {
          const pos        = toCanvasPos(overlay, scaleX, scaleY, size.width, size.height)
          const isSelected = overlay.id === selectedOverlayId
          return (
            <div
              key={overlay.id}
              id={`ovcanvas-${overlay.id}`}
              onClick={() => onSelectOverlay(overlay.id === selectedOverlayId ? null : overlay.id)}
              style={{
                position: 'absolute',
                left:     pos.x,
                top:      pos.y,
                cursor:   'grab',
                userSelect: 'none',
                zIndex:   isSelected ? 20 : 10,
              }}
            >
              <OverlayElement overlay={overlay} scale={scaleX} brand={brand} isSelected={isSelected} />
            </div>
          )
        })}

        {/* Moveable handles on the selected overlay */}
        {selectedTarget && selectedPos && (
          <Moveable
            ref={moveableRef}
            target={selectedTarget}
            draggable
            resizable={false}
            rotatable={false}
            snappable
            snapThreshold={6}
            bounds={{ left: 0, top: 0, right: size.width, bottom: size.height }}
            onDragStart={() => setDragging(true)}
            onDrag={({ target, left, top }) => {
              target.style.left = `${left}px`
              target.style.top  = `${top}px`
            }}
            onDragEnd={handleDragEnd}
            renderDirections={['nw', 'ne', 'sw', 'se']}
            edge={false}
            origin={false}
          />
        )}
      </div>

      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', margin: 0 }}>
        Click an overlay to select · drag to reposition · rule-of-thirds guides appear while dragging
      </p>
    </div>
  )
}
