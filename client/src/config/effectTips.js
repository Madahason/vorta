export const GRADE_TIPS = {
  cool_blue: {
    label: 'Cool Blue',
    tag: 'Documentary default',
    tagColor: '#3b82f6',
    description: 'Clean, authoritative grade with a slight blue tint. The standard for modern documentary filmmaking.',
    bestFor: 'Present-tense narrative, interviews, corporate stories, tech profiles',
    avoid: 'Historical footage or warm emotional moments',
    example: '"Apple's rise began in a Cupertino garage…"',
  },
  warm_amber: {
    label: 'Warm Amber',
    tag: 'Nostalgia & archive',
    tagColor: '#f59e0b',
    description: 'Golden tones that transport viewers to the past. Signals memory, warmth, and historical weight.',
    bestFor: 'Pre-2000 events, founder origin stories, nostalgia-driven moments',
    avoid: 'Present-day analysis or crisis scenes',
    example: '"In 1998, Bezos loaded his car with books and drove west…"',
  },
  desaturated: {
    label: 'Desaturated',
    tag: 'Crisis & failure',
    tagColor: '#94a3b8',
    description: 'Drained color signals collapse, hardship, or moral gravity. Used by top documentarians for dark chapters.',
    bestFor: 'Bankruptcy, dismissals, failures, bleak outcomes, scandal',
    avoid: 'Positive or neutral narrative beats',
    example: '"The stock dropped 80% in a single trading session."',
  },
  magnates: {
    label: 'Magnates',
    tag: '⭐ Most impactful',
    tagColor: '#8b5cf6',
    description: 'Teal shadows + orange highlights — the signature MagnatesMedia look. High contrast, cinematic intensity. Reserve for your biggest moments.',
    bestFor: 'Peak narrative moments, triumphant reveals, climax scenes',
    avoid: 'Overuse — loses impact if applied to too many scenes',
    example: '"Worth $1 trillion. The most valuable company on earth."',
  },
  high_contrast: {
    label: 'High Contrast',
    tag: 'Confrontation',
    tagColor: '#ef4444',
    description: 'Punchy, near-monochromatic look. Signals urgency, confrontation, or a revelation that changes everything.',
    bestFor: 'Breaking news moments, confrontations, regulatory crackdowns, dramatic reveals',
    avoid: 'Gentle or reflective narrative beats',
    example: '"The SEC launched a formal investigation the next morning."',
  },
  neutral: {
    label: 'Neutral',
    tag: 'Clean & functional',
    tagColor: '#6b7280',
    description: 'No color grading applied. Best for scenes where the visual content must speak without interpretation.',
    bestFor: 'Product reveals, data visuals, clean B-roll, chart context',
    avoid: 'Emotional narrative — neutral can feel cold or unintentional',
    example: 'Product shot or data visualization context scene',
  },
}

export const MOTION_TIPS = {
  push_in: {
    label: 'Push In',
    description: 'Camera moves toward the subject, building tension and focus.',
    bestFor: 'Character reveals, escalating tension, key facts',
    moodMatch: ['tense', 'anticipatory', 'dramatic'],
  },
  pull_out: {
    label: 'Pull Out',
    description: 'Camera pulls back to reveal scale or context.',
    bestFor: 'Establishing scale, moments of reflection, pulling back after climax',
    moodMatch: ['reflective', 'somber', 'neutral'],
  },
  drift_left: {
    label: 'Drift Left',
    description: 'Gentle horizontal sweep — adds movement without distraction.',
    bestFor: 'Landscape shots, wide establishing scenes, transitions',
    moodMatch: ['neutral', 'reflective'],
  },
  drift_right: {
    label: 'Drift Right',
    description: 'Rightward drift — feels like forward momentum.',
    bestFor: 'Progress scenes, positive developments, timeline advances',
    moodMatch: ['triumphant', 'neutral', 'anticipatory'],
  },
  drift_up: {
    label: 'Drift Up',
    description: 'Upward motion — aspiration, elevation, hope.',
    bestFor: 'Success moments, upward trends, aerial reveals',
    moodMatch: ['triumphant', 'anticipatory'],
  },
  static: {
    label: 'Static',
    description: 'No camera movement. Full attention on the image composition.',
    bestFor: 'Portraits, high-impact stills, quote cards with image backing',
    moodMatch: ['somber', 'intimate', 'institutional'],
    proTip: 'Works best when the subject itself commands the frame — strong composition is essential.',
  },
}

export const COMPOSITION_TIPS = {
  close_up: {
    label: 'Close-up',
    icon: '🔍',
    description: 'Tight framing on face or object detail. Maximum emotional intensity.',
    bestFor: 'Emotional peaks, character definition, product detail',
    avoid: 'Establishing shots or wide context scenes',
  },
  medium: {
    label: 'Medium',
    icon: '🎯',
    description: 'Standard documentary framing. Subject from waist up. Versatile.',
    bestFor: 'Interviews, narration-driven scenes, most narrative beats',
    avoid: 'When you need to establish scale or create intimacy',
  },
  wide: {
    label: 'Wide',
    icon: '🌐',
    description: 'Full environment in frame. Subject is small relative to surroundings.',
    bestFor: 'Establishing scenes, scale reveals, location introduction',
    avoid: 'Emotional close moments or character-focused beats',
  },
  aerial: {
    label: 'Aerial',
    icon: '🚁',
    description: 'Bird\'s-eye or high-angle perspective. Conveys omniscience and scale.',
    bestFor: 'Geographic context, empire building, global reach scenes',
    avoid: 'Intimate or personal narrative moments',
  },
  low_angle: {
    label: 'Low Angle',
    icon: '⬆️',
    description: 'Camera looks up at subject. Conveys power, dominance, and authority.',
    bestFor: 'Power moments, intimidating figures, architectural grandeur',
    avoid: 'Vulnerability or humility scenes',
  },
  over_shoulder: {
    label: 'Over Shoulder',
    icon: '👥',
    description: 'Camera behind one figure looking at another. Creates tension and dialogue.',
    bestFor: 'Negotiations, confrontations, relationship dynamics',
    avoid: 'Solo narrative or establishing shots',
  },
}

export const INTENSITY_TIPS = [
  {
    value: 'subtle',
    label: 'Subtle',
    tip: 'Light touch — most scenes should use this. Lets the narrative drive, not the motion.',
  },
  {
    value: 'moderate',
    label: 'Moderate',
    tip: 'Noticeable movement. Good for key beats and important reveals.',
  },
  {
    value: 'strong',
    label: 'Strong',
    tip: 'Maximum motion. Reserve for 2-3 peak moments per video or it loses impact.',
  },
]
