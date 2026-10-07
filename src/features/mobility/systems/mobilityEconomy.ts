/**
 * The mobility lane's numbers from `mobility.economy.json` (spec #162 section 4, locked 6 Oct;
 * the G&V feel pass; the GD lock and G&V comment on #204). Refused whole on any problem, like the
 * kernel's economy file, so a stand-in never reaches a rule.
 *
 * Three numbers are this slice's readings rather than #162 rows, each named where it is read:
 * the grapple's aim cone is G&V's 20° as its tangent (0.364), the winch holds the miner at the
 * hook for `reelHoldTicks` and a reel that never arrives lets go after `reelTicksMax`, and a burst asks for the engine's top speed plus the kernel's +2000 bp cap
 * (`speedShareBp`), which the kernel holds it to anyway.
 */
import {
  createFieldReader,
  readBandOreCost,
  type FieldReader,
} from '../../../systems/economy/economyFieldReader'
import type { BandOreCost } from '../../../systems/economy/economyDefinition'
import MOBILITY_ECONOMY_FILE from '../mobility.economy.json'

export interface MobilityPrices {
  /** One-off items at their unlock planet (#162 4.1: 15 band-5 units, #161). */
  oneOff: BandOreCost
  /** Each consumable unit at the current planet (#162 4.1: 2 band-5 units). */
  consumableUnit: BandOreCost
}

export interface GrappleNumbers {
  charges: number
  cooldownTicks: number
  windupTicks: number
  rangeTiles: number
  /** G&V: a hook within 20° of the aim line, as tan 20° in thousandths. */
  aimConeTanPerMille: number
  /** How long the winch holds the miner at the hook once there, to drive or drill off it. */
  reelHoldTicks: number
  /** The longest a reel pulls before it lets go, so a blocked reel never hangs the miner. */
  reelTicksMax: number
}

export interface BallastNumbers {
  stack: number
  windupTicks: number
  windowTicks: number
  /** The miner's mass while the ballast is dropped: ×0.6 (#162 4.3). */
  massShareBp: number
}

export interface HeatSinkNumbers {
  stack: number
  windupTicks: number
  pauseTicks: number
  /** −60% of the gauge at once (#162 4.3); the kernel floors it at `heatFloorBp`. */
  ventBp: number
  /** Heat gain paused: none lands (the kernel floors it at `heatFloorBp`). */
  gainBp: number
}

export interface BurstNumbers {
  windupTicks: number
  burstTicks: number
  /** The burst's speed as a share of the engine's top speed. */
  speedShareBp: number
}

export interface SteamBoostNumbers extends BurstNumbers {
  charges: number
  cooldownTicks: number
}

export interface EscapeThrusterNumbers extends BurstNumbers {
  stack: number
}

export interface RivetPatchNumbers {
  stack: number
  windupTicks: number
  /** The stationary hold after the wind-up (#162 4.3: 90 ticks; GD lock on #204 Q6). */
  holdTicks: number
  /** +25% of `hullMax` (#162 4.3). */
  hullShareBp: number
  /** G&V on #204: "moving" is any input, or a speed above 0.5 cells/s. */
  movingSpeedMmPerS: number
}

export interface SteamShieldNumbers {
  charges: number
  cooldownTicks: number
  windupTicks: number
  windowTicks: number
  /** Blocks the hit (#162 row); the kernel floors it at `damageFloorBp`. */
  damageScaleBp: number
}

export interface SmokeNumbers {
  stack: number
  windupTicks: number
  radiusTiles: number
  windowTicks: number
  /** Breaks detection (#162 row); the kernel floors it at `detectionFloorBp`. */
  detectionScaleBp: number
}

export interface ToggleNumbers {
  drawPerMillePerSecond: number
}

export interface MobilityEconomy {
  prices: MobilityPrices
  grapple: GrappleNumbers
  ballast: BallastNumbers
  heatSink: HeatSinkNumbers
  steamBoost: SteamBoostNumbers
  rivetPatch: RivetPatchNumbers
  steamShield: SteamShieldNumbers
  smoke: SmokeNumbers
  gravAnchor: ToggleNumbers
  buoyancy: ToggleNumbers
  escapeThruster: EscapeThrusterNumbers
}

export const MOBILITY_ECONOMY: MobilityEconomy = loadMobilityEconomy(MOBILITY_ECONOMY_FILE)

/** Every problem with the file, or the numbers when it has none. */
export function readMobilityEconomy(
  raw: unknown,
): { economy: MobilityEconomy } | { problems: string[] } {
  const reader = createFieldReader()
  const block = reader.object('mobility', reader.object('file', raw).mobility)
  const integers = <K extends string>(name: string, fields: readonly K[]) =>
    readIntegers(reader, `mobility.${name}`, block[name], fields)
  const economy: MobilityEconomy = {
    prices: readPrices(reader, block.prices),
    grapple: integers('grapple', [
      'charges',
      'cooldownTicks',
      'windupTicks',
      'rangeTiles',
      'aimConeTanPerMille',
      'reelHoldTicks',
      'reelTicksMax',
    ]),
    ballast: integers('ballast', ['stack', 'windupTicks', 'windowTicks', 'massShareBp']),
    heatSink: integers('heatSink', ['stack', 'windupTicks', 'pauseTicks', 'ventBp', 'gainBp']),
    steamBoost: integers('steamBoost', [
      'charges',
      'cooldownTicks',
      'windupTicks',
      'burstTicks',
      'speedShareBp',
    ]),
    rivetPatch: integers('rivetPatch', [
      'stack',
      'windupTicks',
      'holdTicks',
      'hullShareBp',
      'movingSpeedMmPerS',
    ]),
    steamShield: integers('steamShield', [
      'charges',
      'cooldownTicks',
      'windupTicks',
      'windowTicks',
      'damageScaleBp',
    ]),
    smoke: integers('smoke', [
      'stack',
      'windupTicks',
      'radiusTiles',
      'windowTicks',
      'detectionScaleBp',
    ]),
    gravAnchor: integers('gravAnchor', ['drawPerMillePerSecond']),
    buoyancy: integers('buoyancy', ['drawPerMillePerSecond']),
    escapeThruster: integers('escapeThruster', [
      'stack',
      'windupTicks',
      'burstTicks',
      'speedShareBp',
    ]),
  }
  return reader.problems.length > 0 ? { problems: reader.problems } : { economy }
}

function loadMobilityEconomy(raw: unknown): MobilityEconomy {
  const reading = readMobilityEconomy(raw)
  if ('problems' in reading) {
    throw new Error(`mobility.economy.json is refused:\n${reading.problems.join('\n')}`)
  }
  return reading.economy
}

function readPrices(reader: FieldReader, raw: unknown): MobilityPrices {
  const prices = reader.object('mobility.prices', raw)
  const band = reader.safeInteger('mobility.prices.band', prices.band)
  return {
    oneOff: bandCostOf(reader, band, 'oneOffOreUnits', prices.oneOffOreUnits),
    consumableUnit: bandCostOf(reader, band, 'consumableOreUnits', prices.consumableOreUnits),
  }
}

function bandCostOf(reader: FieldReader, band: number, name: string, oreUnits: unknown) {
  return readBandOreCost(reader, `mobility.prices.${name}`, { band, oreUnits })
}

/** Whole numbers from 0, one per field. */
function readIntegers<K extends string>(
  reader: FieldReader,
  path: string,
  raw: unknown,
  fields: readonly K[],
): Record<K, number> {
  const block = reader.object(path, raw)
  const entries = fields.map((field) => [
    field,
    wholeNumberOf(reader, `${path}.${field}`, block[field]),
  ])
  return Object.fromEntries(entries) as Record<K, number>
}

function wholeNumberOf(reader: FieldReader, path: string, value: unknown): number {
  const number = reader.safeInteger(path, value)
  if (number < 0) reader.record(`${path} must be a whole number from 0`)
  return number
}
