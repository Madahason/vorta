export const GRADE_TIPS = {
  cool_blue: {
    label: 'Cool Blue', tag: 'Documentary standard', tagColor: '#3b82f6',
    description: 'Slight blue tint, reduced saturation. Clinical, authoritative, modern.',
    bestFor: 'Corporate stories, tech companies, institutional moments',
    avoid: 'Historical or nostalgia scenes',
    example: 'Think Bloomberg, CNBC, Vice News'
  },
  warm_amber: {
    label: 'Warm Amber', tag: 'Historical / nostalgia', tagColor: '#f59e0b',
    description: 'Golden-warm tint with subtle sepia. Makes scenes feel like a memory.',
    bestFor: 'Founding stories, pre-2000 events, heritage and legacy moments',
    avoid: 'Current events, modern tech scenes',
    example: 'Think Ken Burns documentaries, The Crown'
  },
  desaturated: {
    label: 'Desaturated', tag: 'Crisis / failure', tagColor: '#94a3b8',
    description: 'Drained of color, high contrast. Cold, bleak, and serious.',
    bestFor: 'Bankruptcy, scandal, collapse, layoffs, death, failure',
    avoid: 'Positive or triumphant scenes — tonally wrong',
    example: 'Think The Big Short, Enron documentary'
  },
  magnates: {
    label: 'MagnatesMedia', tag: '⭐ Most impactful', tagColor: '#8b5cf6',
    description: 'Teal shadows + orange highlights, crushed blacks, high contrast. Bold business documentary look.',
    bestFor: 'IPO announcements, acquisitions, product launches, power moments',
    avoid: 'Subtle emotional scenes — too aggressive for reflective moments',
    example: 'MagnatesMedia, Wendover Productions, Cold Fusion'
  },
  high_contrast: {
    label: 'High Contrast', tag: 'Tension / drama', tagColor: '#ef4444',
    description: 'Very high contrast, slightly desaturated. Tense, confrontational, investigative.',
    bestFor: 'Legal battles, hearings, exposé moments, confrontations',
    avoid: 'Calm or informational scenes',
    example: 'Think Vice, Last Week Tonight investigative segments'
  },
  neutral: {
    label: 'Neutral', tag: 'Clean / factual', tagColor: '#6b7280',
    description: 'Minimal processing. Natural colors, no tint.',
    bestFor: 'Motion graphic context, product shots, clean B-roll',
    avoid: 'Dramatic moments — too flat',
    example: 'Corporate presentations, product launch visuals'
  }
};

export const MOTION_TIPS = {
  push_in: {
    label: 'Push In',
    description: 'Camera slowly zooms toward the subject. Builds tension and draws the viewer in.',
    bestFor: 'Building tension, approaching a reveal, focusing on a person or object',
    moodMatch: ['tense', 'dramatic', 'anticipatory']
  },
  pull_out: {
    label: 'Pull Out',
    description: 'Camera slowly zooms out. Reveals scale, context, or consequence.',
    bestFor: 'Aftermath of events, showing scale, stepping back for perspective',
    moodMatch: ['somber', 'reflective', 'neutral']
  },
  drift_left: {
    label: 'Drift Left',
    description: 'Gentle horizontal pan left. Scanning, exploratory feeling.',
    bestFor: 'Establishing locations, timelines, scanning a crowd',
    moodMatch: ['neutral', 'institutional', 'reflective']
  },
  drift_right: {
    label: 'Drift Right',
    description: 'Gentle horizontal pan right. Forward-feeling, progression.',
    bestFor: 'Establishing shots, forward progression',
    moodMatch: ['neutral', 'anticipatory', 'triumphant']
  },
  drift_up: {
    label: 'Drift Up',
    description: 'Camera slowly tilts upward. Aspirational, rising, hopeful.',
    bestFor: 'Achievements, launches, aspirational moments, success',
    moodMatch: ['triumphant', 'anticipatory']
  },
  static: {
    label: 'Static Hold',
    description: 'No movement. Stillness has weight.',
    bestFor: 'Death, failure, shock, moments that need to land hard',
    moodMatch: ['somber', 'dramatic', 'tense'],
    proTip: 'A completely static frame after fast-moving sequences is one of the most powerful techniques in documentary filmmaking. Less is more.'
  }
};

export const COMPOSITION_TIPS = {
  close_up: {
    label: 'Close Up', icon: '🔍',
    description: 'Subject fills the frame. Intimate, emotional, personal.',
    bestFor: 'Emotional moments, faces, key objects and details',
    avoid: 'Establishing or context scenes'
  },
  medium: {
    label: 'Medium Shot', icon: '📷',
    description: 'Balanced frame — subject visible with environment context.',
    bestFor: 'Most narrative scenes, dialogue, action',
    avoid: 'Nothing — the most versatile composition'
  },
  wide: {
    label: 'Wide Shot', icon: '🌅',
    description: 'Subject is small in a large environment. Conveys scale or isolation.',
    bestFor: 'Establishing scenes, showing scale or consequence',
    avoid: 'Emotional close moments — too distant'
  },
  aerial: {
    label: 'Aerial', icon: '🛰',
    description: 'Looking from high above. Power, geography, scope.',
    bestFor: 'Cities, global operations, power structures, geography',
    avoid: 'Personal or intimate moments'
  },
  low_angle: {
    label: 'Low Angle', icon: '⬆',
    description: 'Camera looks up at subject. Makes them appear powerful or imposing.',
    bestFor: 'Authority figures, CEOs, powerful institutions, threats',
    avoid: 'Vulnerable or humanizing moments'
  },
  over_shoulder: {
    label: 'Over Shoulder', icon: '👁',
    description: 'Camera behind subject. Surveillance feeling, tension.',
    bestFor: 'Tension, following a subject, confrontation',
    avoid: 'Calm establishing scenes'
  }
};

export const INTENSITY_TIPS = [
  { value: 'subtle',   label: 'Subtle',   tip: 'Barely noticeable. Professional and polished. Best for most scenes.' },
  { value: 'moderate', label: 'Moderate', tip: 'Visible movement. Good for establishing shots and major reveals.' },
  { value: 'strong',   label: 'Strong',   tip: 'Dramatic movement. Use sparingly — max 2-3 per video or it feels cheap.' }
];
