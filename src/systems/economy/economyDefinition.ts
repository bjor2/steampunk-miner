/**
 * The shape of `economy.json` once read (decision #6 section 8, #20). Every unbounded value is
 * Money/BigStat; bounded values (levels, tiers, ticks, ranges for the physics and the enemy grid)
 * stay plain numbers (#5 rules 1, 2 and 5).
 */
import type { ItemEffectCaps } from './itemEffectCaps'
import type { BigStat, Money } from '../money'
import type { WholeFraction } from '../wholeFractions'

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

/** The kinds spawn points hold (#9); the tunnel wrecker comes to a lined route instead (#111). */
export const SPAWN_POINT_ENEMY_KINDS = ['crawler', 'burrower'] as const

export const ENEMY_KINDS = [...SPAWN_POINT_ENEMY_KINDS, 'tunnel_wrecker'] as const

export type EnemyKind = (typeof ENEMY_KINDS)[number]

export type SpawnPointEnemyKind = (typeof SPAWN_POINT_ENEMY_KINDS)[number]

/** The three contact zones of #9; each has its own multiplier on the enemy's base hit. */
export const HIT_ARCS = ['front', 'side', 'rear'] as const

export type HitArc = (typeof HIT_ARCS)[number]

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

/** A share as a fraction in lowest terms, so the pip rules stay in integers (#180 Systems). */
export type StatShare = WholeFraction

/**
 * The two-tier tracks (#180 sections 3 and 4, Systems): a major level is `minorsPerMajor` steps,
 * the pips before the last share `minorStatShare` of the major's gain and the last step, the big
 * level-up, gives the rest.
 */
export interface UpgradeTiers {
  minorsPerMajor: number
  minorStatShare: StatShare
}

export interface GeometricCostCurve {
  id: string
  family: 'geometric'
  base: Money
  ratio: Money
}

/**
 * A price in ore units of one band at the buyer's planet (#105 `cost.refinery.slot`): the
 * travel-fee shape, so it keeps its weight on any planet with no geometric ratio to drift. Level
 * `L` (counted from the first priced level) costs `oreUnitsByLevel[L]` units; past the list there is
 * nothing more to buy.
 */
export interface BandOreCostCurve {
  id: string
  family: 'bandOre'
  band: number
  oreUnitsByLevel: readonly Money[]
}

export type CostCurve = GeometricCostCurve | BandOreCostCurve

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
  /** How long a side or rear hitter backs off before it comes again (#9 `recoilTicks`). */
  recoilTicks: number
}

/** How many wreckers may hunt one vehicle's route from planet `from` on (#111 `maxAliveByPlanet`). */
export interface WreckerCap {
  from: number
  n: number
}

/** The tunnel wrecker's route rules (spec #111, Systems & Economy numbers), in ticks and tiles. */
export interface TunnelWreckerRules {
  /** Ticks of gnawing that breach one ring (the single tuning lever, 180 to 600). */
  gnawTicksPerRing: number
  /** A vehicle this close sends it fleeing into the rock. */
  fleeTiles: number
  /** It never gnaws a ring within this distance of any vehicle. */
  ignoreVehicleTiles: number
  /** Lined rings a vehicle must have laid behind it this trip before the first wrecker comes. */
  minLinedRings: number
  /** Ascending by `from`; the last row at or below the planet applies. */
  maxAliveByPlanet: readonly WreckerCap[]
  /** Ticks after one fled or died before the next may come. */
  respawnTicks: number
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
  densityByRadius: DensityByRadius
  burrowerShare: { numerator: number; denominator: number }
}

/**
 * Spawn density by planet size (#131 Systems): from `fromPlanet` on, every band's density is
 * multiplied by `m(p) = max(floor, min(1, (R(refPlanet) / R(p))^exponent))`, so the spawn points
 * one dive to the core passes stay near the reference planet's.
 */
export interface DensityByRadius {
  fromPlanet: number
  refPlanet: number
  /** A whole step (Systems: 1, then 2, then 3, never higher). */
  exponent: number
  floor: BigStat
}

/** Every price on planet `from` and later is multiplied by `scale`, until the next row (#131). */
export interface PaceScaleStep {
  from: number
  scale: Money
}

/** The balance lever `paceScale(p)` (#6 section 6): `byPlanet`, else the last step, else default. */
export interface PaceScale {
  default: Money
  /** Ascending by `from`; the last row at or below the planet applies. */
  fromPlanet: readonly PaceScaleStep[]
  byPlanet: Map<number, Money>
}

/** A price of `oreUnits` of band `band`'s ore at the purchase planet (#105, #107 `bandOre`). */
export interface BandOreCost {
  band: number
  oreUnits: Money
}

/**
 * `auto_guns` (#107 numbers): a hull turret bought at the Upgrade bay from planet 4. A shot deals
 * `damageFractionOfDrill * drillPower * kDrillVsEnemy`; its interval saturates from
 * `fireIntervalTicks.min` at level 1 toward `.max` (`halfLevel` levels past level 1 gain half the
 * range) up to `maxLevel`. Level 1 is the mount; each later level costs
 * `levelCost.oreUnits * levelCost.ratio^(level - 1)` band ore units, priced like the mount.
 */
export interface GunRules {
  damageFractionOfDrill: BigStat
  fireIntervalTicks: BoundedRange
  halfLevel: number
  maxLevel: number
  rangeTiles: number
  /** The forward cone, centred on the drill axis, the guns never fire into. */
  frontDeadConeDeg: number
  mountCost: BandOreCost
  levelCost: BandOreCost & { id: string; ratio: Money }
}

/**
 * `blasting_charges` (spec #109, Systems & Economy numbers): the blast's hits on a vehicle and on
 * enemies in the radius, the rack and its prices, and the pacing bot's blast rule. The rack holds
 * `rackStart` slots and each bought slot one more, up to `rackMax` (`rackStart` plus one slot per
 * level of the `bandOre` curve `rackSlotCostCurveId`). Everything that differs by charge size is in
 * `sizes` (K8 #218).
 */
export interface BlastingChargeRules {
  /** The hit on the planter's vehicle in a size-1 radius before enemy tier growth (1.5 crawler hits). */
  selfHit: BigStat
  /** An enemy in the radius loses this many times its kind's health at the blast tile's tier. */
  enemyDamageHealthMultiple: BigStat
  /** Every vehicle this close to a planted charge sees its fuse warning (S3 `collapse_warning`). */
  warnTiles: number
  rackStart: number
  rackMax: number
  rackSlotCostCurveId: string
  /** No tile harder than this band's rock of the current planet breaks; core tiles never do. */
  hardnessCapBand: number
  /** The bot blasts a tile whose drill time would be over this many ticks (4x `minTicksPerTile`). */
  botBlastThresholdTicks: number
  sizes: ChargeSizeLadder
}

/**
 * The dynamite size ladder (#143 numbers with amendments 2 and 3, #153 design, the #149 locks):
 * size n (1 first) has `radius[n - 1]` tiles, opens on planet `unlockFrom + unlockEvery * (n - 1)`,
 * costs `oreUnitsBase * oreUnitsRatio^(n - 1)` ore units of band `oreUnitsBand`, keeps
 * `keptBase * keptRatio^(n - 1)` of the ordinary ore it breaks, takes `rackSlots[n - 1]` rack
 * slots, and blows `fuseTicks[n - 1]` ticks after planting; a size past the fuse list is remote
 * (the plunger, #149) and is disarmed `remoteDisarmTicks` after planting. From size
 * `lethalCoreFrom` the inner `lethalCoreFraction` of the radius wrecks the planter. A dynamite-gated
 * cell of lead `newestSizeLead` asks the newest open size, one of a lower lead that many sizes less.
 */
export interface ChargeSizeLadder {
  /** The one radius ladder (Systems pin on #149): no formula and no second copy. */
  radius: readonly BigStat[]
  unlockFrom: number
  unlockEvery: number
  oreUnitsBand: number
  oreUnitsBase: BigStat
  oreUnitsRatio: BigStat
  keptBase: BigStat
  keptRatio: BigStat
  rackSlots: readonly number[]
  fuseTicks: readonly number[]
  lethalCoreFrom: number
  lethalCoreFraction: BigStat
  newestSizeLead: number
  remoteDisarmTicks: number
}

/**
 * A hazard archetype (spec #113 numbers, Systems & Economy): the planets of one act get a hazard
 * gauge, its pockets in the ground and a lining type that answers it. Heat (the Fire act, P8-16) is
 * the first; Ice and Storm add a block of the same shape (#113 "template seam"). Rates are per
 * second of sim time on a 0 to `gaugeMax` gauge; `bandHeatPerSecond` and `hazardPocketVolume` list
 * bands 1 to 5, and the band rates grow by `tail.ratio` a planet into the act, at most `tail.cap`
 * times. Cooling rates are positive amounts taken off the gauge.
 */
export interface HazardArchetype {
  id: string
  planets: { first: number; last: number }
  bandHeatPerSecond: readonly BigStat[]
  drillHeatPerSecond: BigStat
  coolingPerSecond: { idle: BigStat; liningCorridor: BigStat; surface: BigStat }
  gaugeMax: number
  /** Above this the drill is throttled, linearly down to `throttleFloor` of its power at the max. */
  throttleAt: number
  throttleFloor: BigStat
  /** The share of `hullMax` a second the hull loses while the gauge sits at its max. */
  damageAtMaxPerSecond: BigStat
  /** Touching a pocket: gauge points added and the share of `hullMax` lost, once per hit grace. */
  hazardContact: { heat: number; hullFraction: BigStat }
  hazardPocketVolume: readonly BigStat[]
  tail: { ratio: BigStat; cap: BigStat }
  /** The lining type that seals the pockets and cools the tunnel, and its price on the #76 charge. */
  liningType: string
  liningMultiplier: BigStat
  /** The type is unlocked once at the Upgrade bay for this many band ore units (#105 `bandOre`). */
  liningUnlockCost: BandOreCost
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
    /** A signature ore sells this many tiers above its own (#141 Systems: 1, so x1.5). */
    signatureValueLead: number
    /** A drill-gated signature is as hard as the tier this many above its own (#142: `H(t+5)`). */
    signatureDrillHardnessTierOffset: number
  }
  planets: {
    coreFraction: Money
    /** Core fragments one drilled core tile drops into the hold (#10: 1). */
    fragmentsPerTile: number
    paceScale: PaceScale
  }
  prices: {
    referenceBand: number
    /** `assay_beacon` (#46): ore of the bands below this one sells at this band's unit price. */
    assayBeaconBand: number
    chargePerEnergyUnit: Money
    fullRepair: Money
    rescueFee: { moneyFraction: Money; floor: Money; cap: Money }
    travelFee: { fraction: Money; oreUnits: Money; band: number }
  }
  energy: {
    perSecond: { drill: BigStat; thrust: BigStat; drive: BigStat }
    rescueFloorFraction: BigStat
    /**
     * #41: lift + drill drains `thrust + drill`, about this many times the drill alone.
     * Informational only; the live drain is still the sum of the two rates.
     */
    drillUpEnergyMult: BigStat
    /** What one `auto_guns` shot takes from the boiler, in units (#107 numbers). */
    perShot: BigStat
  }
  /** The #7 drill rule's constants, filled in by #6 section 1. */
  drill: {
    /** Below `tip / hardness` of this the drill cannot scratch the tile (`P < H/4`). */
    scratchFloor: BigStat
    /**
     * The floor of a drill-gated signature cell alone (#142: 1, so the tip needs `P >= H`);
     * every other cell keeps `scratchFloor`.
     */
    gateScratchFloor: BigStat
    /** The tile speed cap: 2.5 tiles/s at 60 ticks/s is 24 ticks per tile. */
    minTicksPerTile: number
  }
  costCurves: readonly CostCurve[]
  /**
   * The casing grade (#41 Systems & Economy): a separate counter, not a seventh track. It starts
   * at `casingGradeStart` and each grade is bought at the Upgrade bay along `costCurveId`. Grade
   * `G` holds bands `1..G`; the core needs `casingGradeCoreMin`. `collapseCrush` is the hull
   * fraction a collapse takes off a vehicle caught in it (#43), for bands 1 to 5 and then the core.
   * `kCasing` is the fraction of `V(t(p, b))` one metre of first-placed lining costs (#76).
   */
  casing: {
    costCurveId: string
    casingGradeStart: number
    casingGradeCoreMin: number
    kCasing: BigStat
    collapseCrush: readonly BigStat[]
  }
  /**
   * The Refinery bay (#105 numbers): from `unlockPlanet` the platform has it with `slotsStart`
   * slots, bought up to `slotsMax` along `slotCostCurveId`. A batch holds at most
   * `floor(batchCargoFraction * cargoCapacity)` units of one tier, runs `refineSeconds` of sim time
   * and pays `valueMultiplier` times its raw value at the Sell bay. `refinery.mobile` is reserved
   * for the folded `processing_wagon` (#78) and is not read.
   */
  refinery: {
    unlockPlanet: number
    slotsStart: number
    slotsMax: number
    batchCargoFraction: BigStat
    refineSeconds: number
    valueMultiplier: Money
    slotCostCurveId: string
  }
  blastingCharges: BlastingChargeRules
  upgrades: readonly UpgradeDef[]
  upgradeTiers: UpgradeTiers
  gun: GunRules
  archetypes: readonly HazardArchetype[]
  visualTiers: readonly VisualTierThreshold[]
  enemies: {
    tier: { first: number; perPlanet: number; perBand: number }
    growth: BigStat
    saturationTier: number
    kinds: readonly EnemyDef[]
    tunnelWrecker: TunnelWreckerRules
    combat: CombatRules
  }
  /** What slice items may do to a vehicle at most (ticket 233, `itemEffectCaps.ts`). */
  itemEffectCaps: ItemEffectCaps
}
