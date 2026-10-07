/**
 * The escalating purchase audio (#180 section 5, the Game Director's climb and G&V's voice cap):
 * which of the slice's sound cues a landed step or a chain's end plays, at what pitch and level.
 * Pure presentation rules; the slice's store hands the plays to the kernel's `requestSoundCue`,
 * and the kernel's sound stage keeps each cue within its voices (`soundCues`, K-b ticket 227).
 *
 * - A ratchet tick climbs a major pentatonic scale, one degree per pip, and resets at each major,
 *   so stacked ticks stay musical.
 * - Layers rise with the chain's speed: one tick at the slow rows, more as the gaps shrink, each
 *   layer an octave or a twelfth above. Its steam band swells as the chain climbs the rows.
 * - A major's moment takes the one flourish voice (whistle and clang); a milestone plays it a
 *   fourth higher, as the chord. Every stop ends on the cadence, pitched for its cue.
 */
import type { SoundCue, CueWave } from '../../../../systems/registries/soundCues'
import PURCHASE_SOUND_FILE from '../../purchaseSound.json'
import type { ChainStopCue, StepMoment } from '../chainCues'

export interface PurchaseSound {
  /** Semitones of one octave of the major pentatonic scale, from the root. */
  pentatonicSemitones: readonly number[]
  /** Each gap at or under one of these adds a layer to the tick. */
  layerGapTicks: readonly number[]
  /** The pitch of each layer above the tick's own: the first is the tick itself. */
  layerSemitones: readonly number[]
  /** The ratchet's level on the slowest row; it rises to 1 at the cap. */
  bedFloorGain: number
  flourishSemitones: Readonly<Record<Exclude<StepMoment, 'pip'>, number>>
  cadenceSemitones: Readonly<Record<Exclude<ChainStopCue, 'milestone'>, number>>
  cues: readonly SoundCue[]
}

/** One play of one of the slice's cues, as `requestSoundCue` takes it. */
export interface CuePlay {
  cueId: string
  pitchSemitones: number
  gain: number
}

/** A landed step, as its sound reads it. */
export interface HeardStep {
  moment: StepMoment
  /** The pip the step bought inside its major, 0 for the first. */
  pip: number
  /** Ticks since the chain's step before; null for a press or a click. */
  gapTicks: number | null
  /** The gap row the chain is on after the step. */
  onRow: number
  rowCount: number
}

export const PURCHASE_SOUND: PurchaseSound = purchaseSoundOf(PURCHASE_SOUND_FILE)

export const RATCHET_CUE_ID = 'workshop.ratchet'
export const FLOURISH_CUE_ID = 'workshop.flourish'
export const CADENCE_CUE_ID = 'workshop.cadence'

/** The tick's pitch above the root for the pip it bought (0 for the first pip of a major). */
export function ratchetSemitonesOf(pip: number, sound: PurchaseSound = PURCHASE_SOUND): number {
  const degrees = sound.pentatonicSemitones.length
  return 12 * Math.floor(pip / degrees) + sound.pentatonicSemitones[pip % degrees]
}

/** How many ticks one step stacks at this gap to the step before; a press has no gap. */
export function ratchetLayersOf(
  gapTicks: number | null,
  sound: PurchaseSound = PURCHASE_SOUND,
): number {
  if (gapTicks === null) return 1
  return 1 + sound.layerGapTicks.filter((limit) => gapTicks <= limit).length
}

/** The steam bed's level, 0 to 1, rising with the gap row the chain is on. */
export function steamBedLevelOf(onRow: number, rowCount: number): number {
  return (onRow + 1) / rowCount
}

/** What a landed step plays: the ratchet's layers for a pip, the flourish for a big level-up. */
export function cuePlaysOfStep(step: HeardStep, sound: PurchaseSound = PURCHASE_SOUND): CuePlay[] {
  if (step.moment !== 'pip') return [flourishPlayOf(step.moment, sound)]
  return ratchetPlaysOf(step, sound)
}

/** The cadence a chain ends on; a milestone's flourish already is its end. */
export function cuePlaysOfStop(
  cue: ChainStopCue,
  sound: PurchaseSound = PURCHASE_SOUND,
): CuePlay[] {
  if (cue === 'milestone') return []
  return [{ cueId: CADENCE_CUE_ID, pitchSemitones: sound.cadenceSemitones[cue], gain: 1 }]
}

function ratchetPlaysOf(step: HeardStep, sound: PurchaseSound): CuePlay[] {
  const root = ratchetSemitonesOf(step.pip, sound)
  const gain = bedGainOf(step, sound)
  const layers = sound.layerSemitones.slice(0, ratchetLayersOf(step.gapTicks, sound))
  return layers.map((above) => ({ cueId: RATCHET_CUE_ID, pitchSemitones: root + above, gain }))
}

function bedGainOf(step: HeardStep, sound: PurchaseSound): number {
  const level = step.gapTicks === null ? 0 : steamBedLevelOf(step.onRow, step.rowCount)
  return sound.bedFloorGain + (1 - sound.bedFloorGain) * level
}

function flourishPlayOf(moment: Exclude<StepMoment, 'pip'>, sound: PurchaseSound): CuePlay {
  return { cueId: FLOURISH_CUE_ID, pitchSemitones: sound.flourishSemitones[moment], gain: 1 }
}

/** The JSON's waves are plain strings; the cue registry checks the rest at its seal. */
function purchaseSoundOf(file: typeof PURCHASE_SOUND_FILE): PurchaseSound {
  const cues = file.cues.map((cue) => ({
    ...cue,
    tone: {
      ...cue.tone,
      partials: cue.tone.partials.map((partial) => ({ ...partial, wave: partial.wave as CueWave })),
    },
  }))
  return { ...file, cues }
}
