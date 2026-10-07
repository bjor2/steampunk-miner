/**
 * What a charge's blast breaks and pays (spec #109 "Yield trade" and "Limits", numbers): every
 * tile within the radius that is no harder than the planet's band-5 rock and not core loses its
 * unlined ground, lined rings hold, and of each tier's ore units the blast broke
 * `floor(n * k + d)` reach the hold, `k` the charge size's kept fraction (0.4 at size 1, K8 #218)
 * and `d` drawn from the blast tile so a share `k` arrives on average. The
 * rest is lost and its sale value is what `blast_resolved.oreValueLost` reports. A kept unit
 * that finds the hold full is lost as a drilled one is (`storage_full`).
 *
 * The slices' gates have the last word on a gated ore cell (`blastGates.ts`, K2): it stands, is
 * freed whole (its unit collected after the kept share), or breaks with its ore lost and counted.
 *
 * The ground breaks a slice a tick (K6 #189): at most `maxCleared` tiles along the front, the gates
 * asked once per tile on the state the slice starts from. The kept share is of the running total
 * per tier, so a slice keeps `floor(N' * k + d) - floor(N * k + d)` of its units and the whole
 * blast keeps exactly what one break of every tile would.
 */
import { hashCell } from '../../cellRandom'
import { blastHardnessCap, keptBlastOreUnits } from '../../economy/blastingCharges'
import { chargeReachTiles, isInChargeRadius } from '../../economy/chargeSizes'
import { oreSalePrice } from '../../economy/oreEconomy'
import { add, cmp, div, fromSafeInteger, mul, ZERO_MONEY, type Money } from '../../money'
import { MM_PER_METRE } from '../../../constants/physics'
import { blastGround, type GroundBlast, type IsBlastBreakable } from '../../world/blastGround'
import type { YieldedCell } from '../../world/cellYield'
import type { PlanetParams } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import { CELL_KIND, isRemovableCell, kindOfCell } from '../../world/worldCell'
import type { AuthorityState } from '../authorityState'
import { chainEffects, type RuleEffect } from '../commandRule'
import type { DomainEventBody } from '../domainEvent'
import { groundChangedEventsOf } from '../groundChangedEvents'
import { collectOreUnit, hardnessOfTile, kindNameOf } from '../groundDrill'
import { minedOreOf, type MinedOre } from '../minedOre'
import { blastFrontOf } from './blastFront'
import {
  blastGatesOf,
  blastOreFateOf,
  isStandingAgainstBlast,
  type BlastGateOf,
  type BlastOreFate,
} from './blastGates'
import type { LiveBlast } from './liveBlast'

/** A 32-bit cell hash over this is a dither in [0, 1). */
const HASH_RANGE = fromSafeInteger(0x100000000)

/** One slice of a live blast's ground: the world and hold after it, and the blast moved on. */
export interface BrokenSlice {
  effect: RuleEffect
  live: LiveBlast
  /** Front tiles the slice looked at, cleared or passed over. */
  tilesVisited: number
  tilesCleared: number
}

/**
 * One tier's ore the slice broke, in the order it broke it, and how many units reach the hold: the
 * first `kept` of them, so each kept unit names a cell the blast broke (#122).
 */
interface BlastedTier {
  tier: number
  ores: MinedOre[]
  kept: number
}

/** The slice's ore cells by what happens to their ore, each list in the order the blast broke it. */
type BlastedOre = Record<BlastOreFate, MinedOre[]>

export function breakBlastSlice(
  state: AuthorityState,
  params: PlanetParams,
  live: LiveBlast,
  maxCleared: number,
): BrokenSlice {
  const gateOf = blastGatesOf(state, params, live.blast)
  const tiles = frontTilesFrom(live)
  const ground = blastGround(state.world, params, tiles, isBreakableOn(params, gateOf), maxCleared)
  const ores = blastedOreOf(params, ground.yielded, gateOf)
  const tiers = slicedTiersOf(ores.shared, live, ditherOf(state, live))
  const world = { ...state, world: ground.world }
  const collected = collectKeptOre(world, live.blast.playerId, tiers, ores)
  return {
    effect: { state: collected.state, events: sliceEventsOf(ground, collected) },
    live: liveAfterSlice(live, ground, tiers, ores),
    tilesVisited: ground.tilesVisited,
    tilesCleared: ground.tilesCleared,
  }
}

/** The sale value of the ore the whole blast broke and did not keep, a gate's losses included. */
export function oreValueLostOf(state: AuthorityState, live: LiveBlast): Money {
  const dither = ditherOf(state, live)
  const sharesLost = Object.entries(live.oreBrokenByTier).reduce(
    (total, [tier, units]) =>
      add(total, valueOfUnits(tier, units - keptBlastOreUnits(units, dither, live.blast.size))),
    ZERO_MONEY,
  )
  return Object.entries(live.oreLostByTier).reduce(
    (total, [tier, units]) => add(total, valueOfUnits(tier, units)),
    sharesLost,
  )
}

/** Ore units the whole blast sent to the hold, its kept shares and the cells gates freed whole. */
export function oreUnitsKeptOf(state: AuthorityState, live: LiveBlast): number {
  const dither = ditherOf(state, live)
  return Object.values(live.oreBrokenByTier).reduce(
    (total, units) => total + keptBlastOreUnits(units, dither, live.blast.size),
    live.oreUnitsFreed,
  )
}

function valueOfUnits(tier: string, units: number): Money {
  return mul(fromSafeInteger(units), oreSalePrice(Number.parseInt(tier, 10)))
}

/** The tiles whose centre lies within the radius of a charge of `size`, in row order. */
export function blastTilesAround(charge: TilePoint, size: number): TilePoint[] {
  const reach = chargeReachTiles(size)
  const tiles: TilePoint[] = []
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      if (isInChargeRadius(size, dx * MM_PER_METRE, dy * MM_PER_METRE)) {
        tiles.push({ tx: charge.tx + dx, ty: charge.ty + dy })
      }
    }
  }
  return tiles
}

/** The live blast's front from its cursor on, as world tiles. */
function* frontTilesFrom(live: LiveBlast): Generator<TilePoint> {
  const front = blastFrontOf(live.blast.radiusMm)
  for (let at = live.cursor; at < front.length; at++) {
    yield { tx: live.blast.tx + front[at].dx, ty: live.blast.ty + front[at].dy }
  }
}

/** A gated cell breaks as its gate says; any other as before, under the planet's hardness cap. */
function isBreakableOn(params: PlanetParams, gateOf: BlastGateOf): IsBlastBreakable {
  const isBreakableRock = isBreakableRockOn(params)
  return (tile, material) => {
    const gated = gateOf({ tile, cell: material })
    return gated === null ? isBreakableRock(tile, material) : !isStandingAgainstBlast(gated)
  }
}

function isBreakableRockOn(params: PlanetParams): IsBlastBreakable {
  const cap = blastHardnessCap(params.planetIndex)
  return (tile, material) =>
    isRemovableCell(material) &&
    kindOfCell(material) !== CELL_KIND.core &&
    cmp(hardnessOfTile(params, tile, material), cap) <= 0
}

function ditherOf(state: AuthorityState, live: LiveBlast): Money {
  const { tx, ty } = live.blast
  return div(fromSafeInteger(hashCell(state.planet.seed, tx, ty)), HASH_RANGE)
}

function blastedOreOf(
  params: PlanetParams,
  yielded: readonly YieldedCell[],
  gateOf: BlastGateOf,
): BlastedOre {
  const ores: BlastedOre = { shared: [], whole: [], lost: [] }
  for (const cell of yielded) {
    if (kindOfCell(cell.cell) !== CELL_KIND.ore) continue
    ores[blastOreFateOf(gateOf(cell))].push(minedOreOf(params, cell.tile, cell.cell))
  }
  return ores
}

/** Ascending by tier, each with the kept share its units add to the blast's running total. */
function slicedTiersOf(shared: readonly MinedOre[], live: LiveBlast, dither: Money): BlastedTier[] {
  return [...oresByTierOf(shared).entries()]
    .sort(([a], [b]) => a - b)
    .map(([tier, ores]) => {
      const before = live.oreBrokenByTier[String(tier)] ?? 0
      const size = live.blast.size
      const kept =
        keptBlastOreUnits(before + ores.length, dither, size) -
        keptBlastOreUnits(before, dither, size)
      return { tier, ores, kept }
    })
}

function oresByTierOf(shared: readonly MinedOre[]) {
  const oresByTier = new Map<number, MinedOre[]>()
  for (const ore of shared) {
    const ores = oresByTier.get(ore.resourceTier) ?? []
    ores.push(ore)
    oresByTier.set(ore.resourceTier, ores)
  }
  return oresByTier
}

/** The kept share tier by tier, then every unit a gate freed whole. */
function collectKeptOre(
  state: AuthorityState,
  playerId: string,
  tiers: readonly BlastedTier[],
  { whole }: BlastedOre,
): RuleEffect {
  const keptOres = [...tiers.flatMap(({ ores, kept }) => ores.slice(0, kept)), ...whole]
  return chainEffects(
    state,
    keptOres.map((ore) => (current: AuthorityState) => collectOreUnit(current, playerId, ore)),
  )
}

function liveAfterSlice(
  live: LiveBlast,
  ground: GroundBlast,
  tiers: readonly BlastedTier[],
  ores: BlastedOre,
): LiveBlast {
  return {
    ...live,
    cursor: live.cursor + ground.tilesVisited,
    tilesCleared: live.tilesCleared + ground.tilesCleared,
    oreBrokenByTier: withUnitsByTier(
      live.oreBrokenByTier,
      tiers.flatMap(({ ores }) => ores),
    ),
    oreLostByTier: withUnitsByTier(live.oreLostByTier, ores.lost),
    oreUnitsFreed: live.oreUnitsFreed + ores.whole.length,
  }
}

function withUnitsByTier(
  units: Readonly<Record<string, number>>,
  ores: readonly MinedOre[],
): Record<string, number> {
  const counted = { ...units }
  for (const { resourceTier } of ores) {
    counted[String(resourceTier)] = (counted[String(resourceTier)] ?? 0) + 1
  }
  return counted
}

function sliceEventsOf(ground: GroundBlast, collected: RuleEffect): DomainEventBody[] {
  return [
    ...groundChangedEventsOf(ground),
    ...ground.yielded.map(destroyedEventOf),
    ...collected.events,
  ]
}

/** The run log leaves a blast's tiles to its `blast_resolved` line (#154 logging). */
function destroyedEventOf({ tile, cell }: YieldedCell): DomainEventBody {
  return { type: 'TileDestroyed', ...tile, kind: kindNameOf(cell), cause: 'blast' }
}
