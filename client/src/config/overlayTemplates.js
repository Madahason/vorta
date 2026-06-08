export const LOWER_THIRD_TEMPLATES = [
  {
    id: 'minimal_line', name: 'Minimal Line',
    description: 'Wendover / MagnatesMedia style — clean and professional',
    defaults: {
      template: 'minimal_line',
      text: { line1: 'Person Name', line2: 'Title · Company', color: '#ffffff', size: 15, weight: '500', family: 'Inter', letterSpacing: '0.02em', transform: 'none' },
      background: { color: 'rgba(0,0,0,0)', blur: 0, borderRadius: 0 },
      accent: { color: '#3b82f6', width: 3, position: 'left' },
      animation: { enter: 'slide_left', exit: 'slide_left', duration: 18, easing: 'spring', delay: 0 },
      position: { x: 'left', y: 'bottom', offsetX: 48, offsetY: 72 },
      timing: { appearAt: 0 }, opacity: 1,
    },
  },
  {
    id: 'color_block', name: 'Color Block',
    description: 'News documentary style — bold and authoritative',
    defaults: {
      template: 'color_block',
      text: { line1: 'Person Name', line2: 'Title · Company', color: '#ffffff', size: 15, weight: '700', family: 'Inter', letterSpacing: '0em', transform: 'none' },
      background: { color: 'rgba(0,0,0,0.85)', blur: 0, borderRadius: 0 },
      accent: { color: '#3b82f6', width: 4, position: 'left' },
      animation: { enter: 'slide_left', exit: 'fade', duration: 14, easing: 'spring', delay: 0 },
      position: { x: 'left', y: 'bottom', offsetX: 0, offsetY: 60 },
      timing: { appearAt: 0 }, opacity: 1,
    },
  },
  {
    id: 'underline_reveal', name: 'Underline Reveal',
    description: 'Modern editorial style',
    defaults: {
      template: 'underline_reveal',
      text: { line1: 'Person Name', line2: 'Title · Company', color: '#ffffff', size: 16, weight: '600', family: 'Inter', letterSpacing: '0.05em', transform: 'none' },
      background: { color: 'rgba(0,0,0,0)', blur: 0, borderRadius: 0 },
      accent: { color: '#3b82f6', width: 2, position: 'bottom' },
      animation: { enter: 'slide_up', exit: 'fade', duration: 20, easing: 'spring', delay: 0 },
      position: { x: 'left', y: 'bottom', offsetX: 48, offsetY: 72 },
      timing: { appearAt: 0 }, opacity: 1,
    },
  },
  {
    id: 'frosted_glass', name: 'Frosted Glass',
    description: 'Premium modern style — glassmorphism',
    defaults: {
      template: 'frosted_glass',
      text: { line1: 'Person Name', line2: 'Title · Company', color: '#ffffff', size: 15, weight: '500', family: 'Inter', letterSpacing: '0.01em', transform: 'none' },
      background: { color: 'rgba(255,255,255,0.08)', blur: 12, borderRadius: 8 },
      accent: { color: '#ffffff', width: 1, position: 'left' },
      animation: { enter: 'fade', exit: 'fade', duration: 20, easing: 'ease_out', delay: 0 },
      position: { x: 'left', y: 'bottom', offsetX: 48, offsetY: 72 },
      timing: { appearAt: 0 }, opacity: 1,
    },
  },
  {
    id: 'split_reveal', name: 'Split Reveal',
    description: 'Corporate documentary — two-line stagger',
    defaults: {
      template: 'split_reveal',
      text: { line1: 'Person Name', line2: 'Title · Company', color: '#ffffff', size: 15, weight: '600', family: 'Inter', letterSpacing: '0em', transform: 'none' },
      background: { color: 'rgba(0,0,0,0.65)', blur: 8, borderRadius: 4 },
      accent: { color: '#3b82f6', width: 3, position: 'left' },
      animation: { enter: 'slide_left', exit: 'fade', duration: 22, easing: 'spring', delay: 0 },
      position: { x: 'left', y: 'bottom', offsetX: 48, offsetY: 72 },
      timing: { appearAt: 0 }, opacity: 1,
    },
  },
]

export const DATE_STAMP_TEMPLATES = [
  {
    id: 'minimal_pill', name: 'Minimal Pill',
    description: 'Clean pill badge — bottom right',
    defaults: {
      template: 'minimal_pill',
      text: { line1: 'New York · 2024', color: 'rgba(255,255,255,0.85)', size: 11, weight: '500', family: 'Inter', transform: 'uppercase', letterSpacing: '0.12em' },
      background: { color: 'rgba(0,0,0,0.50)', blur: 0, borderRadius: 20 },
      accent: { color: 'transparent', width: 0, position: 'left' },
      animation: { enter: 'fade', exit: 'fade', duration: 12, easing: 'linear', delay: 0 },
      position: { x: 'right', y: 'bottom', offsetX: 48, offsetY: 48 },
      timing: { appearAt: 0 }, opacity: 1,
    },
  },
  {
    id: 'corner_stamp', name: 'Corner Stamp',
    description: 'Subtle text stamp — no background',
    defaults: {
      template: 'corner_stamp',
      text: { line1: 'New York · 2024', color: 'rgba(255,255,255,0.55)', size: 11, weight: '400', family: 'Inter', transform: 'uppercase', letterSpacing: '0.15em' },
      background: { color: 'rgba(0,0,0,0)', blur: 0, borderRadius: 0 },
      accent: { color: 'transparent', width: 0, position: 'left' },
      animation: { enter: 'fade', exit: 'fade', duration: 10, easing: 'linear', delay: 0 },
      position: { x: 'left', y: 'bottom', offsetX: 48, offsetY: 48 },
      timing: { appearAt: 0 }, opacity: 1,
    },
  },
]

export const KINETIC_TEXT_TEMPLATES = [
  {
    id: 'center_impact', name: 'Center Impact',
    description: 'Large full-screen statement',
    defaults: {
      template: 'center_impact',
      text: { line1: 'KEY STAT OR PHRASE', color: '#ffffff', size: 64, weight: '800', family: 'Inter', letterSpacing: '-0.02em', transform: 'none' },
      background: { color: 'rgba(0,0,0,0)', blur: 0, borderRadius: 0 },
      accent: { color: '#3b82f6', width: 0, position: 'bottom' },
      animation: { enter: 'scale_in', exit: 'fade', duration: 20, easing: 'spring', delay: 0 },
      position: { x: 'center', y: 'center', offsetX: 0, offsetY: 0 },
      timing: { appearAt: 0 }, opacity: 1,
    },
  },
  {
    id: 'word_by_word', name: 'Word by Word',
    description: 'Each word appears in sequence',
    defaults: {
      template: 'word_by_word',
      text: { line1: 'Each word appears one at a time', color: '#ffffff', size: 42, weight: '700', family: 'Inter', letterSpacing: '0em', transform: 'none' },
      background: { color: 'rgba(0,0,0,0)', blur: 0, borderRadius: 0 },
      accent: { color: '#3b82f6', width: 0, position: 'bottom' },
      animation: { enter: 'word_by_word', exit: 'fade', duration: 30, easing: 'linear', delay: 0 },
      position: { x: 'center', y: 'center', offsetX: 0, offsetY: 0 },
      timing: { appearAt: 0 }, opacity: 1,
    },
  },
  {
    id: 'bottom_quote', name: 'Bottom Quote',
    description: 'Italic quote at bottom of frame',
    defaults: {
      template: 'bottom_quote',
      text: { line1: 'Key statement or quote here', color: 'rgba(255,255,255,0.90)', size: 22, weight: '400', family: 'Georgia', letterSpacing: '0em', transform: 'none', fontStyle: 'italic' },
      background: { color: 'rgba(0,0,0,0)', blur: 0, borderRadius: 0 },
      accent: { color: '#3b82f6', width: 0, position: 'bottom' },
      animation: { enter: 'slide_up', exit: 'fade', duration: 18, easing: 'ease_out', delay: 0 },
      position: { x: 'center', y: 'bottom', offsetX: 80, offsetY: 80 },
      timing: { appearAt: 0 }, opacity: 1,
    },
  },
]

export const STAT_CALLOUT_TEMPLATES = [
  {
    id: 'big_number', name: 'Big Number',
    description: 'Full-frame animated statistic',
    defaults: {
      template: 'big_number',
      text: { line1: '$3T', line2: 'Market Cap — 2023', color: '#ffffff', size: 96, weight: '800', family: 'Inter', letterSpacing: '-0.02em', transform: 'none' },
      background: { color: 'rgba(0,0,0,0)', blur: 0, borderRadius: 0 },
      accent: { color: '#3b82f6', width: 0, position: 'bottom' },
      animation: { enter: 'fade', exit: 'fade', duration: 30, easing: 'ease_out', delay: 0 },
      position: { x: 'center', y: 'center', offsetX: 0, offsetY: 0 },
      timing: { appearAt: 0 }, opacity: 1,
    },
  },
  {
    id: 'corner_stat', name: 'Corner Stat',
    description: 'Compact stat card — top right',
    defaults: {
      template: 'corner_stat',
      text: { line1: '$3T', line2: 'Market Cap', color: '#ffffff', size: 42, weight: '800', family: 'Inter', letterSpacing: '-0.01em', transform: 'none' },
      background: { color: 'rgba(0,0,0,0.70)', blur: 0, borderRadius: 8 },
      accent: { color: '#3b82f6', width: 3, position: 'left' },
      animation: { enter: 'slide_left', exit: 'fade', duration: 20, easing: 'spring', delay: 0 },
      position: { x: 'right', y: 'top', offsetX: 48, offsetY: 48 },
      timing: { appearAt: 0 }, opacity: 1,
    },
  },
]

export const CHAPTER_TITLE_TEMPLATES = [
  {
    id: 'minimal_chapter', name: 'Minimal Chapter',
    description: 'Clean centered chapter break',
    defaults: {
      template: 'minimal_chapter',
      text: { line1: 'Chapter 1', line2: 'The Beginning', color: '#ffffff', size: 48, weight: '700', family: 'Inter', letterSpacing: '-0.01em', transform: 'none' },
      background: { color: 'rgba(0,0,0,0)', blur: 0, borderRadius: 0 },
      accent: { color: '#3b82f6', width: 3, position: 'bottom' },
      animation: { enter: 'fade', exit: 'fade', duration: 30, easing: 'ease_out', delay: 0 },
      position: { x: 'center', y: 'center', offsetX: 0, offsetY: 0 },
      timing: { appearAt: 0 }, opacity: 1,
    },
  },
  {
    id: 'full_screen_chapter', name: 'Full Screen',
    description: 'Full dark overlay chapter card',
    defaults: {
      template: 'full_screen_chapter',
      text: { line1: 'Chapter 1', line2: 'The Beginning', color: '#ffffff', size: 56, weight: '800', family: 'Inter', letterSpacing: '-0.02em', transform: 'none' },
      background: { color: 'rgba(0,0,0,0.82)', blur: 0, borderRadius: 0 },
      accent: { color: '#3b82f6', width: 60, position: 'bottom' },
      animation: { enter: 'fade', exit: 'fade', duration: 30, easing: 'ease_out', delay: 0 },
      position: { x: 'center', y: 'center', offsetX: 0, offsetY: 0 },
      timing: { appearAt: 0 }, opacity: 1,
    },
  },
]

export const SOURCE_CITATION_TEMPLATES = [
  {
    id: 'subtle_source', name: 'Subtle Source',
    description: 'Small attribution text — bottom left',
    defaults: {
      template: 'subtle_source',
      text: { line1: 'Source: Publication Name, 2024', color: 'rgba(255,255,255,0.45)', size: 10, weight: '400', family: 'Inter', transform: 'none', letterSpacing: '0.02em' },
      background: { color: 'rgba(0,0,0,0)', blur: 0, borderRadius: 0 },
      accent: { color: 'transparent', width: 0, position: 'left' },
      animation: { enter: 'fade', exit: 'fade', duration: 10, easing: 'linear', delay: 0 },
      position: { x: 'left', y: 'bottom', offsetX: 48, offsetY: 24 },
      timing: { appearAt: 0 }, opacity: 1,
    },
  },
]

export const BACKGROUND_OVERLAY_TEMPLATES = [
  {
    id: 'gradient_bottom', name: 'Gradient Bottom',
    description: 'Dark gradient rising from bottom — helps readability of lower-third overlays',
    defaults: {
      template: 'gradient_bottom',
      background: { color: 'linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.20) 35%, transparent 60%)' },
      animation: { enter: 'fade', exit: 'fade', duration: 20, easing: 'linear', delay: 0 },
      timing: { appearAt: 0 }, opacity: 1,
    },
  },
  {
    id: 'gradient_top', name: 'Gradient Top',
    description: 'Dark gradient falling from top',
    defaults: {
      template: 'gradient_top',
      background: { color: 'linear-gradient(to bottom, rgba(0,0,0,0.60) 0%, transparent 40%)' },
      animation: { enter: 'fade', exit: 'fade', duration: 20, easing: 'linear', delay: 0 },
      timing: { appearAt: 0 }, opacity: 1,
    },
  },
  {
    id: 'full_dark', name: 'Dark Overlay',
    description: 'Full-frame dark tint for text readability',
    defaults: {
      template: 'full_dark',
      background: { color: 'rgba(0,0,0,0.40)' },
      animation: { enter: 'fade', exit: 'fade', duration: 20, easing: 'linear', delay: 0 },
      timing: { appearAt: 0 }, opacity: 1,
    },
  },
  {
    id: 'color_tint', name: 'Color Tint',
    description: 'Subtle color wash over the frame',
    defaults: {
      template: 'color_tint',
      background: { color: 'rgba(30,60,120,0.25)' },
      animation: { enter: 'fade', exit: 'fade', duration: 20, easing: 'linear', delay: 0 },
      timing: { appearAt: 0 }, opacity: 1,
    },
  },
]

export const WATERMARK_TEMPLATES = [
  {
    id: 'corner_watermark', name: 'Corner Watermark',
    description: 'Subtle channel/brand name — top right',
    defaults: {
      template: 'corner_watermark',
      text: { line1: 'CHANNEL NAME', color: '#ffffff', size: 11, weight: '600', family: 'Inter', transform: 'uppercase', letterSpacing: '0.15em' },
      background: { color: 'rgba(0,0,0,0)', blur: 0, borderRadius: 0 },
      accent: { color: 'transparent', width: 0, position: 'left' },
      animation: { enter: 'fade', exit: 'fade', duration: 20, easing: 'linear', delay: 0 },
      position: { x: 'right', y: 'top', offsetX: 32, offsetY: 28 },
      timing: { appearAt: 0 }, opacity: 0.18,
    },
  },
]

// ── Templates by type lookup ─────────────────────────────────────────────────
export function getTemplatesForType(type) {
  const map = {
    lower_third:        LOWER_THIRD_TEMPLATES,
    date_stamp:         DATE_STAMP_TEMPLATES,
    kinetic_text:       KINETIC_TEXT_TEMPLATES,
    stat_callout:       STAT_CALLOUT_TEMPLATES,
    chapter_title:      CHAPTER_TITLE_TEMPLATES,
    source_citation:    SOURCE_CITATION_TEMPLATES,
    background_overlay: BACKGROUND_OVERLAY_TEMPLATES,
    watermark:          WATERMARK_TEMPLATES,
  }
  return map[type] || []
}

// ── Select options ───────────────────────────────────────────────────────────
export const ENTER_ANIMATIONS = [
  { id: 'fade',        name: 'Fade In' },
  { id: 'slide_left',  name: 'Slide from Left' },
  { id: 'slide_right', name: 'Slide from Right' },
  { id: 'slide_up',    name: 'Slide Up' },
  { id: 'slide_down',  name: 'Slide Down' },
  { id: 'scale_in',    name: 'Scale In' },
  { id: 'word_by_word',name: 'Word by Word' },
  { id: 'typewriter',  name: 'Typewriter' },
]

export const EXIT_ANIMATIONS = [
  { id: 'fade',        name: 'Fade Out' },
  { id: 'slide_left',  name: 'Slide to Left' },
  { id: 'slide_right', name: 'Slide to Right' },
  { id: 'slide_down',  name: 'Slide Down' },
  { id: 'scale_out',   name: 'Scale Out' },
  { id: 'instant',     name: 'Instant Cut' },
]

export const EASING_OPTIONS = [
  { id: 'spring',      name: 'Spring' },
  { id: 'ease_out',    name: 'Ease Out' },
  { id: 'ease_in_out', name: 'Ease In Out' },
  { id: 'linear',      name: 'Linear' },
]

export const FONT_OPTIONS = [
  { id: 'Inter',            name: 'Inter' },
  { id: 'Helvetica Neue',   name: 'Helvetica Neue' },
  { id: 'Georgia',          name: 'Georgia' },
  { id: 'Playfair Display', name: 'Playfair Display' },
  { id: 'Bebas Neue',       name: 'Bebas Neue' },
  { id: 'Montserrat',       name: 'Montserrat' },
  { id: 'DM Sans',          name: 'DM Sans' },
  { id: 'Courier New',      name: 'Courier New' },
]

export const OVERLAY_TABS = [
  { id: 'lower_third',        label: 'Lower Third',   icon: '▭' },
  { id: 'date_stamp',         label: 'Date/Location', icon: '📍' },
  { id: 'kinetic_text',       label: 'Kinetic Text',  icon: 'T' },
  { id: 'stat_callout',       label: 'Stat Callout',  icon: '#' },
  { id: 'chapter_title',      label: 'Chapter',       icon: '§' },
  { id: 'source_citation',    label: 'Source',        icon: '©' },
  { id: 'background_overlay', label: 'BG Overlay',    icon: '▨' },
  { id: 'watermark',          label: 'Watermark',     icon: '◈' },
  { id: 'vignette',           label: 'Vignette',      icon: '◉' },
  { id: 'grain',              label: 'Grain',         icon: '∷' },
  { id: 'color_grade',        label: 'Color Grade',   icon: '◑' },
]

export const DEFAULT_BRAND = {
  accentColor:     '#3b82f6',
  secondaryColor:  '#ffffff',
  backgroundColor: 'rgba(0,0,0,0.75)',
  fontFamily:      'Inter',
  fontWeight:      '600',
  watermarkText:   null,
  watermarkOpacity: 0.18,
}
