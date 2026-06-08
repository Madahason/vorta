import { loadFont as loadInter }      from '@remotion/google-fonts/Inter'
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat'

const { fontFamily: interFamily }      = loadInter()
const { fontFamily: montserratFamily } = loadMontserrat()

const FONT_MAP = {
  'Inter':      interFamily,
  'Montserrat': montserratFamily,
}

export default function Watermark({ overlay = {} }) {
  const t   = overlay.text     || {}
  const pos = overlay.position || {}

  const text    = t.line1 || ''
  const color   = t.color || '#ffffff'
  const size    = t.size  || 11
  const weight  = t.weight || '600'
  const spacing = t.letterSpacing || '0.15em'
  const transform = t.transform || 'uppercase'
  const family  = FONT_MAP[t.family || 'Inter'] || interFamily
  const opacity = overlay.opacity ?? 0.18

  const { x = 'right', y = 'top', offsetX = 32, offsetY = 28 } = pos
  const posStyle = {}
  if (x === 'left')  posStyle.left  = offsetX
  else               posStyle.right = offsetX
  if (y === 'top')   posStyle.top   = offsetY
  else               posStyle.bottom = offsetY

  if (!text) return null

  return (
    <div style={{
      position: 'absolute', ...posStyle,
      color, fontSize: size, fontWeight: weight,
      fontFamily: family,
      letterSpacing: spacing,
      textTransform: transform,
      opacity,
      userSelect: 'none',
      pointerEvents: 'none',
    }}>
      {text}
    </div>
  )
}
