/**
 * The shape of `economy.json` once read (decision #6 section 8, #20). Every unbounded value is
 * Money/BigStat; bounded values (levels, tiers, ticks, ranges for the physics and the enemy grid)
 * stay plain numbers (#5 rules 1, 2 and 5).
 */
import type { BigStat, Money } from '../money'

/** The six upgrade tracks of #7, in the order the workshop lists them. */
export const UPGRADE_IDS = [
  'drill_power',
  'drill_tip',
  'engine',
  'boiler',
  'cargo_hold',
  'hull',
] as const

export type UpgradeId = (typeof UPGRADE_IDS)[number]

/** The stat each track raises and its curve family (#7 effect shapes). */
export const TRACK_EFFECTS: Readonly<Record<UpgradeId, string>> = {
  drill_power: 'geometric drillPower',
  drill_tip: 'geometric drillTip',
  engine: 'saturating engine',
  boiler: 'linear energyMax',
  cargo_hold: 'linear cargoCapacity',
  hull: 'geometric hullMax',
}

export const ENEMY_KINDS = ['crawler', 'burrower'] as const

export type EnemyKind = (typeof ENEMY_KINDS)[number]

export interface BoundedRange {
  /** Value at tier or level 0; `max` is approached and never reached (#7, #9 saturating). */
  min: number
  max: number
}

export interface GeometricEffect {
  family: 'geometric'
  stat: 'drillPower' | 'drillTip' | 'hullMax'
  start: BigStat
  ratio: BigStat
}

export interface LinearEffect {
  family: 'linear'
  stat: 'energyMax' | 'cargoCapacity'
  start: number
  step: number
}

export interface SaturatingEffect {
  family: 'saturating'
  /** Level at which half of the range is gained (`Ke`). */
  halfLevel: number
  stats: { speedMax: BoundedRange; accel: BoundedRange; thrustToWeight: BoundedRange }
}

export type UpgradeEffect = GeometricEffect | LinearEffect | SaturatingEffect

export interface UpgradeDef {
  id: UpgradeId
  costCurveId: string
  /** Every track is uncapped in the slice (#7). */
  maxLevel: null
  effect: UpgradeEffect
  /** `onCurveLevel(track, p) = levelAtPlanet1 + levelsPerPlanet * (p - 1)` (#6 section 3). */
  onCurve: { levelAtPlanet1: number; levelsPerPlanet: number }
}

export interface CostCurve {
  id: string
  family: 'geometric'
  base: Money
  ratio: Money
}

export interface VisualTierThreshold {
  tier: number
  minTotalLevel: number
}

export interface EnemyDef {
  id: EnemyKind
  health: BigStat
  baseHit: BigStat
  firstPlanet: number
  bands: readonly number[]
  moveTilesPerSecond: BoundedRange
  detectionTiles: BoundedRange
  attackCooldownTicks: BoundedRange
  windupTicks: number
  lungeTilesPerSecond: number
  lungeTicks: number
}

export interface CombatRules {
  kFrontPlayer: BigStat
  kSidePlayer: BigStat
  kRearPlayer: BigStat
  kDrillVsEnemy: BigStat
  hitGraceTicks: number
  maxActivePerVehicle: number
  activationTiles: number
  despawnTiles: number
  spawnPointsPer10ChunksByBand: readonly number[]
  burrowerShare: { numerator: number; denominator: number }
}

export interface Economy {
  economyVersion: number
  ore: {
    tiersPerPlanet: number
    coreTierBand: number
    valueAtTier1: Money
    valueRatio: Money
    hardnessRatio: BigStat
    coreHardnessMultiplier: BigStat
    coreHardnessBand: number
  }
  planets: {
    coreFraction: Money
    /** Core fragments one drilled core tile drops into the hold (#10: 1). */
    fragmentsPerTile: number
    paceScale: { default: Money; byPlanet: Map<number, Money> }
  }
  prices: {
    referenceBand: number
    chargePerEnergyUnit: Money
    fullRepair: Money
    rescueFee: { moneyFraction: Money; floor: Money; cap: Money }
    travelFee: { fraction: Money; oreUnits: Money; band: number }
  }
  energy: {
    perSecond: { drill: BigStat; thrust: BigStat; drive: BigStat }
    rescueFloorFraction: BigStat
  }
  /** The #7 drill rule's constants, filled in by #6 section 1. */
  drill: {
    /** Below `tip / hardness` of this the drill cannot scratch the tile (`P < H/4`). */
    scratchFloor: BigStat
    /** The tile speed cap: 2.5 tiles/s at 60 ticks/s is 24 ticks per tile. */
    minTicksPerTile: number
  }
  costCurves: readonly CostCurve[]
  upgrades: readonly UpgradeDef[]
  visualTiers: readonly VisualTierThreshold[]
  enemies: {
    tier: { first: number; perPlanet: number; perBand: number }
    growth: BigStat
    saturationTier: number
    kinds: readonly EnemyDef[]
    combat: CombatRules
  }
}
