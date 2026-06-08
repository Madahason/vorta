const Anthropic = require('@anthropic-ai/sdk')
const { AMBIENT_CATALOG } = require('./ambientLibrary')

const client = new Anthropic()

const AMBIENT_KEYS = Object.entries(AMBIENT_CATALOG)
  .map(([key, val]) => `${key}: ${val.description}`)
  .join('\n')

const MOOD_DEFAULTS = {
  tense:         'tension_drone',
  dramatic:      'tension_drone',
  anticipatory:  'tension_drone',
  triumphant:    'crowd_murmur',
  somber:        'soft_ambient',
  reflective:    'soft_ambient',
  intimate:      'soft_ambient',
  neutral:       'office_ambient',
  institutional: 'office_ambient',
}

async function selectAmbientForScene(scene) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return getMoodDefault(scene.mood)
  }

  try {
    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 20,
      system:     'You are a documentary sound designer. Return only the exact ambient key name from the list provided. Nothing else.',
      messages: [{
        role:    'user',
        content: `Select the best ambient sound for this scene.

Scene: "${scene.script_excerpt || ''}"
Mood: ${scene.mood || 'neutral'}
Shot type: ${scene.shot_type || 'image'}
Subjects: ${(scene.subject_anchors || []).join(', ') || 'none'}

Available ambient sounds:
${AMBIENT_KEYS}

Return only the key name (e.g. "office_ambient"). Return "soft_ambient" if none fit well.`,
      }],
    })

    const key = message.content[0]?.text?.trim().toLowerCase().replace(/[^a-z_]/g, '')
    return AMBIENT_CATALOG[key] ? key : getMoodDefault(scene.mood)
  } catch (err) {
    console.warn('[ambientSelector] Claude call failed, using mood default:', err.message)
    return getMoodDefault(scene.mood)
  }
}

function getMoodDefault(mood) {
  return MOOD_DEFAULTS[mood] || 'soft_ambient'
}

module.exports = { selectAmbientForScene }
