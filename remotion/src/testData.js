// Test scenes for Remotion Studio preview.
// Uses local project asset paths — update image paths to match actual generated assets.

export const TEST_SCENES = [
  {
    scene_id: '001',
    script_excerpt: 'In January 2007, Steve Jobs walked onto the Macworld stage and changed everything.',
    shot_type: 'image',
    mood: 'anticipatory',
    duration_seconds: 6,
    motion: { type: 'push_in', intensity: 'strong' },
    overlays: [
      { type: 'lower_third', line1: 'Steve Jobs', line2: 'Apple CEO · San Francisco 2007', appearAt: 20 },
    ],
    transition_out: 'dissolve',
    grade: 'cool_blue',
    higgsfield_prompt: '',
  },
  {
    scene_id: '002',
    script_excerpt: 'The iPhone would go on to generate over $3 trillion in cumulative revenue.',
    shot_type: 'motion_graphic',
    mood: 'neutral',
    duration_seconds: 5,
    motion: null,
    overlays: [],
    transition_out: 'cut',
    grade: null,
    motion_graphic_type: 'AnimatedCounter',
    motion_graphic_props: {
      value: 3000000000000,
      label: 'Cumulative iPhone Revenue',
      prefix: '$',
    },
  },
  {
    scene_id: '003',
    script_excerpt: 'The collapse of Lehman Brothers sent shockwaves across every trading floor on earth.',
    shot_type: 'image',
    mood: 'tense',
    duration_seconds: 7,
    motion: { type: 'drift_left', intensity: 'moderate' },
    overlays: [
      { type: 'date_stamp', text: 'New York · September 2008', appearAt: 18 },
    ],
    transition_out: 'dip_black',
    grade: 'desaturated',
    higgsfield_prompt: '',
  },
  {
    scene_id: '004',
    script_excerpt: 'Traders scrambled to exit positions as the market fell into freefall.',
    shot_type: 'real_footage',
    mood: 'tense',
    duration_seconds: 6,
    motion: null,
    overlays: [],
    transition_out: 'dissolve',
    grade: null,
    clip_search_tags: ['wall street', 'trading', 'stock market', 'crisis'],
  },
  {
    scene_id: '005',
    script_excerpt: 'It was the defining moment of a decade. A turning point no one saw coming.',
    shot_type: 'image',
    mood: 'reflective',
    duration_seconds: 5,
    motion: { type: 'static', intensity: 'moderate' },
    overlays: [
      { type: 'kinetic_text', text: 'Nothing would ever be the same.', style: 'center', appearAt: 30 },
    ],
    transition_out: 'dip_black',
    grade: 'cool_blue',
    higgsfield_prompt: '',
  },
]

// Image paths — update these to actual generated asset paths after running generation.
// Format: { [scene_id]: '/projects/[project_id]/assets/[scene_id].png' }
export const TEST_IMAGE_PATHS = {
  '001': '',  // replace with actual path e.g. '/projects/proj_123/assets/001.png'
  '003': '',
  '005': '',
}

// Selected clip for real_footage scene
export const TEST_SELECTED_CLIPS = {
  '004': {
    clip_id: '001',
    file: '/library/clips/wall_street_trading_floor.mp4',
    duration: 6,
    mood: 'tense',
  },
}

// Lowercase aliases — used by Root.jsx and any code following the prompt spec
export const testScenes        = TEST_SCENES
export const testImagePaths    = TEST_IMAGE_PATHS
export const testSelectedClips = TEST_SELECTED_CLIPS
