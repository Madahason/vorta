import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

function LicensePill({ license }) {
  const isGreen = license === 'creative_commons' || license === 'public_domain'
  const isAmber = license === 'fair_use'
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 4,
      background: isGreen ? 'rgba(34,197,94,0.15)' : isAmber ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.06)',
      color: isGreen ? '#22c55e' : isAmber ? '#eab308' : 'rgba(255,255,255,0.35)',
    }}>
      {license.replace(/_/g, ' ')}
    </span>
  )
}

export function ClipPreviewModal({ clip, onClose }) {
  const videoRef = useRef(null)
  const filename = clip.file.split('/').pop()
  const videoSrc = `/library/clips/${filename}`

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.92)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{ maxWidth: 800, width: '100%', padding: 24, position: 'relative' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 0, right: 24,
            background: 'rgba(255,255,255,0.10)',
            border: 'none', color: 'white',
            width: 36, height: 36, borderRadius: '50%',
            cursor: 'pointer', fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1,
          }}
        >
          <X size={16} />
        </button>

        <video
          ref={videoRef}
          src={videoSrc}
          controls
          autoPlay
          style={{ width: '100%', aspectRatio: '16/9', borderRadius: 8, background: '#000', display: 'block' }}
          onError={() => console.error('[ClipPreviewModal] video load error:', videoSrc)}
        />

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: 'white', fontSize: 16, fontWeight: 600 }}>
            {clip.title || clip.file.split('/').pop()}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {clip.duration > 0 && (
              <span style={{ color: 'rgba(255,255,255,0.40)', fontSize: 12 }}>{clip.duration}s</span>
            )}
            {clip.duration > 0 && <span style={{ color: 'rgba(255,255,255,0.20)', fontSize: 12 }}>·</span>}
            <span style={{ color: 'rgba(255,255,255,0.40)', fontSize: 12 }}>{clip.category}</span>
            <span style={{ color: 'rgba(255,255,255,0.20)', fontSize: 12 }}>·</span>
            <LicensePill license={clip.license || 'unknown'} />
          </div>
          {clip.tags?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {clip.tags.map(tag => (
                <span key={tag} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 4,
                  background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.50)',
                }}>{tag}</span>
              ))}
            </div>
          )}
          {clip.description && (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5, marginTop: 2 }}>
              {clip.description}
            </p>
          )}
          {clip.warning && (
            <div style={{
              marginTop: 4, padding: '8px 12px',
              background: 'rgba(234,179,8,0.10)',
              border: '1px solid rgba(234,179,8,0.30)',
              borderRadius: 6, color: '#eab308', fontSize: 12,
            }}>
              ⚠ {clip.warning}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
