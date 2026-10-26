/**
 * The shape of `economy.json` once read (decision #6 section 8, #20). Every unbounded value is
 * Money/BigStat; bounded values (levels, tiers, ticks, ranges for the physics and the enemy grid)
 * stay plain numbers (#5 rules 1, 2 and 5).
 */
import type { DrillGearCaps } from './drillGearCaps'
import type { ItemHookCaps } from './itemHookCaps'
import type { ItemEffectCaps } from './itemEffectCaps'
import type { CasingCementGrades } from './casingCementGrades'
import type { CasingSurfaceOffsetRules } from './casingLadderRules'
import type { MagnetCaps } from './magnetCaps'
import type { TurretCaps } from './turretCaps'
import type { MagneticHazardCaps } from './magneticHazardCaps'
import type { StarMapRules } from './starMapRules'
import type { DepthDensityCurve } from './depthDensityCurve'
import type { SurfaceLayerRules } from './surfaceLayerRules'
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
  drill_power: 'perPurchase drillPower',
  drill_tip: 'geometric drillTip',
  engine: 'enginePerPurchase engine',
  boiler: 'wholePerPurchase energyMax',
  cargo_hold: 'wholePerPurchase cargoCapacity',
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

/**
 * A stat that grows by one ratio a purchase, with no pip rule and no majors (the GD ruling on #551
 * for ticket 552, drill power only): `D(0) = start`, `D(1) = start * firstGain`, and every purchase
 * after it multiplies by `ratio`, so `D(n) = start * firstGain * ratio^(n - 1)`.
 */
export interface PerPurchaseEffect {
  family: 'perPurchase'
  stat: 'drillPower'
  start: BigStat
  /** The first purchase's gain, the pip it was before: `firstGain.ratio^(1 / firstGain.root)`. */
  firstGain: RatioRoot
  ratio: BigStat
}

/**
 * A whole-number stat that grows by one ratio a purchase, with no pip rule (ticket 553, Systems'
 * rows on #553): the hold's units and the boiler's tank, `round(start * ratio^n)` after `n`
 * purchases, ties to even.
 */
export interface WholePerPurchaseEffect {
  family: 'wholePerPurchase'
  stat: 'cargoCapacity' | 'energyMax'
  start: BigStat
  ratio: BigStat
}

/**
 * The engine bought per purchase (Systems' Proposal 1 on #551, ticket 553): after `e` purchases
 * `speedMax = speedMax0 * ratio^e`, `accel = accel0 * ratio^e` and
 * `thrustToWeight = 1 + netLift0 * ratio^e`, so top speed, acceleration and net lift scale
 * together and the ramp stays the same length. `e = 0` is the starting 6 m/s, 1.0 and 2.0.
 */
export interface EnginePerPurchaseEffect {
  family: 'enginePerPurchase'
  ratio: BigStat
  start: { speedMax: BigStat; accel: BigStat; netLift: BigStat }
}

/** `ratio^(1 / root)`, kept as its parts so the root is worked out the one deterministic way. */
export interface RatioRoot {
  ratio: BigStat
  root: number
}

export type UpgradeEffect =
  GeometricEffect | PerPurchaseEffect | WholePerPurchaseEffect | EnginePerPurchaseEffect

/** The effect families bought per purchase: no pip rule and no majors (#552, ticket 553). */
export const PER_PURCHASE_EFFECT_FAMILIES: readonly UpgradeEffect['family'][] = [
  'perPurchase',
  'wholePerPurchase',
  'enginePerPurchase',
]

export interface UpgradeDef {
  id: UpgradeId
  costCurveId: string
  /** Every track is uncapped in the slice (#7). */
  maxLevel: null
  effect: UpgradeEffect
  /**
   * `onCurveLevel(track, p) = levelAtPlanet1 + levelsPerPlanet * (p - 1)` (#6 section 3), no
   * more than `atMost` where the track has one.
   */
  onCurve: OnCurve
}

/**
 * Where an on-curve player stands, in the track's own levels: majors, or purchases on a
 * per-purchase track (drill power: about 12 at planet 1 and 3 a planet, #551 for ticket 552).
 * `atMost` is where an on-curve rig stops buying a track whose plain-number stat stops paying
 * (ticket 553, Systems' rows on #553): the hold past the largest band's ore, the engine at the
 * 3600 m/s sub-step floor. It bounds the reference rig only; the purchase itself has no max level.
 */
export interface OnCurve {
  levelAtPlanet1: number
  levelsPerPlanet: number
  atMost: number | null
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
 * Prices per purchase with no major split (the GD ruling on #551 for ticket 552, drill power):
 * purchase 0 costs `firstPrice` and purchase `n >= 1` costs `ceil(base * ratio^(n - 1))`, each
 * times `paceScale(p)`.
 */
export interface PerPurchaseCostCurve {
  id: string
  family: 'perPurchase'
  firstPrice: Money
  base: Money
  ratio: Money
}

/**
 * Prices per purchase from the first one, with no major split (Systems' rows on #553, ticket 553:
 * the hold, the boiler and the engine): purchase `n >= 0` costs `ceil(base * ratio^n)`, times
 * `paceScale(p)`.
 */
export interface GeometricPerPurchaseCostCurve {
  id: string
  family: 'geometricPerPurchase'
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

export type CostCurve =
  GeometricCostCurve | PerPurchaseCostCurve | GeometricPerPurchaseCostCurve | BandOreCostCurve

/** A curve that prices one purchase at a time: drill power's, or the hold's and the engine's. */
export type PurchaseCostCurve = PerPurchaseCostCurve | GeometricPerPurchaseCostCurve

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

/**
 * Whether each enemy is metal (GD lock on spec #258 Q5, ticket 291): metal enemies feel a magnetic
 * field's tug and are what the repulsor's push-wave hits. Every built kind states it; an enemy row
 * not built yet may state it ahead of its spec (`emp_mite`, the first metal family).
 */
export type MetalEnemyTags = Readonly<Record<string, boolean>>

/**
 * Whether each enemy always holds a rig whose drill meets it (ticket 564, HS on #551 6254968595):
 * the single hunted targets, `tunnel_wrecker` and `core_guardian`, hold it as a gate-free obstacle
 * whatever the tier comparison says; every other kind rides the nose unless its tier's rock is
 * past the rig's gate tip. Every built kind states it, as with the metal tag; a row not built yet
 * may state it ahead of its spec.
 */
export type RigHolderTags = Readonly<Record<string, boolean>>

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
  /** What a turret shape may ask at most (ticket 382, `turretCaps.ts`). */
  turretCaps: TurretCaps
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
  /** The bot blasts a tile whose drill time would be over this many ticks (4x the old 24-tick floor). */
  botBlastThresholdTicks: number
  radiusTrack: BlastRadiusTrack
  price: ChargePriceRows
  nodePriceAnchors: BlastNodePriceAnchors
  gateTiers: BlastGateTiers
  sizes: ChargeSizeLadder
}

/**
 * What one charge costs (D6 rows on #865, the VS update of 25 Oct): `kDyn * V(t_top(g)) *
 * cells(L_i)^cellsExponent`, rounded up to whole money. `t_top(g)` is band `worthBand`'s ore tier
 * on the planet it is bought on and `cells(L_i)` the tiles of the size's base disc, so the Blast
 * Radius level never reprices a charge. Money only: no planet opens a size.
 */
export interface ChargePriceRows {
  kDyn: Money
  worthBand: number
  /** A rational exponent (0.85, or 0.9 if the soft targets ask), applied without a float root. */
  cellsExponent: BigStat
}

/**
 * The planet each dynamite tech node's price is anchored on (D6 rows on #865): the tree prices a
 * node from its `unlockTier` (#161), so the anchor is where the median bot affords it. Blast Casing
 * (D3 #862) around P5-P6, `blastBit` (D5 #864) around P8-P10. Price only, never a planet gate.
 */
export interface BlastNodePriceAnchors {
  blastCasing: number
  blastBit: number
}

/**
 * The gate tiers of dynamite-gated rock (D4 #863, the HS rows on #647): tier `t` is laid from
 * planet `fromPlanet[t - 1]` (1 and 2 from P7, 3 from P9). A gated cell of lead `newestTierLead`
 * takes the newest tier laid, one of a lower lead that many tiers less, never above its band.
 * World content, so planet-gated; the charges that break it are sold on price alone.
 */
export interface BlastGateTiers {
  fromPlanet: readonly number[]
  newestTierLead: number
}

/**
 * The Blast Radius track's growth (D6 rows on #865, TD on #860): a blast at owned level L clears
 * ground out to `L_i * (1 + L / levelDivisor)^exponent`. The kernel squares it into the integer
 * r² `(2 L_i)² (levelDivisor + L)`, which holds only for a square root, so `exponent` must be 0.5.
 */
export interface BlastRadiusTrack {
  levelDivisor: number
  exponent: BigStat
  /** The track's per-purchase curve (D6 #865: uncapped, money only, times the planet's paceScale). */
  costCurveId: string
}

/** A charge type (D1 #860): the gate tiers its blast breaks; the types are verbs, sizes scale. */
export type ChargeGateTiers = readonly number[]

/**
 * The dynamite size ladder (#143 numbers with amendments 2 and 3, #153 design, the #149 locks):
 * size n (1 first) has `radius[n - 1]` tiles, is sold on every planet (D4 #863: price only) at
 * `ChargePriceRows`' price (D6 #865), keeps `keptBase * keptRatio^(n - 1)` of the ordinary ore it breaks, takes `rackSlots[n - 1]` rack
 * slots, and blows `fuseTicks[n - 1]` ticks after planting; a size past the fuse list is remote
 * (the plunger, #149) and is disarmed `remoteDisarmTicks` after planting. A bare blast of size n
 * collapses each bare rim block it rolls under `collapseBp[n - 1]` (D2 #861, rows of D6 #865). From size
 * `lethalCoreFrom` the inner `lethalCoreFraction` of the radius wrecks the planter.
 */
export interface ChargeSizeLadder {
  /** The one radius ladder (Systems pin on #149, 12 rows D6 #865): whole half-tiles, no formula. */
  radius: readonly BigStat[]
  /** Each size's charge type, 1 to `breaksGateByType.length` (D1 #860: 3 types of 4 sizes). */
  type: readonly number[]
  /** Per type, the gate tiers its blast breaks (`breaksGate[]`, D4 #863 reads it). */
  breaksGateByType: readonly ChargeGateTiers[]
  keptBase: BigStat
  keptRatio: BigStat
  rackSlots: readonly number[]
  fuseTicks: readonly number[]
  lethalCoreFrom: number
  lethalCoreFraction: BigStat
  remoteDisarmTicks: number
  /** Per size, the basis points out of 10000 a bare rim block's roll collapses under (D6 #865). */
  collapseBp: readonly number[]
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
  /**
   * The act's biome: what its ground below band 1 asks of the casing on top of its band's grade,
   * 0 or 1 (ticket 829, the GD re-lock: "the biome decides the casing grade").
   */
  casingBiomeDelta: number
}

export interface Economy {
  /**
   * The economy rules these rows are (TD on #894): it moves with every change of a price row, so
   * golden runs and run metadata record it and a run replays only under the rows that made it. A
   * save stores no prices, so a loaded save simply buys at the rows of the build that loads it.
   * 4 is #894's casing rise (`kCasing` x10, the grade base x5). 5 is D4 #863's money-only
   * dynamite: no planet opens a charge size, no hardness cap on a blast, gated rock by tier. 6 is
   * D6 #865's charge price `kDyn * V(t_top) * cells^0.85` and the Blast Radius track's curve.
   */
  economyRulesVersion: number
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
    /**
     * The ore of a planet's largest band per tile of radius (Systems' rows on #553, ticket 553:
     * about 0.326 R units, 98 on planet 1 and 234 on planet 10): a hold past it carries more than
     * one trip to a band brings back.
     */
    largestBandOrePerRadius: Money
    paceScale: PaceScale
    /** The pinned surface layer and its ramp to band 1 (ticket 625, `surfaceLayerRules.ts`). */
    surfaceLayer: SurfaceLayerRules
    /** Ore per solid tile by depth from planet 3 (ticket 448, `depthDensityCurve.ts`). */
    depthDensity: DepthDensityCurve
  }
  prices: {
    referenceBand: number
    /** `assay_beacon` (#46): ore of the bands below this one sells at this band's unit price. */
    assayBeaconBand: number
    /**
     * The most a merchant's premium lifts its own ore's units at their origin (VS on #821, ticket
     * 844): +25%, a ratio on V(t) that never stacks with another lift.
     */
    orePremiumLiftCap: Money
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
     * The floor of a dense ore cell (#142 "Dense cells", #236): any value past the tip ratio and
     * up to its square puts the gate at `minTipLevel = t + 1` on the major tip, at every tier,
     * with no rounding at the edge (`P(L) = 1.2544^L`, `H(t) = 1.2544^(t-1)`).
     */
    denseScratchFloor: BigStat
    /**
     * The floor of a drill-gated signature cell alone (#142: 1, so the tip needs `P >= H`);
     * every other cell keeps `scratchFloor`.
     */
    gateScratchFloor: BigStat
    /**
     * The least wait after a bore gun shot (GD ruling, 14 Oct, on the #397 TD lock): with no tile
     * floor a shot's dig ticks can reach 1, so `ceil(digTicks × 100 / kGunPct)` alone could wait 3
     * ticks or less. It bounds the recovery, never the drill's speed.
     */
    boreRecoveryMinTicks: number
  }
  costCurves: readonly CostCurve[]
  /**
   * The casing grade (#41 Systems & Economy): a separate counter, not a seventh track. It starts
   * at `casingGradeStart` and each grade is bought at the Upgrade bay along `costCurveId`. The
   * grades by depth (ticket 829, the GD lock re-pinning #41 by name): a planet's surface needs
   * `q_surface`, `casingGradeStart + gradesPerPlanet * (g - 1)` unless its row sets more, and each
   * band one grade more, so a planet's bottom grade is the next one's surface. Past the first
   * planet's bottom grade a grade and a metre of lining cost `planetPriceRatio` (3.375) more a
   * planet, `r = planetPriceRatio^(1 / gradesPerPlanet)` a grade. `surfaceOffset` bounds a row's
   * higher surface: at most `maxLead` grades over the default, and its catch-up at most
   * `catchUpShareBp` of the median bot's money held after the fuel fee, as measured on arrival
   * and written in `moneyHeldAfterFuel` (none yet: no offset ships). `collapseCrush` is the hull
   * fraction a collapse takes off a vehicle caught in it (#43), for bands 1 to 5 and then the core.
   * `kCasing` is the fraction of `V(t(p, b))` one metre of first-placed lining costs (#76): 0.02
   * since #894 (Bjor's playtest: casing far too cheap), ten times #115's 0.002, as the grade
   * curve's base went from 48 to 240.
   * `cementGrades` are the hazard linings as casing_cement grades (ticket 366).
   * `gnawMaxDrop` is how many grades a wrecker gnaw takes off a wall's native band grade against
   * collapse, never below grade 1 (Systems ruling (C) on #676, GD lock): one global integer >= 0.
   */
  casing: {
    costCurveId: string
    casingGradeStart: number
    gradesPerPlanet: number
    planetPriceRatio: BigStat
    surfaceOffset: CasingSurfaceOffsetRules
    gnawMaxDrop: number
    kCasing: BigStat
    collapseCrush: readonly BigStat[]
    cementGrades: CasingCementGrades
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
    metal: MetalEnemyTags
    holdsTheRig: RigHolderTags
    tunnelWrecker: TunnelWreckerRules
    combat: CombatRules
  }
  /** What slice items may do to a vehicle at most (ticket 233, `itemEffectCaps.ts`). */
  itemEffectCaps: ItemEffectCaps
  /** What slice drill gear may add to the drill's cut at most (ticket 234, `drillGearCaps.ts`). */
  drillGearCaps: DrillGearCaps
  /** How far a slice item hook may take a lane at most (ticket 323, `itemHookCaps.ts`). */
  itemHookCaps: ItemHookCaps
  /** The terrain magnets family's caps (GD lock on #246, ticket 282, `magnetCaps.ts`). */
  magnets: MagnetCaps
  /** What a magnetic planet's fields and electrified cells cost at most (#258, ticket 290). */
  magneticHazard: MagneticHazardCaps
  /** The star map's addressing: how the campaign index advances a system (ticket 754). */
  starMap: StarMapRules
}
