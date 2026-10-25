/**
 * The explosion of one blast as stages (D8, ticket 868; Bjor 04:51 via Grok Bot: "explosions with
 * fire, smoke and crazy effects"; a delta on the #145/#215 front): after the fuse-spark build, a
 * white-hot flash of two or three frames, the fireball swelling in the type's colours, the
 * shockwave ring crossing the ground radius, debris and chips in the broken ground's colours, the
 * dust plume, and the embers and smoke that settle last. Every count escalates once per size and
 * once per Blast Radius band (the HS rule, `radiusBandOf`) and is then fitted to its pool, so a
 * blast never asks for more pieces than the layer holds; the ground radius scales only the sprites
 * and the ring (the TD's bounded-cost row). The showcase variant (GD 04:53) flashes longer and
 * names the charge; the reduce-motion reading (the shake switch off, as the kernel reads it) dims
 * the flash and the flash switch off hides it. Pure: the layer plays what this says.
 */
import { MM_PER_METRE } from '../../../../constants/physics'
import { SPARK_CAPACITY } from '../../../../constants/scene'
import { hexOfRgb, mixRgb, rgbOfHex, scaleRgb, type Rgb } from '../../../../systems/render/colour'
import { flashSpriteOf } from './blastFrontLook'
import {
  BAND_COUNT_SHARE,
  BLAST_DEBRIS_CAPACITY,
  CHIPS_AT_SIZE_1,
  CHIPS_PER_SIZE_STEP,
  DEBRIS_AT_SIZE_1,
  DEBRIS_PER_SIZE_STEP,
  EMBER_COLOUR,
  EMBER_SECONDS_AT_SIZE_1,
  EMBER_SECONDS_PER_SIZE_STEP,
  EMBERS_AT_SIZE_1,
  EMBERS_PER_SIZE_STEP,
  FIREBALL_END_SHARE,
  FIREBALL_MAX_M,
  FIREBALL_MIN_M,
  FIREBALL_OPACITY,
  FIREBALL_SECONDS_AT_SIZE_1,
  FIREBALL_SECONDS_PER_SIZE_STEP,
  FIREBALL_SPARK_SECONDS,
  FIREBALL_SPARKS_AT_SIZE_1,
  FIREBALL_SPARKS_PER_SIZE_STEP,
  FIREBALL_START_SHARE,
  FIRST_THREE_FRAME_FLASH_SIZE,
  FLASH_FRAMES,
  FLASH_FRAMES_FROM_SIZE_7,
  FRONT_DUST_CAPACITY,
  PLUME_AT_SIZE_1,
  PLUME_PER_SIZE_STEP,
  PLUME_SECONDS_AT_SIZE_1,
  PLUME_SECONDS_PER_BAND,
  PLUME_SECONDS_PER_SIZE_STEP,
  REDUCED_FLASH_SHARE,
  SHOCKWAVE_MAX_SECONDS,
  SHOCKWAVE_METRES_PER_SECOND,
  SHOCKWAVE_MIN_SECONDS,
  SHOCKWAVE_OPACITY,
  SHOCKWAVE_WIDTH_MAX_M,
  SHOCKWAVE_WIDTH_MIN_M,
  SHOCKWAVE_WIDTH_SHARE,
  SHOWCASE_BANNER_TICKS,
  SHOWCASE_EXTRA_FLASH_FRAMES,
  SMOKE_AT_SIZE_1,
  SMOKE_GREY,
  SMOKE_PER_SIZE_STEP,
  SMOKE_SECONDS_AT_SIZE_1,
  SMOKE_SECONDS_PER_SIZE_STEP,
  SMOKE_SOOT_SHARE,
} from './blastLookConstants'
import { chargeTypeLookOf, radiusBandOf } from './chargeTypeLook'

/** The player's two effect switches (#2's accessibility baseline), as the blast look reads them. */
export interface BlastEffectSwitches {
  /** The shake switch off: the repo's reduce-motion reading (no shake, a dimmed flash). */
  isMotionReduced: boolean
  /** The flash switch: off, nothing white covers the clearing. */
  isFlashAllowed: boolean
}

export const FULL_EFFECTS: BlastEffectSwitches = { isMotionReduced: false, isFlashAllowed: true }

export function blastEffectSwitchesOf(prefs: {
  shake: boolean
  flashes: boolean
}): BlastEffectSwitches {
  return { isMotionReduced: !prefs.shake, isFlashAllowed: prefs.flashes }
}

export interface BlastVfxInput {
  size: number
  chargeType: number
  radiusLevel: number
  /** The ground the blast clears on this planet, mm. */
  groundRadiusMm: number
  /** The colour of the ground the blast broke, for the chips and debris. */
  groundColour: Rgb
  isShowcase: boolean
  switches: BlastEffectSwitches
}

/** How many pieces each stage throws, fitted to the pools. */
export interface StageCounts {
  /** Fire pool: the fireball's sparks and the embers that settle after it. */
  fireballSparks: number
  embers: number
  /** Dust pool: the plume, the smoke and the chips in the ground's colours. */
  plume: number
  smoke: number
  chips: number
  /** The kernel spray's tumbling debris. */
  debris: number
}

export interface StageLives {
  fireballSparkSeconds: number
  emberSeconds: number
  plumeSeconds: number
  smokeSeconds: number
}

export interface BlastVfxPlan {
  size: number
  chargeType: number
  /** 0 at level 0, one more per tenfold (the HS escalation). */
  band: number
  flash: { frames: number; opacity: number; radiusM: number }
  fireball: {
    seconds: number
    startRadiusM: number
    endRadiusM: number
    fromColour: string
    toColour: string
    opacity: number
  }
  shockwave: { seconds: number; reachM: number; widthM: number; colour: string; opacity: number }
  counts: StageCounts
  lives: StageLives
  colours: { fire: string; ember: string; smoke: string; chips: string[] }
  /** The showcase's banner: the charge's name and how long it holds, on the authority's clock. */
  banner: { name: string; sizeLine: string; ticks: number } | null
}

export function blastVfxPlanOf(input: BlastVfxInput): BlastVfxPlan {
  const look = chargeTypeLookOf(input.chargeType)
  const band = radiusBandOf(input.radiusLevel)
  const radiusM = input.groundRadiusMm / MM_PER_METRE
  return {
    size: input.size,
    chargeType: input.chargeType,
    band,
    flash: flashOf(input),
    fireball: fireballOf(input.size, radiusM, look.spark, look.soot),
    shockwave: shockwaveOf(radiusM, look.ring),
    counts: fittedCountsOf(rawCountsOf(input.size, band)),
    lives: livesOf(input.size, band),
    colours: {
      fire: look.spark,
      ember: EMBER_COLOUR,
      smoke: smokeColourOf(look.soot),
      chips: chipColoursOf(input.groundColour, look.soot),
    },
    banner: input.isShowcase
      ? { name: look.name, sizeLine: `Size ${input.size}`, ticks: SHOWCASE_BANNER_TICKS }
      : null,
  }
}

/** The flash frames a size shows: two, three from the plunger sizes, the showcase's more. */
export function flashFramesOf(size: number, isShowcase: boolean): number {
  const frames = size >= FIRST_THREE_FRAME_FLASH_SIZE ? FLASH_FRAMES_FROM_SIZE_7 : FLASH_FRAMES
  return frames + (isShowcase ? SHOWCASE_EXTRA_FLASH_FRAMES : 0)
}

/** The flash sprite's opacity through the switches: hidden with flashes off, dimmed with shake off. */
export function flashOpacityOf(base: number, switches: BlastEffectSwitches): number {
  if (!switches.isFlashAllowed) return 0
  return switches.isMotionReduced ? base * REDUCED_FLASH_SHARE : base
}

/** The stage counts at `size` and `band` before the pools' fit: once per size, once per band. */
export function rawCountsOf(size: number, band: number): StageCounts {
  const escalate = (atSize1: number, perStep: number) =>
    Math.round((atSize1 + (size - 1) * perStep) * (1 + BAND_COUNT_SHARE * band))
  return {
    fireballSparks: escalate(FIREBALL_SPARKS_AT_SIZE_1, FIREBALL_SPARKS_PER_SIZE_STEP),
    embers: escalate(EMBERS_AT_SIZE_1, EMBERS_PER_SIZE_STEP),
    plume: escalate(PLUME_AT_SIZE_1, PLUME_PER_SIZE_STEP),
    smoke: escalate(SMOKE_AT_SIZE_1, SMOKE_PER_SIZE_STEP),
    chips: escalate(CHIPS_AT_SIZE_1, CHIPS_PER_SIZE_STEP),
    debris: escalate(DEBRIS_AT_SIZE_1, DEBRIS_PER_SIZE_STEP),
  }
}

/** Each pool's stages scaled down together until they fit it; a count never grows. */
export function fittedCountsOf(raw: StageCounts): StageCounts {
  const [fireballSparks, embers] = fitToPool([raw.fireballSparks, raw.embers], SPARK_CAPACITY)
  const [plume, smoke, chips] = fitToPool([raw.plume, raw.smoke, raw.chips], FRONT_DUST_CAPACITY)
  return {
    fireballSparks,
    embers,
    plume,
    smoke,
    chips,
    debris: Math.min(raw.debris, BLAST_DEBRIS_CAPACITY),
  }
}

export function stageTotalOf(counts: StageCounts): number {
  return Object.values(counts).reduce((total, count) => total + count, 0)
}

function fitToPool(counts: readonly number[], capacity: number): number[] {
  const asked = counts.reduce((total, count) => total + count, 0)
  if (asked <= capacity) return [...counts]
  return counts.map((count) => Math.floor((count * capacity) / asked))
}

function flashOf(input: BlastVfxInput): BlastVfxPlan['flash'] {
  const sprite = flashSpriteOf(input.size, input.groundRadiusMm)
  return {
    frames: flashFramesOf(input.size, input.isShowcase),
    opacity: flashOpacityOf(sprite.opacity, input.switches),
    radiusM: sprite.radiusM,
  }
}

function fireballOf(
  size: number,
  radiusM: number,
  spark: string,
  soot: string,
): BlastVfxPlan['fireball'] {
  return {
    seconds: FIREBALL_SECONDS_AT_SIZE_1 + (size - 1) * FIREBALL_SECONDS_PER_SIZE_STEP,
    startRadiusM: clampedFireballM(radiusM * FIREBALL_START_SHARE),
    endRadiusM: clampedFireballM(radiusM * FIREBALL_END_SHARE),
    fromColour: spark,
    toColour: soot,
    opacity: FIREBALL_OPACITY,
  }
}

function clampedFireballM(radiusM: number): number {
  return Math.min(FIREBALL_MAX_M, Math.max(FIREBALL_MIN_M, radiusM))
}

/** The ring crosses the ground radius at its speed, held between a quarter second and 1.4 s. */
function shockwaveOf(radiusM: number, ring: string): BlastVfxPlan['shockwave'] {
  const seconds = Math.min(
    SHOCKWAVE_MAX_SECONDS,
    Math.max(SHOCKWAVE_MIN_SECONDS, radiusM / SHOCKWAVE_METRES_PER_SECOND),
  )
  const reachM = Math.min(radiusM, seconds * SHOCKWAVE_METRES_PER_SECOND)
  return {
    seconds,
    reachM,
    widthM: Math.min(
      SHOCKWAVE_WIDTH_MAX_M,
      Math.max(SHOCKWAVE_WIDTH_MIN_M, reachM * SHOCKWAVE_WIDTH_SHARE),
    ),
    colour: ring,
    opacity: SHOCKWAVE_OPACITY,
  }
}

function livesOf(size: number, band: number): StageLives {
  const step = size - 1
  return {
    fireballSparkSeconds: FIREBALL_SPARK_SECONDS,
    emberSeconds: EMBER_SECONDS_AT_SIZE_1 + step * EMBER_SECONDS_PER_SIZE_STEP,
    plumeSeconds:
      PLUME_SECONDS_AT_SIZE_1 + step * PLUME_SECONDS_PER_SIZE_STEP + band * PLUME_SECONDS_PER_BAND,
    smokeSeconds: SMOKE_SECONDS_AT_SIZE_1 + step * SMOKE_SECONDS_PER_SIZE_STEP,
  }
}

/** Smoke is the type's soot lifted toward grey, so each type's smoke keeps a hint of its colour. */
export function smokeColourOf(soot: string): string {
  return hexOfRgb(mixRgb(rgbOfHex(soot), rgbOfHex(SMOKE_GREY), SMOKE_SOOT_SHARE))
}

/** The broken ground's colour, a darker shade of it, and the type's soot: what the chips wear. */
export function chipColoursOf(groundColour: Rgb, soot: string): string[] {
  return [hexOfRgb(groundColour), hexOfRgb(scaleRgb(groundColour, 0.7)), soot]
}
