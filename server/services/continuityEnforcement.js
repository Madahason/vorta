// DD-3: continuity enforcement pass — pure JS, no API call.
//
// After treatment-aware analysis, every scene that references a continuity entity
// (continuity_refs) must carry that entity's locked_descriptor inside its image prompt.
// Detection is deliberately mechanical (per the brief): normalised lowercase substring
// match on the first 6 significant words of the descriptor — no semantic matching.
// A descriptor counts as present when at least half of those words appear in the prompt.
// When absent, the descriptor is appended just before the style-lock tail and a warning
// is recorded so the client can surface what was auto-fixed.

const STOPWORDS = new Set([
  'the', 'and', 'with', 'without', 'from', 'that', 'this', 'into', 'their',
  'over', 'under', 'always', 'never', 'often', 'very', 'when', 'worn',
]);

function significantWords(text, count = 6) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w))
    .slice(0, count);
}

function descriptorPresent(prompt, descriptor) {
  const words = significantWords(descriptor);
  if (!words.length) return true; // nothing distinctive to check
  const p = String(prompt || '').toLowerCase();
  const hits = words.filter(w => p.includes(w)).length;
  return hits >= Math.max(1, Math.ceil(words.length / 2));
}

// Appends `text` to the prompt while keeping the style lock at the very end.
function appendBeforeStyleLock(prompt, text, styleLock) {
  const tail = `, ${styleLock}`;
  if (styleLock && prompt.endsWith(tail)) {
    return `${prompt.slice(0, -tail.length)}, ${text}${tail}`;
  }
  if (styleLock && prompt.endsWith(styleLock)) {
    return `${prompt.slice(0, -styleLock.length).replace(/,\s*$/, '')}, ${text}, ${styleLock}`;
  }
  return `${prompt}, ${text}`;
}

/**
 * @param {Array}  scenes    - post-processed scenes (prompts already carry the style lock)
 * @param {Object} direction - stored direction object ({ treatment })
 * @param {string} styleLock - the resolved style lock appended to these scenes' prompts
 * @returns {{ scenes: Array, warnings: Array }}
 */
function enforceContinuity(scenes, direction, styleLock) {
  const entities = new Map(
    (direction?.treatment?.continuity_entities || []).map(e => [e.id, e])
  );
  const warnings = [];

  const enforced = scenes.map(scene => {
    if (!Array.isArray(scene.continuity_refs) || !scene.continuity_refs.length) return scene;
    if (scene.shot_type !== 'image' && scene.shot_type !== 'real_footage') return scene;

    let prompt = scene.higgsfield_prompt || '';
    let changed = false;

    for (const refId of scene.continuity_refs) {
      const entity = entities.get(refId);
      if (!entity || !entity.locked_descriptor) continue;

      if (!descriptorPresent(prompt, entity.locked_descriptor)) {
        prompt = appendBeforeStyleLock(prompt, entity.locked_descriptor.trim(), styleLock);
        changed = true;
        warnings.push({
          scene_id:  scene.scene_id,
          type:      'continuity_descriptor_missing',
          entity_id: refId,
          auto_fixed: true,
        });
      }
    }

    return changed ? { ...scene, higgsfield_prompt: prompt } : scene;
  });

  if (warnings.length) {
    console.warn(`[continuity] auto-fixed ${warnings.length} missing locked descriptor(s):`,
      warnings.map(w => `${w.scene_id}:${w.entity_id}`).join(', '));
  }

  return { scenes: enforced, warnings };
}

module.exports = { enforceContinuity, descriptorPresent, significantWords, appendBeforeStyleLock };
