import { useState } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function StarRating({ historyId, currentRating, onRated }) {
  const [hovering, setHovering] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleRate(stars) {
    if (!historyId || saving) return
    setSaving(true)
    try {
      await fetch(`${API}/api/script-writer/history/${historyId}/rating`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: stars })
      })
      onRated(stars)
    } catch {}
    setSaving(false)
  }

  const display = hovering || currentRating || 0

  return (
    <div className="vorta-sw-star-rating">
      <span className="vorta-sw-star-label">Rate this script:</span>
      <div className="vorta-sw-stars">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            className={`vorta-sw-star ${star <= display ? 'active' : ''} ${saving ? 'disabled' : ''}`}
            onMouseEnter={() => setHovering(star)}
            onMouseLeave={() => setHovering(null)}
            onClick={() => handleRate(star)}
            disabled={saving}
          >
            ★
          </button>
        ))}
      </div>
      {currentRating && (
        <span className="vorta-sw-star-saved">
          {currentRating >= 4 ? '✓ Will improve future generations' : '✓ Saved'}
        </span>
      )}
    </div>
  )
}
