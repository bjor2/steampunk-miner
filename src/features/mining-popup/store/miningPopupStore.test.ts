import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { readAuthorityTick, resetGameStore, useGameStore } from '../../../store/gameStore'
import { surfaceOreTiles } from '../../../systems/authority/scriptedSession'
import { oreTypeAtTile } from '../../../systems/authority/tileOre'
import { readAuthorityState } from '../../../store/authorityLink'
import type { ScriptedCommand } from '../../../systems/fastForward'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { planetParamsFor } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { chipsShownAt } from '../systems/chipBoard'
import { plaqueShownAt } from '../systems/plaqueBoard'
import { resetMiningPopupStore, useMiningPopupStore } from './miningPopupStore'
import { NO_DRIVE } from '../../../systems/vehicle/driveSigns'

// The popup hears the game as the HUD does: every batch the game store follows, through
// listenForDomainEvents, while the drill mines real surface ore on the store's starting planet.

const game = () => useGameStore.getState()
const popup = () => useMiningPopupStore.getState()
const PLANET_1 = planetParamsFor(1, 1)
const DRILL_TICKS = 40

let stopListening: () => void

beforeEach(() => {
  resetGameStore()
  resetMiningPopupStore()
  stopListening = listenForDomainEvents((events, playerId) => {
    popup().observePickups(events, playerId)
    popup().observeDiscoveries(events, playerId)
  })
})

afterEach(() => stopListening())

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

function oreIdAt(tile: TilePoint): string | undefined {
  return oreTypeAtTile(readAuthorityState(), tile)?.id
}

/** Surface ore tiles of one type, read before any is mined. */
function tilesByType() {
  const tiles = surfaceOreTiles(20, PLANET_1)
  const firstId = oreIdAt(tiles[0])
  return {
    oreId: firstId,
    same: tiles.filter((tile) => oreIdAt(tile) === firstId),
  }
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

  it('shows nothing for another player', () => {
    const { same } = tilesByType()
    stopListening()
    stopListening = listenForDomainEvents((events) => popup().observePickups(events, 'p-other'))
    mine(same.slice(0, 1))
    expect(popup().chipBoard.chips).toEqual([])
  })
})
