// DD-5: Director Review audit — pure client-side arithmetic and heuristics. Zero Claude API
// calls, by design: every check here is countable, comparable, or a substring match. If a
// check can't be expressed that way, it doesn't belong in this file.
//
// Signature note: the brief specifies `runDirectorAudit(scenes, direction)`. That two-arg
// call keeps working exactly as documented — but two of the required checks are structurally
// impossible without more input than `scenes`/`direction` alone provide: narration coverage
// needs the original script text (nothing in `scenes` or `direction` stores the full source),
// and "scenes with images already generated" / "unresolved footage" need sceneStatuses-derived
// image paths and selected clips, which live in VideoCreator.jsx state, not on the scene
// objects themselves. Rather than silently drop the single most damaging-failure-mode check
// (narration coverage) to satisfy a literal 2-arg reading, this adds an optional third
// parameter — a plain object, default {} — so `runDirectorAudit(scenes, direction)` is still
// the complete, valid, documented call; passing context just makes a few checks sharper.
// Every field in context is optional and every check degrades gracefully without it.

// ─── shared normalisation helpers ────────────────────────────────────────────

function normalise(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

const STOPWORDS = new Set([
  'the', 'and', 'with', 'without', 'from', 'that', 'this', 'into', 'their',
  'over', 'under', 'always', 'never', 'often', 'very', 'when', 'worn',
])

// Mirrors server/services/continuityEnforcement.js exactly, so this audit's
// "descriptor missing" result agrees with DD-3's live enforcement on the same scenes.
function significantWords(text, count = 6) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w))
    .slice(0, count)
}

function descriptorPresent(prompt, descriptor) {
  const words = significantWords(descriptor)
  if (!words.length) return true
  const p = String(prompt || '').toLowerCase()
  const hits = words.filter(w => p.includes(w)).length
  return hits >= Math.max(1, Math.ceil(words.length / 2))
}

// Majority-overlap match — "does this text look like it's substantially about the same
// thing as this term list" (motifs, evidence claims). Mirrors descriptorPresent's threshold.
function termsPresent(text, terms) {
  if (!terms.length) return false
  const t = String(text || '').toLowerCase()
  const hits = terms.filter(w => t.includes(w)).length
  return hits >= Math.max(1, Math.ceil(terms.length / 2))
}

// Any-one-of match — for a fixed vocabulary of alternative keywords where a single hit is
// meaningful on its own (e.g. a reconstruction-label overlay only needs ONE of "recreated" /
// "dramatization" / etc., not a majority of the whole list).
function containsAnyTerm(text, terms) {
  const t = String(text || '').toLowerCase()
  return terms.some(w => t.includes(w))
}

// ─── warning builder ──────────────────────────────────────────────────────────

function makeWarningFactory() {
  let n = 0
  return (partial) => ({
    id: `${partial.category}-${partial.severity}-${n++}`,
    severity: partial.severity,
    category: partial.category,
    title: partial.title,
    detail: partial.detail || '',
    sceneIds: partial.sceneIds || [],
    action: partial.action || null,
  })
}

// ─── consecutive-run helper (shared by every repetition check) ──────────────
// Walks scenes in order and returns maximal runs where keyFn(scene) is equal and truthy
// across the whole run, excluding any run whose shared key === excludeValue.
function findRuns(scenes, keyFn, minLength, excludeValue = null) {
  const runs = []
  let i = 0
  while (i < scenes.length) {
    const key = keyFn(scenes[i])
    if (key == null || key === excludeValue) { i++; continue }
    let j = i + 1
    while (j < scenes.length && keyFn(scenes[j]) === key) j++
    const length = j - i
    if (length >= minLength) runs.push({ key, scenes: scenes.slice(i, j) })
    i = j
  }
  return runs
}

// ─── Step 2 — stats block ────────────────────────────────────────────────────

function buildStats(scenes, targetDurationMinutes) {
  const total = scenes.length
  const totalDuration = scenes.reduce((s, sc) => s + (sc.duration_seconds || 0), 0)
  const avgDuration = total ? totalDuration / total : 0

  let shortest = null, longest = null
  scenes.forEach(s => {
    const d = s.duration_seconds || 0
    if (!shortest || d < shortest.duration) shortest = { scene_id: s.scene_id, duration: d }
    if (!longest || d > longest.duration) longest = { scene_id: s.scene_id, duration: d }
  })

  const countBy = (fn) => {
    const map = {}
    scenes.forEach(s => {
      const k = fn(s)
      if (k == null || k === '') return
      map[k] = (map[k] || 0) + 1
    })
    return Object.entries(map)
      .map(([key, count]) => ({ key, count, percent: total ? (count / total) * 100 : 0 }))
      .sort((a, b) => b.count - a.count)
  }

  const sceneTypeDistribution = countBy(s => s.scene_type)
  const shotTypeDistribution  = countBy(s => s.shot_type)
  const assetMethodDistribution = countBy(s => s.asset_strategy?.method)
  const complexityDistribution  = countBy(s => s.complexity)
  const retentionDistribution   = countBy(s => s.purpose?.retention)

  const AUTHENTIC_METHODS = new Set(['archival_footage', 'primary_document', 'photograph', 'screenshot', 'stock_footage'])
  let aiCount = 0, authenticCount = 0
  scenes.forEach(s => {
    const method = s.asset_strategy?.method
    if (method === 'ai_image' || s.scene_type === 'cinematic_reconstruction') aiCount++
    else if (AUTHENTIC_METHODS.has(method)) authenticCount++
  })
  const aiVsAuthentic = {
    aiCount, authenticCount,
    aiPercent: (aiCount + authenticCount) ? (aiCount / (aiCount + authenticCount)) * 100 : null,
  }

  const actMap = {}
  scenes.forEach(s => {
    if (s.act == null) return
    if (!actMap[s.act]) actMap[s.act] = { act: s.act, count: 0, duration: 0 }
    actMap[s.act].count++
    actMap[s.act].duration += s.duration_seconds || 0
  })
  const actBalance = Object.values(actMap).sort((a, b) => a.act - b.act)

  const lockedCount = scenes.filter(s => s.locked === true).length

  const targetSeconds = Number.isFinite(targetDurationMinutes) ? targetDurationMinutes * 60 : null
  const durationDeltaPercent = targetSeconds
    ? ((totalDuration - targetSeconds) / targetSeconds) * 100
    : null

  return {
    totalScenes: total,
    totalDurationSeconds: parseFloat(totalDuration.toFixed(2)),
    targetDurationSeconds: targetSeconds,
    durationDeltaPercent: durationDeltaPercent != null ? parseFloat(durationDeltaPercent.toFixed(1)) : null,
    averageSceneDuration: parseFloat(avgDuration.toFixed(2)),
    shortestScene: shortest,
    longestScene: longest,
    sceneTypeDistribution,
    shotTypeDistribution,
    assetMethodDistribution,
    aiVsAuthentic,
    complexityDistribution,
    retentionDistribution,
    actBalance,
    lockedCount,
  }
}

// ─── Step 3 — coverage checks ────────────────────────────────────────────────

function auditCoverage(scenes, warn, sourceScript, targetDurationMinutes, stats) {
  // Narration coverage — word-multiset heuristic. Excerpts are meant to be exact substrings
  // of the source script (per the analysis system prompt), so a word-availability walk over
  // the source in original order gives a fast, deterministic "what's missing" signal without
  // a real diff algorithm.
  if (sourceScript && sourceScript.trim()) {
    const sourceWords = normalise(sourceScript).split(' ').filter(Boolean)
    const excerptWords = normalise(scenes.map(s => s.script_excerpt || '').join(' ')).split(' ').filter(Boolean)
    const available = new Map()
    excerptWords.forEach(w => available.set(w, (available.get(w) || 0) + 1))

    const covered = sourceWords.map(w => {
      const n = available.get(w) || 0
      if (n > 0) { available.set(w, n - 1); return true }
      return false
    })

    const coveredCount = covered.filter(Boolean).length
    const coveragePercent = sourceWords.length ? (coveredCount / sourceWords.length) * 100 : 100

    if (coveragePercent < 95) {
      // Longest uncovered runs, capped at 5, each with ~80 chars of context.
      const runs = []
      let i = 0
      while (i < covered.length) {
        if (covered[i]) { i++; continue }
        let j = i + 1
        while (j < covered.length && !covered[j]) j++
        runs.push({ start: i, end: j, length: j - i })
        i = j
      }
      runs.sort((a, b) => b.length - a.length)
      const top5 = runs.slice(0, 5).map(r => {
        const ctxStart = Math.max(0, r.start - 4)
        const ctxEnd = Math.min(sourceWords.length, r.end + 4)
        let context = sourceWords.slice(ctxStart, ctxEnd).join(' ')
        if (context.length > 80) context = context.slice(0, 80) + '…'
        return `"${context}"`
      })

      warn({
        severity: 'critical', category: 'coverage', title: 'Narration coverage below 95%',
        detail: `${coveragePercent.toFixed(1)}% of the source script's words are accounted for `
          + `across all scene excerpts (${coveredCount}/${sourceWords.length} words). `
          + `Longest gaps:\n${top5.join('\n')}`,
        sceneIds: [],
      })
    }
  }

  // Duplicated narration
  const byText = new Map()
  scenes.forEach(s => {
    const t = normalise(s.script_excerpt)
    if (!t) return
    if (!byText.has(t)) byText.set(t, [])
    byText.get(t).push(s.scene_id)
  })
  byText.forEach((ids) => {
    if (ids.length > 1) {
      warn({
        severity: 'warning', category: 'coverage', title: 'Duplicated narration',
        detail: `The same script excerpt appears in ${ids.length} scenes.`,
        sceneIds: ids,
      })
    }
  })

  // Duration mismatch
  if (stats.durationDeltaPercent != null && Math.abs(stats.durationDeltaPercent) > 15) {
    warn({
      severity: 'warning', category: 'coverage', title: 'Total duration deviates from target',
      detail: `Total runtime is ${stats.totalDurationSeconds.toFixed(0)}s vs a `
        + `${stats.targetDurationSeconds.toFixed(0)}s target `
        + `(${stats.durationDeltaPercent > 0 ? '+' : ''}${stats.durationDeltaPercent}%).`,
      sceneIds: [],
    })
  }

  // Empty excerpt
  const emptyExcerpt = scenes.filter(s => !s.script_excerpt || !s.script_excerpt.trim())
  if (emptyExcerpt.length) {
    warn({
      severity: 'critical', category: 'coverage', title: 'Scenes with an empty script excerpt',
      detail: `${emptyExcerpt.length} scene(s) carry no narration text at all.`,
      sceneIds: emptyExcerpt.map(s => s.scene_id),
    })
  }

  // Missing prompt
  const missingPrompt = scenes.filter(s => s.shot_type === 'image' && !(s.higgsfield_prompt || '').trim())
  if (missingPrompt.length) {
    warn({
      severity: 'critical', category: 'coverage', title: 'Image scenes with no prompt',
      detail: `${missingPrompt.length} image scene(s) have an empty higgsfield_prompt — nothing to generate from.`,
      sceneIds: missingPrompt.map(s => s.scene_id),
    })
  }

  // Missing motion graphic data
  const missingMotionData = scenes.filter(s => s.shot_type === 'motion_graphic' && !(s.motion_graphic_type || '').trim())
  if (missingMotionData.length) {
    warn({
      severity: 'warning', category: 'coverage', title: 'Motion graphic scenes missing a template',
      detail: `${missingMotionData.length} motion graphic scene(s) have no motion_graphic_type set.`,
      sceneIds: missingMotionData.map(s => s.scene_id),
    })
  }
}

// ─── Step 4 — repetition checks ──────────────────────────────────────────────

function auditRepetition(scenes, warn) {
  // Consecutive shot type (4+)
  findRuns(scenes, s => s.shot_type, 4).forEach(run => {
    warn({
      severity: 'warning', category: 'repetition', title: `${run.scenes.length} consecutive "${run.key}" scenes`,
      detail: `Scenes ${run.scenes[0].scene_id}–${run.scenes[run.scenes.length - 1].scene_id} all share shot_type "${run.key}".`,
      sceneIds: run.scenes.map(s => s.scene_id),
    })
  })

  // Consecutive scene type (3+)
  findRuns(scenes, s => s.scene_type, 3).forEach(run => {
    warn({
      severity: 'warning', category: 'repetition', title: `${run.scenes.length} consecutive "${run.key}" scenes`,
      detail: `Scenes ${run.scenes[0].scene_id}–${run.scenes[run.scenes.length - 1].scene_id} all share scene_type "${run.key}".`,
      sceneIds: run.scenes.map(s => s.scene_id),
    })
  })

  // Consecutive motion (3+, excluding static)
  findRuns(scenes, s => s.motion?.type, 3, 'static').forEach(run => {
    warn({
      severity: 'warning', category: 'repetition', title: `${run.scenes.length} consecutive "${run.key}" camera moves`,
      detail: `Scenes ${run.scenes[0].scene_id}–${run.scenes[run.scenes.length - 1].scene_id} all use motion "${run.key}".`,
      sceneIds: run.scenes.map(s => s.scene_id),
    })
  })

  // Scene type over-concentration (>30%)
  const total = scenes.length
  if (total) {
    const counts = {}
    scenes.forEach(s => { if (s.scene_type) counts[s.scene_type] = (counts[s.scene_type] || 0) + 1 })
    Object.entries(counts).forEach(([type, count]) => {
      const percent = (count / total) * 100
      if (percent > 30) {
        warn({
          severity: 'warning', category: 'repetition', title: `"${type}" dominates the scene plan`,
          detail: `${count}/${total} scenes (${percent.toFixed(0)}%) are classified "${type}".`,
          sceneIds: scenes.filter(s => s.scene_type === type).map(s => s.scene_id),
        })
      }
    })
  }

  // Visual monotony — 6+ consecutive scenes with no change in shot_type, scene_type, OR motion.type
  {
    const key = s => `${s.shot_type}|${s.scene_type}|${s.motion?.type}`
    findRuns(scenes, key, 6).forEach(run => {
      warn({
        severity: 'warning', category: 'repetition', title: `Visual monotony across ${run.scenes.length} scenes`,
        detail: `Scenes ${run.scenes[0].scene_id}–${run.scenes[run.scenes.length - 1].scene_id} show no change in `
          + `shot type, scene type, or camera move.`,
        sceneIds: run.scenes.map(s => s.scene_id),
      })
    })
  }

  // Transition monotony (5+) — info only
  findRuns(scenes, s => s.transition_out, 5).forEach(run => {
    warn({
      severity: 'info', category: 'repetition', title: `${run.scenes.length} consecutive "${run.key}" transitions`,
      detail: `Scenes ${run.scenes[0].scene_id}–${run.scenes[run.scenes.length - 1].scene_id} all cut with "${run.key}". `
        + `Often correct — consistent cutting can be a deliberate style choice.`,
      sceneIds: run.scenes.map(s => s.scene_id),
    })
  })

  // Prompt similarity — neighbouring pairs sharing the exact same anchor set
  for (let i = 0; i < scenes.length - 1; i++) {
    const a = scenes[i], b = scenes[i + 1]
    const anchorsA = a.subject_anchors, anchorsB = b.subject_anchors
    if (!Array.isArray(anchorsA) || !Array.isArray(anchorsB) || !anchorsA.length || !anchorsB.length) continue
    const setA = new Set(anchorsA.map(x => x.toLowerCase()))
    const setB = new Set(anchorsB.map(x => x.toLowerCase()))
    if (setA.size !== setB.size) continue
    const sameSet = [...setA].every(x => setB.has(x))
    if (sameSet) {
      warn({
        severity: 'info', category: 'repetition', title: 'Neighbouring scenes share every subject anchor',
        detail: `Scenes ${a.scene_id} and ${b.scene_id} both anchor on: ${[...setA].join(', ')}.`,
        sceneIds: [a.scene_id, b.scene_id],
      })
    }
  }
}

// ─── Step 5 — continuity checks (skipped when direction is null) ────────────

function auditContinuity(scenes, direction, warn) {
  const treatment = direction?.treatment
  if (!treatment) return

  const entities = treatment.continuity_entities || []
  const entityById = new Map(entities.map(e => [e.id, e]))

  // Orphaned ref
  const refUsage = new Map() // entity id -> scene ids referencing it
  scenes.forEach(s => {
    (s.continuity_refs || []).forEach(refId => {
      if (!refUsage.has(refId)) refUsage.set(refId, [])
      refUsage.get(refId).push(s.scene_id)
    })
  })
  refUsage.forEach((sceneIds, refId) => {
    if (!entityById.has(refId)) {
      warn({
        severity: 'warning', category: 'continuity', title: `Orphaned continuity reference "${refId}"`,
        detail: `${sceneIds.length} scene(s) reference an entity id that no longer exists in the treatment.`,
        sceneIds,
      })
    }
  })

  // Descriptor missing — one warning per (scene, entity) pair, matching DD-3's granularity
  scenes.forEach(s => {
    if (s.shot_type !== 'image' && s.shot_type !== 'real_footage') return
    ;(s.continuity_refs || []).forEach(refId => {
      const entity = entityById.get(refId)
      if (!entity || !entity.locked_descriptor) return
      if (!descriptorPresent(s.higgsfield_prompt, entity.locked_descriptor)) {
        warn({
          severity: 'warning', category: 'continuity', title: `Locked descriptor missing — ${entity.name}`,
          detail: `Scene ${s.scene_id} references "${entity.name}" but its prompt doesn't reproduce the locked descriptor.`,
          sceneIds: [s.scene_id],
        })
      }
    })
  })

  // Unused entity
  entities.forEach(e => {
    if (!refUsage.has(e.id) || refUsage.get(e.id).length === 0) {
      warn({
        severity: 'info', category: 'continuity', title: `Unused continuity entity — ${e.name}`,
        detail: `The treatment defines "${e.name}" as a recurring entity, but no scene references it.`,
        sceneIds: [],
      })
    }
  })

  // Motif absence — fewer than 2 scenes whose prompt contains any of the motif's terms
  ;(treatment.recurring_motifs || []).forEach(motif => {
    const terms = significantWords(`${motif.name || ''} ${motif.description || ''}`, 8)
    const matchingScenes = scenes.filter(s => termsPresent(s.higgsfield_prompt, terms))
    if (matchingScenes.length < 2) {
      warn({
        severity: 'info', category: 'continuity', title: `Motif rarely deployed — ${motif.name}`,
        detail: `Only ${matchingScenes.length} scene(s) show signs of the "${motif.name}" motif; the treatment expected it to recur.`,
        sceneIds: matchingScenes.map(s => s.scene_id),
      })
    }
  })

  // Act gap
  const actsWithScenes = new Set(scenes.map(s => s.act).filter(a => a != null))
  ;(treatment.acts || []).forEach(act => {
    if (!actsWithScenes.has(act.act_number)) {
      warn({
        severity: 'warning', category: 'continuity', title: `Act ${act.act_number} has no scenes`,
        detail: `"${act.title}" is defined in the treatment but no scene is assigned to act ${act.act_number}.`,
        sceneIds: [],
      })
    }
  })
}

// ─── Step 6 — evidence checks (skipped when direction is null) ──────────────

const RECONSTRUCTION_LABEL_TERMS = ['reconstruction', 'recreated', 're-creation', 'dramatization', 'dramatisation', 'illustrative']

function auditEvidence(scenes, direction, warn) {
  const treatment = direction?.treatment
  if (!treatment) return

  ;(treatment.evidence_claims || []).forEach(claim => {
    const terms = significantWords(claim.claim, 8)
    const matches = scenes.filter(s => termsPresent(s.script_excerpt, terms))

    if (!matches.length) {
      warn({
        severity: 'warning', category: 'evidence', title: `Uncovered evidence claim`,
        detail: `No scene's narration matches: "${claim.claim}"`,
        sceneIds: [],
      })
      return
    }

    const carriedByAiImage = matches.filter(s => s.asset_strategy?.method === 'ai_image')
    if (carriedByAiImage.length) {
      warn({
        severity: 'warning', category: 'evidence', title: `Evidence claim carried by an AI image`,
        detail: `"${claim.claim}" is only visually supported by AI-generated image(s), not authentic material.`,
        sceneIds: carriedByAiImage.map(s => s.scene_id),
      })
    }
  })

  // Unlabelled reconstruction
  const reconstructionScenes = scenes.filter(s => (s.risk_flags || []).includes('misleading_reconstruction'))
  const unlabelled = reconstructionScenes.filter(s => {
    const overlays = s.overlays || []
    return !overlays.some(o => {
      const text = `${o.text?.line1 || ''} ${o.text?.line2 || ''}`
      return containsAnyTerm(text, RECONSTRUCTION_LABEL_TERMS)
    })
  })
  if (unlabelled.length) {
    warn({
      severity: 'critical', category: 'evidence', title: 'Reconstruction scenes with no on-screen label',
      detail: `${unlabelled.length} scene(s) are flagged as a reconstruction that could be mistaken for real footage, `
        + `but carry no overlay identifying them as such.`,
      sceneIds: unlabelled.map(s => s.scene_id),
    })
  }

  // Missing asset search
  const REAL_METHODS = new Set(['archival_footage', 'primary_document', 'photograph', 'screenshot', 'stock_footage', 'hybrid'])
  const missingSearch = scenes.filter(s => {
    if (!REAL_METHODS.has(s.asset_strategy?.method)) return false
    const search = s.asset_search
    return !search || typeof search !== 'object' || !Object.values(search).some(v => v && String(v).trim())
  })
  if (missingSearch.length) {
    warn({
      severity: 'info', category: 'evidence', title: 'Real-material scenes with no asset search',
      detail: `${missingSearch.length} scene(s) favour real material but have no asset_search to act on.`,
      sceneIds: missingSearch.map(s => s.scene_id),
    })
  }
}

// ─── Step 7 — production checks ──────────────────────────────────────────────

function auditProduction(scenes, warn, imagePaths, selectedClips) {
  const total = scenes.length

  // Advanced concentration (>25%)
  const advanced = scenes.filter(s => s.complexity === 'advanced')
  if (total && (advanced.length / total) * 100 > 25) {
    warn({
      severity: 'warning', category: 'production', title: 'High share of advanced-complexity scenes',
      detail: `${advanced.length}/${total} scenes (${((advanced.length / total) * 100).toFixed(0)}%) are rated advanced.`,
      sceneIds: advanced.map(s => s.scene_id),
    })
  }

  // Licensing exposure
  const licensingFlags = new Set(['requires_licensed_footage', 'copyright_sensitive'])
  const licensingScenes = scenes.filter(s => (s.risk_flags || []).some(f => licensingFlags.has(f)))
  if (licensingScenes.length) {
    warn({
      severity: 'warning', category: 'production', title: 'Scenes with licensing exposure',
      detail: `${licensingScenes.length} scene(s) are flagged requires_licensed_footage or copyright_sensitive.`,
      sceneIds: licensingScenes.map(s => s.scene_id),
    })
  }

  // Text rendering risk
  const textRiskScenes = scenes.filter(s => (s.risk_flags || []).includes('difficult_text_rendering'))
  if (textRiskScenes.length) {
    warn({
      severity: 'info', category: 'production', title: 'Scenes with difficult text rendering',
      detail: `${textRiskScenes.length} scene(s) may need on-screen text that AI image models render poorly.`,
      sceneIds: textRiskScenes.map(s => s.scene_id),
    })
  }

  // Long scene (>15s)
  const longScenes = scenes.filter(s => (s.duration_seconds || 0) > 15)
  if (longScenes.length) {
    warn({
      severity: 'warning', category: 'production', title: 'Scenes longer than 15 seconds',
      detail: `${longScenes.length} scene(s) exceed the 15s pacing guideline.`,
      sceneIds: longScenes.map(s => s.scene_id),
    })
  }

  // Micro scene (<2s)
  const microScenes = scenes.filter(s => (s.duration_seconds || 0) > 0 && s.duration_seconds < 2)
  if (microScenes.length) {
    warn({
      severity: 'info', category: 'production', title: 'Scenes under 2 seconds',
      detail: `${microScenes.length} scene(s) are very short — confirm they're intentional beats, not fragments.`,
      sceneIds: microScenes.map(s => s.scene_id),
    })
  }

  // Unresolved footage — real_footage scenes with no selected clip and no fallback image
  if (selectedClips) {
    const unresolved = scenes.filter(s =>
      s.shot_type === 'real_footage' && !selectedClips[s.scene_id] && !s.image_path && !imagePaths?.[s.scene_id]
    )
    if (unresolved.length) {
      warn({
        severity: 'warning', category: 'production', title: 'Real footage scenes with no clip resolved',
        detail: `${unresolved.length} real_footage scene(s) have no selected clip and no fallback image.`,
        sceneIds: unresolved.map(s => s.scene_id),
      })
    }
  }
}

// ─── entry point ──────────────────────────────────────────────────────────────

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 }

/**
 * Pure, synchronous, zero-network audit of a scene plan against its (optional) treatment.
 * @param {Array} scenes
 * @param {Object|null} direction - stored direction object ({ treatment }) or null
 * @param {Object} [context] - optional extra input a couple of checks need beyond the
 *   documented 2-arg signature: { sourceScript, targetDurationMinutes, imagePaths, selectedClips }
 */
export function runDirectorAudit(scenes, direction, context = {}) {
  const { sourceScript, targetDurationMinutes, imagePaths, selectedClips } = context
  const safeScenes = Array.isArray(scenes) ? scenes : []

  const warnings = []
  const warn = makeWarningFactory()
  const push = (partial) => warnings.push(warn(partial))

  const stats = buildStats(safeScenes, targetDurationMinutes)
  stats.imagesGenerated = imagePaths
    ? safeScenes.filter(s => !!imagePaths[s.scene_id] || !!s.image_path).length
    : safeScenes.filter(s => !!s.image_path).length

  auditCoverage(safeScenes, push, sourceScript, targetDurationMinutes, stats)
  auditRepetition(safeScenes, push)
  if (direction) {
    auditContinuity(safeScenes, direction, push)
    auditEvidence(safeScenes, direction, push)
  }
  auditProduction(safeScenes, push, imagePaths, selectedClips)

  warnings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  return {
    stats,
    warnings,
    generatedAt: new Date().toISOString(),
  }
}
