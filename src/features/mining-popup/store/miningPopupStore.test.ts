import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listenForCarvedCells } from '../../../store/carveCompleteBroadcast'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { readAuthorityTick, resetGameStore, useGameStore } from '../../../store/gameStore'
import { surfaceOreTiles } from '../../../systems/authority/scriptedSession'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { oreTypeAtTile } from '../../../systems/authority/tileOre'
import { kindLookProvider } from '../../../systems/registries/kindLook'
import { kindSlotOfCell, NO_KIND_SLOT } from '../../../systems/world/worldCell'
import { cellDensitySum } from '../../../systems/world/cellYield'
import { cellAt } from '../../../systems/world/worldState'
import { readAuthorityState } from '../../../store/authorityLink'
import type { ScriptedCommand } from '../../../systems/fastForward'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { planetParamsFor } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { chipsShownAt } from '../systems/chipBoard'
import { plaqueShownAt } from '../systems/plaqueBoard'
import { resetMiningPopupStore, useMiningPopupStore } from './miningPopupStore'
import { NO_DRIVE } from '../../../systems/vehicle/driveSigns'
import { planetSpeciesOf } from '../../roster'

// The popup hears the game as the HUD does: every batch the game store follows, through
// listenForDomainEvents, and every cell the drill finished carving, through listenForCarvedCells,
// while the drill mines real surface ore on the store's starting planet.

const game = () => useGameStore.getState()
const popup = () => useMiningPopupStore.getState()
const PLANET_1 = planetParamsFor(1, 1)
const DRILL_TICKS = 40

let stopListening: () => void
let stopCarveListening: () => void

beforeEach(() => {
  resetGameStore()
  resetMiningPopupStore()
  stopListening = listenForDomainEvents((events, playerId) => {
    popup().observePickups(events, playerId)
    popup().observeDiscoveries(events, playerId)
  })
  stopCarveListening = listenForCarvedCells((cells, playerId) =>
    popup().observeCarvedCells(cells, playerId),
  )
})

afterEach(() => {
  stopListening()
  stopCarveListening()
})

function poseOver(tile: TilePoint, tick: number): ScriptedCommand {
  const payload = {
    x: tile.tx * 1000 + 500,
    y: (tile.ty + 1) * 1000 + 500,
    vx: 0,
    vy: 0,
    upx: 0,
    upy: 1024,
    facing: FACING.down,
    driving: false,
    thrusting: false,
    drilling: false,
    thrustTicks: 0,
    driveTicks: 0,
    drillTicks: 0,
    drive: NO_DRIVE,
  }
  return { tick, type: 'reportPose', payload }
}

/** Drills each tile from above, `spacing` ticks apart, one fast-forward for the lot. */
function mine(tiles: readonly TilePoint[], spacing = 50): void {
  if (game().vehicle.mode === 'docked') game().undock()
  const start = readAuthorityTick() + 1
  const commands = tiles.flatMap((tile, index): ScriptedCommand[] => [
    poseOver(tile, start + spacing * index),
    {
      tick: start + spacing * index + DRILL_TICKS,
      type: 'drillTile',
      payload: { ...tile, ticks: DRILL_TICKS },
    },
  ])
  game().fastForward(spacing * tiles.length, commands)
}

/** One fixed step's drilling of `tile`, as the game's loop drills it. */
function drillOneTick(tile: TilePoint): void {
  const tick = readAuthorityTick() + 1
  game().fastForward(1, [{ tick, type: 'drillTile', payload: { ...tile, ticks: 1 } }])
}

/** The rarity lead of the species the tile's cell wears on the store's planet, or null. */
function speciesLeadAt(tile: TilePoint): number | null {
  const state = readAuthorityState()
  const params = planetParamsOf(state.planet)!
  const slot = kindSlotOfCell(cellAt(state.world, params, tile))
  if (slot === NO_KIND_SLOT) return null
  return kindLookProvider()?.kindLooksOf(params)[slot - 1]?.rarityLead ?? null
}

/** The species the tile's cell wears on the store's planet, read before it is mined. */
function speciesIdAt(tile: TilePoint): string | null {
  const state = readAuthorityState()
  const params = planetParamsOf(state.planet)!
  return planetSpeciesOf(params, kindSlotOfCell(cellAt(state.world, params, tile)))?.id ?? null
}

function speciesEpithetAt(tile: TilePoint): string | undefined {
  const state = readAuthorityState()
  const params = planetParamsOf(state.planet)!
  return planetSpeciesOf(params, kindSlotOfCell(cellAt(state.world, params, tile)))?.epithet
}

function oreIdAt(tile: TilePoint): string | undefined {
  return oreTypeAtTile(readAuthorityState(), tile)?.id
}

/** Surface ore tiles of one type and one species, read before any is mined. */
function tilesByType() {
  const tiles = surfaceOreTiles(20, PLANET_1)
  const firstId = oreIdAt(tiles[0])
  const firstSpecies = speciesIdAt(tiles[0])
  return {
    oreId: firstId,
    same: tiles.filter((tile) => oreIdAt(tile) === firstId && speciesIdAt(tile) === firstSpecies),
  }
}

/** Two surface ore tiles of one ore type that wear different species, read before either is mined. */
function twoSpeciesOfOneType(): [TilePoint, TilePoint] | null {
  const tiles = surfaceOreTiles(60, PLANET_1).filter((tile) => speciesIdAt(tile) !== null)
  for (const first of tiles) {
    const second = tiles.find(
      (tile) => oreIdAt(tile) === oreIdAt(first) && speciesIdAt(tile) !== speciesIdAt(first),
    )
    if (second !== undefined) return [first, second]
  }
  return null
}

describe('mining popup store', () => {
  it('shows a chip for the ore the drill brings into the hold', () => {
    const { same, oreId } = tilesByType()
    mine(same.slice(0, 1))
    const chips = chipsShownAt(popup().chipBoard, popup().tick)
    expect(chips.map((chip) => [chip.face.oreId, chip.count])).toEqual([[oreId, 1]])
  })

  it('merges a quick run of one type into one chip', () => {
    const { same } = tilesByType()
    mine(same.slice(0, 2), 45)
    const chips = chipsShownAt(popup().chipBoard, popup().tick)
    expect(chips.map((chip) => chip.count)).toEqual([2])
  })

  it('shows the new material plaque once, on the first mine of a type', () => {
    const { same, oreId } = tilesByType()
    mine(same.slice(0, 1))
    const first = plaqueShownAt(popup().plaqueBoard, popup().tick)
    expect(first?.materials.map((line) => line.face.oreId)).toEqual([oreId])
    mine(same.slice(1, 2), 400)
    expect(popup().plaqueBoard.nextSerial).toBe(1)
  })

  it('prices the plaque line at the Sell bay unit price, formatted once', () => {
    const { same } = tilesByType()
    mine(same.slice(0, 1))
    const [line] = plaqueShownAt(popup().plaqueBoard, popup().tick)!.materials
    expect(line.unitPriceText).toMatch(/^\d+(\.\d{1,3})?$/)
  })

  it('clears every chip and plaque on its own once the authority ticks on', () => {
    const { same } = tilesByType()
    mine(same.slice(0, 1))
    game().fastForward(400)
    popup().showAt(readAuthorityTick())
    expect(chipsShownAt(popup().chipBoard, popup().tick)).toEqual([])
    expect(plaqueShownAt(popup().plaqueBoard, popup().tick)).toBeNull()
  })

  it("names a drilled unit's rarity on its chip and plaque once the drill has met its species (ticket 454)", () => {
    const tile = surfaceOreTiles(20, PLANET_1).find(
      (candidate) => speciesLeadAt(candidate) !== null,
    )
    expect(tile).toBeDefined()
    const rarity = kindLookProvider()?.rarityIdOfLead(speciesLeadAt(tile!)!)
    mine([tile!])
    const [chip] = chipsShownAt(popup().chipBoard, popup().tick)
    const [line] = plaqueShownAt(popup().plaqueBoard, popup().tick)!.materials
    expect(chip.rarity?.rarity).toBe(rarity)
    expect(line.rarity).toEqual(chip.rarity)
  })

  it('names a drilled unit on its chip and plaque by its species alone (ticket 695)', () => {
    const [tile] = tilesByType().same
    const epithet = speciesEpithetAt(tile)
    expect(epithet).toBeDefined()
    mine([tile])
    const [chip] = chipsShownAt(popup().chipBoard, popup().tick)
    const [line] = plaqueShownAt(popup().plaqueBoard, popup().tick)!.materials
    expect([chip.face.name, line.face.name]).toEqual([epithet, epithet])
  })

  it('gives two species of one ore type a chip each, under their own names (ticket 695)', () => {
    const pair = twoSpeciesOfOneType()
    expect(pair).not.toBeNull()
    const epithets = pair!.map(speciesEpithetAt)
    mine(pair!, 45)
    const names = chipsShownAt(popup().chipBoard, popup().tick).map((chip) => chip.face.name)
    expect(names).toEqual(epithets)
    expect(new Set(names).size).toBe(2)
  })

  it("leaves a blast's unit unspecified: it names no cell to read the rarity from", () => {
    const tile = surfaceOreTiles(20, PLANET_1).find(
      (candidate) => speciesLeadAt(candidate) !== null,
    )!
    const oreId = oreIdAt(tile)!
    mine([tile])
    popup().showAt(readAuthorityTick() + 400)
    const tick = readAuthorityTick() + 401
    const stamp = { playerId: game().playerId, tick, seq: 1 }
    popup().observePickups(
      [
        { ...stamp, type: 'TileDestroyed', ...tile, kind: 'ore', cause: 'blast' },
        {
          ...stamp,
          type: 'CargoAdded',
          resourceTier: 1,
          amount: 1,
          value: '1e+0',
          oreId,
          depthTiles: 0,
          chunk: '0,0',
        },
      ],
      game().playerId,
    )
    const [chip] = chipsShownAt(popup().chipBoard, tick)
    expect(chip.face.oreId).toBe(oreId)
    expect(chip.rarity).toBeNull()
    expect([chip.face.speciesId, chip.face.name]).toEqual([null, 'Brassvein'])
  })

  it('shows the drill’s chip the tick its cell is carved, not the tick its unit is paid', () => {
    const [tile] = tilesByType().same
    if (game().vehicle.mode === 'docked') game().undock()
    game().fastForward(1, [poseOver(tile, readAuthorityTick() + 1)])
    const params = planetParamsOf(readAuthorityState().planet)!
    const densityLeft = () => cellDensitySum(readAuthorityState().world, params, tile)
    while (game().vehicle.cargoUnits === 0) drillOneTick(tile)
    expect(densityLeft()).toBeGreaterThan(0)
    expect(popup().chipBoard.chips).toEqual([])
    while (densityLeft() > 0) drillOneTick(tile)
    const chips = chipsShownAt(popup().chipBoard, readAuthorityTick())
    expect(chips.map((chip) => [chip.count, chip.firstTick])).toEqual([[1, readAuthorityTick()]])
  })

  it('shows nothing for another player', () => {
    const { same } = tilesByType()
    stopListening()
    stopListening = listenForDomainEvents((events) => popup().observePickups(events, 'p-other'))
    stopCarveListening()
    stopCarveListening = listenForCarvedCells((cells) =>
      popup().observeCarvedCells(cells, 'p-other'),
    )
    mine(same.slice(0, 1))
    expect(popup().chipBoard.chips).toEqual([])
  })
})
