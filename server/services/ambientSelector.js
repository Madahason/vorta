const { generateAmbient, normaliseMood } = require('./elevenLabsAudio')

async function selectAndGenerateAmbient(scene) {
  const mood     = normaliseMood(scene.mood)
  const category = scene.category || inferCategory(scene)
  const cacheKey = `${category}_${mood}`
  try {
    return await generateAmbient(scene.script_excerpt, category, mood, cacheKey)
  } catch (err) {
    console.warn(`[ambient-selector] generation failed for ${cacheKey}:`, err.message)
    return null
  }
}

function inferCategory(scene) {
  const text = ((scene.script_excerpt || '') + ' ' + (scene.subject_anchors || []).join(' ')).toLowerCase()
  if (['stock','market','wall street','trading','finance','bank'].some(w => text.includes(w))) return 'finance'
  if (['apple','google','tech','software','startup','silicon','ai ','machine learning'].some(w => text.includes(w))) return 'tech'
  if (['congress','senate','government','president','policy','legislation'].some(w => text.includes(w))) return 'politics'
  if (['court','judge','trial','legal','law','attorney'].some(w => text.includes(w))) return 'legal'
  if (['factory','manufactur','industrial','worker','plant'].some(w => text.includes(w))) return 'industry'
  if (['city','street','urban','downtown','metropolitan'].some(w => text.includes(w))) return 'cities'
  if (['press','media','news','journalist','broadcast'].some(w => text.includes(w))) return 'media'
  if (['energy','oil','gas','power','electric','utility'].some(w => text.includes(w))) return 'energy'
  if (['airport','airline','transport','logistics','shipping'].some(w => text.includes(w))) return 'transportation'
  if (['crowd','protest','gather','community','social'].some(w => text.includes(w))) return 'social'
  if (['business','company','corporate','ceo','executive'].some(w => text.includes(w))) return 'business'
  return 'default'
}

module.exports = { selectAndGenerateAmbient, inferCategory }
