/**
 * The escalating purchase audio (#180 section 5, the Game Director's climb and G&V's voice cap):
 * what each bought step sounds like, and which voices it takes. Pure presentation rules; the
 * slice's sound layer hands the answers to the shell's sound output.
 *
 * - A ratchet tick climbs a major pentatonic scale, one degree per pip, and resets at each major,
 *   so stacked ticks stay musical.
 * - Layers rise with the chain's speed: one per tick at the slow rows, more as the gaps shrink.
 * - At most `ratchetVoiceCap` ratchet voices sound at once; a new one steals the oldest with a
 *   `stealFadeMs` fade. One flourish voice is kept apart for the major's whistle and clang or a
 *   milestone's chord, and a new flourish replaces it.
 *
 * `ratchetTailTicks` and `layerGapTicks` are starting values for Gameplay & Vehicle to tune.
 */
import PURCHASE_SOUND_FILE from '../../purchaseSound.json'

export interface PurchaseSound {
  /** Semitones of one octave of the major pentatonic scale, from the root. */
  pentatonicSemitones: readonly number[]
  ratchetVoiceCap: number
  flourishVoiceCap: number
  stealFadeMs: number
  /** How long one ratchet tick rings, in 60 Hz ticks. */
  ratchetTailTicks: number
  /** Each gap at or under one of these adds a layer to the tick. */
  layerGapTicks: readonly number[]
}

export const PURCHASE_SOUND: PurchaseSound = PURCHASE_SOUND_FILE

export interface PurchaseVoice {
  startTick: number
  endTick: number
}

export interface PurchaseVoices {
  ratchet: readonly PurchaseVoice[]
  flourish: PurchaseVoice | null
}

export interface RatchetStart {
  voices: PurchaseVoices
  /** Ratchet voices cut short (with the steal fade) to keep under the cap. */
  stolen: number
}

export const SILENT_PURCHASE_VOICES: PurchaseVoices = { ratchet: [], flourish: null }

/** The tick's pitch above the root for the pip it bought (0 for the first pip of a major). */
export function ratchetSemitonesOf(pip: number, sound: PurchaseSound = PURCHASE_SOUND): number {
  const degrees = sound.pentatonicSemitones.length
  return 12 * Math.floor(pip / degrees) + sound.pentatonicSemitones[pip % degrees]
}

/** How many voices one tick stacks at this gap to the step before; a press has no gap. */
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

/** A tick of `layers` voices starts at `tick`; the oldest are stolen past the cap. */
export function startRatchet(
  voices: PurchaseVoices,
  tick: number,
  layers: number,
  sound: PurchaseSound = PURCHASE_SOUND,
): RatchetStart {
  const ringing = voices.ratchet.filter((voice) => voice.endTick > tick)
  const started = Array.from({ length: layers }, () => ({
    startTick: tick,
    endTick: tick + sound.ratchetTailTicks,
  }))
  const all = [...ringing, ...started]
  const stolen = Math.max(all.length - sound.ratchetVoiceCap, 0)
  return { voices: { ...voices, ratchet: all.slice(stolen) }, stolen }
}

/** The major's or milestone's moment takes the one flourish voice, replacing any before it. */
export function startFlourish(
  voices: PurchaseVoices,
  tick: number,
  lengthTicks: number,
): PurchaseVoices {
  return { ...voices, flourish: { startTick: tick, endTick: tick + lengthTicks } }
}

/** How many voices of each kind sound at `tick`. */
export function soundingVoicesAt(
  voices: PurchaseVoices,
  tick: number,
): { ratchet: number; flourish: number } {
  const isSounding = (voice: PurchaseVoice) => voice.startTick <= tick && tick < voice.endTick
  const flourish = voices.flourish !== null && isSounding(voices.flourish) ? 1 : 0
  return { ratchet: voices.ratchet.filter(isSounding).length, flourish }
}
