import { useState, useEffect } from 'react'

// DD-2: 7 stages — 'direction' sits between script and scenes. The brief's step list named
// the sixth stage "audio"; the existing id is 'finetune' (same stage — durations, transitions,
// audio mix) and renaming it would orphan stored wizard progress, so the id stays 'finetune'.
const STEPS = [
  { id: 'script',    label: 'Script',    icon: '📝', description: 'Paste and analyze your script' },
  { id: 'direction', label: 'Direction', icon: '🧭', description: 'Treatment, style bible, continuity' },
  { id: 'scenes',    label: 'Scenes',    icon: '🎬', description: 'Review and edit scene breakdown' },
  { id: 'visuals',   label: 'Visuals',   icon: '🖼',  description: 'Generate images and motion graphics' },
  { id: 'voice',     label: 'Voice',     icon: '🎙',  description: 'Generate narration voiceover' },
  { id: 'finetune',  label: 'Fine-Tune', icon: '🎛', description: 'Trim durations, transitions, and audio mix' },
  { id: 'export',    label: 'Export',    icon: '🎥',  description: 'Render and download your video' },
]

const STEP_IDS = STEPS.map(s => s.id)

// Steps that never block forward navigation — a project that skips them must flow exactly
// as before. Migration note: old localStorage values can never contain 'direction', and all
// pre-DD-2 ids still exist, so stored vorta_wizard_step / vorta_wizard_completed load as-is.
const SKIPPABLE_STEPS = ['direction']

export function useWizardState() {
  const [currentStep, setCurrentStep] = useState(() => {
    try {
      const saved = localStorage.getItem('vorta_wizard_step')
      return saved && STEP_IDS.includes(saved) ? saved : 'script'
    } catch { return 'script' }
  })

  const [completedSteps, setCompletedSteps] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('vorta_wizard_completed') || '[]')
    } catch { return [] }
  })

  useEffect(() => {
    localStorage.setItem('vorta_wizard_step', currentStep)
  }, [currentStep])

  useEffect(() => {
    localStorage.setItem('vorta_wizard_completed', JSON.stringify(completedSteps))
  }, [completedSteps])

  const currentIndex = STEP_IDS.indexOf(currentStep)

  // Forward navigation is allowed when every intervening incomplete step is skippable —
  // a skippable step never traps the user behind it.
  const goTo = (stepId) => {
    const targetIndex = STEP_IDS.indexOf(stepId)
    if (targetIndex === -1) return
    if (targetIndex <= currentIndex || completedSteps.includes(stepId)) {
      setCurrentStep(stepId)
      return
    }
    const blocking = STEP_IDS
      .slice(currentIndex + 1, targetIndex)
      .filter(id => !completedSteps.includes(id) && !SKIPPABLE_STEPS.includes(id))
    if (blocking.length === 0) setCurrentStep(stepId)
  }

  const goNext = () => {
    if (currentIndex < STEPS.length - 1) {
      const nextStep = STEP_IDS[currentIndex + 1]
      setCompletedSteps(prev =>
        prev.includes(currentStep) ? prev : [...prev, currentStep]
      )
      setCurrentStep(nextStep)
    }
  }

  const goBack = () => {
    if (currentIndex > 0) setCurrentStep(STEP_IDS[currentIndex - 1])
  }

  // Advance past a skippable step WITHOUT marking it complete — the nav can then
  // distinguish 'done' (green ✓) from 'skipped' (still shows as optional).
  const skipStep = (stepId) => {
    if (!SKIPPABLE_STEPS.includes(stepId)) return
    const idx = STEP_IDS.indexOf(stepId)
    if (idx !== -1 && idx < STEPS.length - 1 && currentStep === stepId) {
      setCurrentStep(STEP_IDS[idx + 1])
    }
  }

  const markComplete = (stepId) => {
    setCompletedSteps(prev =>
      prev.includes(stepId) ? prev : [...prev, stepId]
    )
  }

  const isComplete  = (stepId) => completedSteps.includes(stepId)
  const isSkippable = (stepId) => SKIPPABLE_STEPS.includes(stepId)

  // Mirrors the goTo gate so the nav's locked state matches what goTo would allow.
  const isAccessible = (stepId) => {
    const idx = STEP_IDS.indexOf(stepId)
    if (idx <= currentIndex || completedSteps.includes(stepId)) return true
    const blocking = STEP_IDS
      .slice(currentIndex + 1, idx)
      .filter(id => !completedSteps.includes(id) && !SKIPPABLE_STEPS.includes(id))
    return blocking.length === 0
  }

  const resetWizard = () => {
    setCurrentStep('script')
    setCompletedSteps([])
    localStorage.removeItem('vorta_wizard_step')
    localStorage.removeItem('vorta_wizard_completed')
  }

  return {
    steps: STEPS,
    currentStep,
    currentIndex,
    completedSteps,
    goTo,
    goNext,
    goBack,
    skipStep,
    markComplete,
    isComplete,
    isSkippable,
    isAccessible,
    resetWizard,
  }
}
