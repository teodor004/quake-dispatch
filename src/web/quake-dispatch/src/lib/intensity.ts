/**
 * Shaking intensity estimated from peak acceleration.
 *
 * The backend reports peak ground acceleration (PGA) per event, not a Richter
 * magnitude: a magnitude needs distances and a calibrated network. Intensity
 * (Modified Mercalli scale) describes how strong the shaking was where it was
 * measured, and can be estimated from PGA alone with Wald et al. (1999):
 *   I = 3.66 · log10(PGA) − 1.66   for I ≥ V
 *   I = 2.20 · log10(PGA) + 1.00   below V
 * with PGA in cm/s². Phone readings are not calibrated seismometers, so the
 * result is always labelled as an estimate.
 */

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const

const DESCRIPTION = [
  'neresimțit',
  'slab',
  'slab',
  'ușor',
  'moderat',
  'puternic',
  'foarte puternic',
  'sever',
  'violent',
  'extrem',
] as const

export interface Intensity {
  /** 1..10 */
  level: number
  roman: string
  description: string
}

export function intensityFromPga(pgaMs2: number): Intensity {
  const gal = Math.max(pgaMs2 * 100, 0.01)
  let i = 3.66 * Math.log10(gal) - 1.66
  if (i < 5) i = 2.2 * Math.log10(gal) + 1
  const level = Math.min(10, Math.max(1, Math.round(i)))
  return { level, roman: ROMAN[level - 1], description: DESCRIPTION[level - 1] }
}

/** "VI · puternic" */
export function formatIntensity(pgaMs2: number) {
  const { roman, description } = intensityFromPga(pgaMs2)
  return `${roman} · ${description}`
}

/** Status of a reading against the trigger threshold. */
export type Level = 'normal' | 'elevated' | 'alert'

/** Elevated from half the threshold, alert from the threshold itself. */
export const ELEVATED_FRACTION = 0.5

export function accelLevel(value: number, threshold: number): Level {
  if (value >= threshold) return 'alert'
  if (value >= threshold * ELEVATED_FRACTION) return 'elevated'
  return 'normal'
}

export const levelText: Record<Level, string> = {
  normal: 'Normal',
  elevated: 'Ridicat',
  alert: 'Alertă',
}
