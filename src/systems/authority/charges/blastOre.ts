/**
 * What a charge's blast breaks and pays (spec #109 "Yield trade" and "Limits", numbers): every
 * tile within the radius that is no harder than the planet's band-5 rock and not core loses its
 * unlined ground at once, lined rings hold, and of each tier's ore units the blast broke
 * `floor(n * 0.4 + d)` reach the hold, `d` drawn from the blast tile so 40% arrive on average. The
 * rest is lost and its sale value is what `charge_detonated.oreValueLost` reports. A kept unit
 * that finds the hold full is lost as a drilled one is (`storage_full`).
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
import { blastGround } from '../../world/blastGround'
import type { YieldedCell } from '../../world/cellYield'
import type { PlanetParams } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import { CELL_KIND, isRemovableCell, kindOfCell } from '../../world/worldCell'
import type { AuthorityState } from '../authorityState'
import { chainEffects, type RuleEffect } from '../commandRule'
import type { DomainEventBody } from '../domainEvent'
import { groundChangedEventsOf } from '../groundChangedEvents'
import { collectOreUnit, hardnessOfTile, kindNameOf, resourceTierOf } from '../groundDrill'

/** A 32-bit cell hash over this is a dither in [0, 1). */
const HASH_RANGE = fromSafeInteger(0x100000000)

export interface BrokenGround {
  effect: RuleEffect
  tilesCleared: number
  oreValueLost: Money
}

/** One tier's blasted ore units and how many of them reach the hold. */
interface BlastedTier {
  tier: number
  units: number
  kept: number
}

export function breakBlastGround(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  charge: TilePoint,
): BrokenGround {
  const blast = blastGround(state.world, params, blastTilesAround(charge), isBreakableOn(params))
  const tiers = blastedTiersOf(params, blast.yielded, ditherAt(state.planet.seed, charge))
  const collected = collectKeptOre({ ...state, world: blast.world }, playerId, tiers)
  return {
    effect: {
      state: collected.state,
      events: [
        ...groundChangedEventsOf(blast),
        ...blast.yielded.map(destroyedEventOf),
        ...collected.events,
      ],
    },
    tilesCleared: blast.tilesCleared,
    oreValueLost: valueLostOf(tiers),
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

function isBreakableOn(params: PlanetParams) {
  const cap = blastHardnessCap(params.planetIndex)
  return (tile: TilePoint, material: number) =>
    isRemovableCell(material) &&
    kindOfCell(material) !== CELL_KIND.core &&
    cmp(hardnessOfTile(params, tile, material), cap) <= 0
}

function ditherAt(planetSeed: number, charge: TilePoint): Money {
  return div(fromSafeInteger(hashCell(planetSeed, charge.tx, charge.ty)), HASH_RANGE)
}

/** Ascending by tier, each with its kept share. */
function blastedTiersOf(
  params: PlanetParams,
  yielded: readonly YieldedCell[],
  dither: Money,
): BlastedTier[] {
  const unitsByTier = new Map<number, number>()
  for (const { cell } of yielded) {
    if (kindOfCell(cell) !== CELL_KIND.ore) continue
    const tier = resourceTierOf(params, cell)
    unitsByTier.set(tier, (unitsByTier.get(tier) ?? 0) + 1)
  }
  return [...unitsByTier.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tier, units]) => ({ tier, units, kept: keptBlastOreUnits(units, dither) }))
}

function collectKeptOre(
  state: AuthorityState,
  playerId: string,
  tiers: readonly BlastedTier[],
): RuleEffect {
  const units = tiers.flatMap(({ tier, kept }) => Array.from({ length: kept }, () => tier))
  return chainEffects(
    state,
    units.map((tier) => (current: AuthorityState) => collectOreUnit(current, playerId, tier)),
  )
}

function valueLostOf(tiers: readonly BlastedTier[]): Money {
  return tiers.reduce(
    (total, { tier, units, kept }) =>
      add(total, mul(fromSafeInteger(units - kept), oreSalePrice(tier))),
    ZERO_MONEY,
  )
}

function destroyedEventOf({ tile, cell }: YieldedCell): DomainEventBody {
  return { type: 'TileDestroyed', ...tile, kind: kindNameOf(cell) }
}
