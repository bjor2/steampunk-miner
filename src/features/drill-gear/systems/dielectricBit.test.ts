import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { hardnessOfTile, ticksPerCell } from '../../../systems/authority/groundDrill'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import {
  onCurveSessionOn,
  type RecordedSession,
} from '../../../systems/authority/magnetic/magneticFixtures'
import { magneticTugAt, magneticTugOnCutAt } from '../../../systems/authority/magnetic/magneticTug'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { drill, poseAbove } from '../../../systems/authority/scriptedSession'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { shockTicks } from '../../../systems/economy/magneticHazard'
import { onCurveSteps, vehicleStatsAt } from '../../../systems/economy/vehicleStats'
import { cmp, fromCanonical, fromSafeInteger, ZERO_MONEY } from '../../../systems/money'
import { interceptedHullDamage } from '../../../systems/registries/hullDamageIntercepts'
import { isElectrifiedCellAt } from '../../../systems/registries/magneticGround'
import { vehicleItemOfferOf } from '../../../systems/registries/vehicleItemSales'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { generateChunkCells } from '../../../systems/world/generateChunk'
import type { PlanetParams } from '../../../systems/world/planetParams'
import {
  CHUNK_SIZE,
  chunkRangeOfDisc,
  firstTileOfChunk,
  type TilePoint,
} from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../../systems/world/worldCell'
import { cardLinesOf } from './cardLines'
import { DIELECTRIC_BIT_ID } from './dielectricBit'
import { DRILL_GEAR_ECONOMY } from './drillGearEconomy'
import { drillGearItemOf, itemPriceOf, type DrillGearItem } from './drillGearItems'
import { TWIN_BIT_ID } from './twinBit'

// The dielectric bit on the loaded slices (GD lock on spec #258 Q6, ticket 292): in `drill.head`
// it shields the drill while it cuts, so an electrified cell takes no shock and the field does not
// tug the drill; outside a cut the hull still pays. Pure negation, priced at one gear tier.

const MAGNETIC_PLANET = 25
/** The bit's unlock planet, where its one-off price is read (#162 4.1). */
const BIT_PLANET = 27
const FIELD_SEARCH_TILES = 12

interface PlanetCell {
  tile: TilePoint
  cell: number
}

const BIT_HEAD = setVehicleLoadoutCommand({ 'drill.head': DIELECTRIC_BIT_ID })
/** The same command with nothing slotted, so both runs stamp the same `seq`s. */
const BARE_HEAD = setVehicleLoadoutCommand({})
/** The bit owned, the twin bit in the head. */
const BIT_UNMOUNTED = setVehicleLoadoutCommand({ 'drill.head': TWIN_BIT_ID }, [DIELECTRIC_BIT_ID])

/** On-curve on P25 with `head` set, the miner above `tile` at tick 1. */
function sessionAbove(head: CommandIntent, tile: TilePoint): RecordedSession {
  const recorded = onCurveSessionOn(MAGNETIC_PLANET)
  recorded.submit(0, head)
  recorded.submit(1, poseAbove(tile, FACING.down))
  return recorded
}

function paramsOf(recorded: RecordedSession): PlanetParams {
  return planetParamsOf(recorded.session.state().planet) as PlanetParams
}

/** The first cell down the centre column of chunks that `isWanted` keeps. */
function firstCellOf(
  params: PlanetParams,
  isWanted: (tile: TilePoint, cell: number) => boolean,
): PlanetCell {
  const { max } = chunkRangeOfDisc(params.radiusTiles)
  for (let cy = 0; cy <= max; cy++) {
    const cells = generateChunkCells(params, 0, cy)
    const tileAt = (index: number) => ({
      tx: index % CHUNK_SIZE,
      ty: firstTileOfChunk(cy) + Math.floor(index / CHUNK_SIZE),
    })
    const index = cells.findIndex((cell, at) => isWanted(tileAt(at), cell))
    if (index >= 0) return { tile: tileAt(index), cell: cells[index] }
  }
  throw new Error('no such cell on the planet')
}

function electrifiedCellOf(params: PlanetParams): PlanetCell {
  return firstCellOf(params, (tile, cell) => isElectrifiedCellAt(params, tile, cell))
}

/** The same ore, just as hard, in a cell no field electrifies: the planet with no hazard. */
function plainTwinOf(params: PlanetParams, electrified: PlanetCell): PlanetCell {
  return firstCellOf(params, (tile, cell) => isPlainTwin(params, electrified, { tile, cell }))
}

function isPlainTwin(params: PlanetParams, electrified: PlanetCell, other: PlanetCell): boolean {
  const hardness = hardnessOfTile(params, electrified.tile, electrified.cell)
  const isAsHard = cmp(hardnessOfTile(params, other.tile, other.cell), hardness) === 0
  const isSameOre = other.cell === electrified.cell
  return isSameOre && isAsHard && !isElectrifiedCellAt(params, other.tile, other.cell)
}

function plainGroundCellOf(params: PlanetParams): PlanetCell {
  return firstCellOf(params, (_tile, cell) => kindOfCell(cell) === CELL_KIND.ground)
}

/** The ticks the on-curve drill needs for the cell, its shock included. */
function shockedTicksOf(recorded: RecordedSession, { tile, cell }: PlanetCell): number {
  const stats = vehicleStatsAt(onCurveSteps(MAGNETIC_PLANET))
  return ticksPerCell(stats, paramsOf(recorded), tile, cell) as number
}

/** A tile near `from` that a field tugs the rig standing on it. */
function tuggedTileNear(state: AuthorityState, from: TilePoint): TilePoint {
  for (let dy = -FIELD_SEARCH_TILES; dy <= FIELD_SEARCH_TILES; dy++) {
    for (let dx = -FIELD_SEARCH_TILES; dx <= FIELD_SEARCH_TILES; dx++) {
      const tile = { tx: from.tx + dx, ty: from.ty + dy }
      if (magneticTugAt(state, 'p1', tile) !== null) return tile
    }
  }
  throw new Error('no field near the cell')
}

/** Drills `cell` from tick 1 for `ticks`: the events that one report raised. */
function drillFor(recorded: RecordedSession, { tile }: PlanetCell, ticks: number): DomainEvent[] {
  const before = recorded.session.events().length
  recorded.submit(1 + ticks, drill(tile, ticks))
  return recorded.session.events().slice(before)
}

/** The fewest ticks of one report from tick 1 that break `target` with `head` set. */
function fewestTicksToBreak(head: CommandIntent, target: PlanetCell): number {
  const breaksIn = (ticks: number) =>
    isBroken(drillFor(sessionAbove(head, target.tile), target, ticks))
  let low = 0
  let high = shockedTicksOf(onCurveSessionOn(MAGNETIC_PLANET), target)
  if (!breaksIn(high)) throw new Error('the cell never broke')
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (breaksIn(middle)) high = middle
    else low = middle
  }
  return high
}

const ofType = (events: readonly DomainEvent[], type: DomainEvent['type']) =>
  events.filter((event) => event.type === type)

/** What the cut put in the hold, whenever it ended. */
const cargoOf = (events: readonly DomainEvent[]) =>
  ofType(events, 'CargoAdded').map(({ tick: _tick, ...cargo }) => cargo)

const isBroken = (events: readonly DomainEvent[]) => ofType(events, 'TileDestroyed').length > 0

describe('dielectric bit (spec #258 Q6, ticket 292)', () => {
  it('no tug and no cell damage during a cut', () => {
    const probe = onCurveSessionOn(MAGNETIC_PLANET)
    const electrified = electrifiedCellOf(paramsOf(probe))
    const shielded = sessionAbove(BIT_HEAD, electrified.tile)
    const hullBefore = shielded.session.vehicle().hull
    const events = drillFor(
      shielded,
      electrified,
      shockedTicksOf(shielded, electrified) - shockTicks(),
    )
    expect(isBroken(events)).toBe(true)
    expect(ofType(events, 'ElectrifiedCellShocked')).toEqual([
      expect.objectContaining({ ticks: 0, hullBp: 0, withBit: true }),
    ])
    expect(shielded.session.vehicle().hull).toEqual(hullBefore)
    expect(shielded.session.vehicle().shockHullBp).toBeUndefined()
    const state = shielded.session.state()
    const tugged = tuggedTileNear(state, electrified.tile)
    expect(magneticTugOnCutAt(state, 'p1', tugged)).toBeNull()
    const bare = sessionAbove(BARE_HEAD, electrified.tile).session.state()
    expect(magneticTugOnCutAt(bare, 'p1', tugged)).toEqual(magneticTugAt(bare, 'p1', tugged))
  })

  it('the hull still pays outside a cut', () => {
    const probe = onCurveSessionOn(MAGNETIC_PLANET)
    const electrified = electrifiedCellOf(paramsOf(probe))
    const shielded = sessionAbove(BIT_HEAD, electrified.tile).session.state()
    const bare = sessionAbove(BARE_HEAD, electrified.tile).session.state()
    const tugged = tuggedTileNear(bare, electrified.tile)
    expect(magneticTugAt(shielded, 'p1', tugged)).toEqual(magneticTugAt(bare, 'p1', tugged))
    const hit = fromSafeInteger(1000)
    for (const source of ['drill-contact enemy', 'collapse'] as const) {
      expect(interceptedHullDamage(shielded, 'p1', source, shielded.tick, hit)).toEqual(
        interceptedHullDamage(bare, 'p1', source, bare.tick, hit),
      )
    }
  })

  it('shields only from drill.head: owned but unmounted, the cut is shocked', () => {
    const probe = onCurveSessionOn(MAGNETIC_PLANET)
    const electrified = electrifiedCellOf(paramsOf(probe))
    const recorded = sessionAbove(BIT_UNMOUNTED, electrified.tile)
    expect(recorded.session.vehicle().loadout.owned).toContain(DIELECTRIC_BIT_ID)
    const events = drillFor(recorded, electrified, shockedTicksOf(recorded, electrified))
    expect(ofType(events, 'ElectrifiedCellShocked')).toEqual([
      expect.objectContaining({ ticks: shockTicks(), hullBp: 200, withBit: false }),
    ])
  })

  it('price is one gear tier through bandOrePriceAt', () => {
    const bit = drillGearItemOf(DIELECTRIC_BIT_ID) as DrillGearItem
    const price = bandOrePriceAt(DRILL_GEAR_ECONOMY.price, BIT_PLANET, BIT_PLANET)
    expect(bit.node.unlockTier).toBe(BIT_PLANET)
    expect(DRILL_GEAR_ECONOMY.price).toEqual({ band: 5, oreUnits: fromCanonical('15') })
    expect(itemPriceOf(bit)).toEqual(price)
    expect(vehicleItemOfferOf(DIELECTRIC_BIT_ID, BIT_PLANET)?.price).toEqual(price)
    expect(cardLinesOf(DIELECTRIC_BIT_ID, 1).map((line) => [line.label, line.value])).toEqual([
      ['Price', price],
    ])
    expect(cmp(price, ZERO_MONEY)).toBe(1)
  })

  it('no yield', () => {
    const probe = onCurveSessionOn(MAGNETIC_PLANET)
    const plain = plainGroundCellOf(paramsOf(probe))
    const plainTicks = shockedTicksOf(probe, plain)
    const withBit = sessionAbove(BIT_HEAD, plain.tile)
    const bare = sessionAbove(BARE_HEAD, plain.tile)
    expect(drillFor(withBit, plain, plainTicks)).toEqual(drillFor(bare, plain, plainTicks))
    expect(withBit.session.vehicle().energy).toBe(bare.session.vehicle().energy)
    expect(withBit.session.vehicle().cargo).toEqual(bare.session.vehicle().cargo)

    const electrified = electrifiedCellOf(paramsOf(probe))
    const twin = plainTwinOf(paramsOf(probe), electrified)
    const shieldedTicks = fewestTicksToBreak(BIT_HEAD, electrified)
    const shockedTicks = fewestTicksToBreak(BARE_HEAD, electrified)
    expect(shieldedTicks).toBe(fewestTicksToBreak(BARE_HEAD, twin))
    expect(shockedTicks).toBeGreaterThan(shieldedTicks)
    const shieldedCut = sessionAbove(BIT_HEAD, electrified.tile)
    const shockedCut = sessionAbove(BARE_HEAD, electrified.tile)
    const shielded = drillFor(shieldedCut, electrified, shieldedTicks)
    const shocked = drillFor(shockedCut, electrified, shockedTicks)
    expect(cargoOf(shielded)).toEqual(cargoOf(shocked))
    expect(cargoOf(shielded)).not.toEqual([])
    expect(shieldedCut.session.vehicle().cargo).toEqual(shockedCut.session.vehicle().cargo)
  })
})
