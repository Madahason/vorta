// Pure GSAP easing utilities for Remotion
// Usage: const t = gsapEase('power2.out', frame / durationFrames)
// Returns a 0–1 eased progress value — fully deterministic, no side effects.
// GSAP is used here as a pure math library only — NOT for timeline playback.

import { gsap } from 'gsap'

export function gsapEase(easeName, progress) {
  const p = Math.max(0, Math.min(1, progress))
  return gsap.parseEase(easeName)(p)
}

// Pre-bound helpers for common documentary motion patterns
export const easeOut   = (p) => gsapEase('power2.out', p)
export const easeIn    = (p) => gsapEase('power2.in', p)
export const easeInOut = (p) => gsapEase('power2.inOut', p)
export const elastic   = (p) => gsapEase('elastic.out(1, 0.5)', p)
export const back      = (p) => gsapEase('back.out(1.7)', p)
export const expo      = (p) => gsapEase('expo.out', p)
