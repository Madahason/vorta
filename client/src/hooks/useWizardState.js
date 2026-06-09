import { useState, useEffect } from 'react'

const STEPS = [
  { id: 'script',  label: 'Script',  icon: '📝', description: 'Paste and analyze your script' },
  { id: 'scenes',  label: 'Scenes',  icon: '🎬', description: 'Review and edit scene breakdown' },
  { id: 'visuals', label: 'Visuals', icon: '🖼',  description: 'Generate images and motion graphics' },
  { id: 'voice',   label: 'Voice',   icon: '🎙',  description: 'Generate narration voiceover' },
  { id: 'audio',   label: 'Audio',   icon: '🎵',  description: 'Add music and sound effects' },
  { id: 'export',  label: 'Export',  icon: '🎥',  description: 'Render and download your video' },
]

const STEP_IDS = STEPS.map(s => s.id)

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

  const goTo = (stepId) => {
    const targetIndex = STEP_IDS.indexOf(stepId)
    if (targetIndex <= currentIndex || completedSteps.includes(stepId)) {
      setCurrentStep(stepId)
    }
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

  const markComplete = (stepId) => {
    setCompletedSteps(prev =>
      prev.includes(stepId) ? prev : [...prev, stepId]
    )
  }

  const isComplete   = (stepId) => completedSteps.includes(stepId)
  const isAccessible = (stepId) => {
    const idx = STEP_IDS.indexOf(stepId)
    return idx <= currentIndex || completedSteps.includes(stepId)
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
    markComplete,
    isComplete,
    isAccessible,
    resetWizard,
  }
}
