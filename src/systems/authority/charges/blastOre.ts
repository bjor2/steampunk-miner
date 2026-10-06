/**
 * What a charge's blast breaks and pays (spec #109 "Yield trade" and "Limits", numbers): every
 * tile within the radius that is no harder than the planet's band-5 rock and not core loses its
 * unlined ground at once, lined rings hold, and of each tier's ore units the blast broke
 * `floor(n * 0.4 + d)` reach the hold, `d` drawn from the blast tile so 40% arrive on average. The
 * rest is lost and its sale value is what `charge_detonated.oreValueLost` reports. A kept unit
 * that finds the hold full is lost as a drilled one is (`storage_full`).
 *
 * The slices' gates have the last word on a gated ore cell (`blastGates.ts`, K2): it stands, is
 * freed whole (its unit collected after the kept share), or breaks with its ore lost and counted.
 */
import { hashCell } from '../../cellRandom'
import { MM_PER_METRE } from '../../../constants/physics'
import {
  blastHardnessCap,
  blastReachTiles,
  isInBlastRadius,
  keptBlastOreUnits,
} from '../../economy/blastingCharges'
import { oreSalePrice } from '../../economy/oreEconomy'
import { add, cmp, div, fromSafeInteger, mul, ZERO_MONEY, type Money } from '../../money'
import type { BlastEvent } from '../../registries/blastEffects'
import { blastGround, type IsBlastBreakable } from '../../world/blastGround'
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
import {
  blastGatesOf,
  blastOreFateOf,
  isStandingAgainstBlast,
  type BlastGateOf,
  type BlastOreFate,
} from './blastGates'

/** A 32-bit cell hash over this is a dither in [0, 1). */
const HASH_RANGE = fromSafeInteger(0x100000000)

export interface BrokenGround {
  effect: RuleEffect
  tilesCleared: number
  oreValueLost: Money
}

/**
 * One tier's blasted ore, in the order the blast broke it, and how many units reach the hold: the
 * first `kept` of them, so each kept unit names a cell the blast broke (#122).
 */
interface BlastedTier {
  tier: number
  ores: MinedOre[]
  kept: number
}

/** The blast's ore cells by what happens to their ore, each list in the order the blast broke it. */
type BlastedOre = Record<BlastOreFate, MinedOre[]>

export function breakBlastGround(
  state: AuthorityState,
  params: PlanetParams,
  blast: BlastEvent,
): BrokenGround {
  const charge = { tx: blast.tx, ty: blast.ty }
  const gateOf = blastGatesOf(state, params, blast)
  const tiles = blastTilesAround(charge)
  const ground = blastGround(state.world, params, tiles, isBreakableOn(params, gateOf))
  const ores = blastedOreOf(params, ground.yielded, gateOf)
  const tiers = blastedTiersOf(ores.shared, ditherAt(state.planet.seed, charge))
  const collected = collectKeptOre({ ...state, world: ground.world }, blast.playerId, tiers, ores)
  return {
    effect: {
      state: collected.state,
      events: [
        ...groundChangedEventsOf(ground),
        ...ground.yielded.map(destroyedEventOf),
        ...collected.events,
      ],
    },
    tilesCleared: ground.tilesCleared,
    oreValueLost: valueLostOf(tiers, ores.lost),
  }
}

/** The tiles whose centre lies within the radius of the charge tile's centre, in row order. */
export function blastTilesAround(charge: TilePoint): TilePoint[] {
  const reach = blastReachTiles()
  const tiles: TilePoint[] = []
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      if (isInBlastRadius(dx * MM_PER_METRE, dy * MM_PER_METRE)) {
        tiles.push({ tx: charge.tx + dx, ty: charge.ty + dy })
      }
    }
  }
  return tiles
}

/** A gated cell breaks as its gate says; any other as today, under the planet's hardness cap. */
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

function ditherAt(planetSeed: number, charge: TilePoint): Money {
  return div(fromSafeInteger(hashCell(planetSeed, charge.tx, charge.ty)), HASH_RANGE)
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

/** Ascending by tier, each with its kept share. */
function blastedTiersOf(shared: readonly MinedOre[], dither: Money): BlastedTier[] {
  const oresByTier = new Map<number, MinedOre[]>()
  for (const ore of shared) {
    const ores = oresByTier.get(ore.resourceTier) ?? []
    ores.push(ore)
    oresByTier.set(ore.resourceTier, ores)
  }
  return [...oresByTier.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tier, ores]) => ({ tier, ores, kept: keptBlastOreUnits(ores.length, dither) }))
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

/** The shares the blast lost, plus every unit a gate says is lost. */
function valueLostOf(tiers: readonly BlastedTier[], lost: readonly MinedOre[]): Money {
  const sharesLost = tiers.reduce(
    (total, { tier, ores, kept }) =>
      add(total, mul(fromSafeInteger(ores.length - kept), oreSalePrice(tier))),
    ZERO_MONEY,
  )
  return lost.reduce((total, ore) => add(total, oreSalePrice(ore.resourceTier)), sharesLost)
}

function destroyedEventOf({ tile, cell }: YieldedCell): DomainEventBody {
  return { type: 'TileDestroyed', ...tile, kind: kindNameOf(cell) }
}
