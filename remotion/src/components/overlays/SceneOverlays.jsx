import LowerThird        from './LowerThird'
import DateStamp         from './DateStamp'
import KineticText       from './KineticText'
import StatCallout       from './StatCallout'
import ChapterTitle      from './ChapterTitle'
import SourceCitation    from './SourceCitation'
import BackgroundOverlay from './BackgroundOverlay'
import Watermark         from './Watermark'

const COMPONENTS = {
  lower_third:        LowerThird,
  date_stamp:         DateStamp,
  kinetic_text:       KineticText,
  stat_callout:       StatCallout,
  chapter_title:      ChapterTitle,
  source_citation:    SourceCitation,
  background_overlay: BackgroundOverlay,
  watermark:          Watermark,
}

// SceneOverlays — renders every accepted overlay for a scene on top of its visual.
//
// Only overlays with status "accepted" render (no-status overlays also render, for backward
// compatibility with older scene data / hand-authored test fixtures). "suggested" and
// "rejected" overlays never render — they only exist for the client review UI.
//
// transitionInSeconds is the duration of the crossfade/dip fading THIS scene in. Each overlay's
// appearAt is clamped up to that value so no overlay pops on while the scene is still fading in
// from the previous shot — the "transition-clamped appearAt" behaviour. This is applied here at
// render time and is completely independent of when/how the overlay was generated: it reads the
// overlay's own timing and the scene's incoming transition, nothing else.
export default function SceneOverlays({ overlays = [], transitionInSeconds = 0 }) {
  const delay = Math.max(0, transitionInSeconds || 0)

  return overlays
    .filter(o => o && (o.status === 'accepted' || !o.status))
    .map((o, i) => {
      const Component = COMPONENTS[o.type]
      if (!Component) return null

      const rawAppearAt = o.timing?.appearAt ?? 0
      const clamped = { ...o, timing: { ...o.timing, appearAt: Math.max(rawAppearAt, delay) } }

      return <Component key={o.id || i} overlay={clamped} />
    })
}
