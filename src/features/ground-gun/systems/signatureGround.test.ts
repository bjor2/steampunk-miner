import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import {
  FIRE_EAST,
  fireAt,
  gateOnTile,
  ORE_RIG,
  PLAIN_RIG,
  standInPocket,
} from '../../../systems/authority/bore/boreFixtures'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { ofType } from '../../../systems/authority/charges/chargeFixtures'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  createScriptedSession,
  PARAMS,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { setLiningTypeCommand } from '../../../systems/vehicle/vehicleCommands'
import { isCellLined } from '../../../systems/world/casingLining'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { slice as GROUND_GUN_SLICE } from '../register'
import {
  CEMENTING_ROUND_ITEM_ID,
  EARTHING_SPIKE_ITEM_ID,
  RIFLED_BORE_ITEM_ID,
  SPLAY_CHOKE_ITEM_ID,
  STRUT_BORE_ITEM_ID,
} from './boreGunLane'
import { wallLevels } from './boreGunProvider'
import { MODULE_RESTOCK_SERVICE } from './moduleUseReaction'

// The acceptance of ticket 380 (HS and VS on #318) on the real slice: every covered cell of every
// line, splay and turns included, goes through the gates; the cementing round lines only what it
// opened; the earthing spike never opens what the gates refuse; the strut opens and yields nothing.

const FIRE_TICK = 10
const END_TICK = FIRE_TICK + 40
const PLAYER = 'p1'

const mountAtWalls: CommandIntent = { type: 'debug.ground-gun.setLevels', payload: wallLevels() }

function own(itemIds: readonly string[]): CommandIntent {
  return { type: 'debug.setVehicleLoadout', payload: { slots: {}, owned: itemIds } }
}

/** The ground-gun slice alone, with a gate refusing `tile` when one is named. */
function sliceWithGateOn(tile: TilePoint | null, gateKind = 'dynamite'): SliceDefinition[] {
  if (tile === null) return [GROUND_GUN_SLICE]
  const probe: SliceDefinition = {
    id: 'probe',
    register: (r) => r.gateCheck(gateOnTile(tile, 'refused', gateKind)),
  }
  return [GROUND_GUN_SLICE, probe]
}

/** A gun at its walls owning `owned`, standing at `rig`, fired east, the clock run on. */
function shootEast(
  owned: readonly string[],
  rig: TilePoint = PLAIN_RIG,
  fire: CommandIntent = FIRE_EAST,
  prepare: (session: ScriptedSession) => void = () => {},
): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, mountAtWalls)
  session.submit(0, own(owned))
  standInPocket(session, rig, 0)
  prepare(session)
  session.submit(FIRE_TICK, fire)
  session.advanceTo(END_TICK)
  return session
}

function boredTilesOf(events: readonly DomainEvent[]): TilePoint[] {
  return ofType(events, 'TileDestroyed')
    .filter((event) => event.cause === 'bore')
    .map(({ tx, ty }) => ({ tx, ty }))
}

function isOnRow(tile: TilePoint, rig: TilePoint): boolean {
  return tile.ty === rig.ty
}

/** Off-row cells at or past `tile`'s column: where its line would have gone on. */
function pastOnLine(tiles: readonly TilePoint[], tile: TilePoint, rig: TilePoint): TilePoint[] {
  return tiles.filter((other) => !isOnRow(other, rig) && other.tx >= tile.tx)
}

/** A hollow over the third and fourth cells east of `rig` (ticket 379's fixture). */
function carveHollowEast(rig: TilePoint): (session: ScriptedSession) => void {
  return (session) => {
    for (const step of [3, 4, 3, 4]) {
      const centre = { x: (rig.tx + step) * 1000 + 500, y: rig.ty * 1000 + 500 }
      session.submit(0, {
        type: 'debug.carveCircle',
        payload: { ...centre, radius: 1300, amount: 255 },
      })
    }
  }
}

/** Three cells east of the ore rig: ore ahead, and its seam runs on one row down (`ORE_RIG`). */
const SEAM_RIG: TilePoint = { tx: ORE_RIG.tx + 3, ty: ORE_RIG.ty }
/** Five cells east: one ore cell ahead, then the seam turns one row down. */
const TURN_RIG: TilePoint = { tx: ORE_RIG.tx + 5, ty: ORE_RIG.ty }
/** 20 bearing steps below the right horizontal: the splay's twin leaves the row after one cell. */
const FIRE_LOW_EAST = fireAt(235)

describe('ground-gun signature modules: gates on every covered cell (ticket 380, HS on #318)', () => {
  it("refuses a gated ore cell on the splay choke's twin line and opens nothing past it there", () => {
    const twinCell = { tx: SEAM_RIG.tx + 1, ty: SEAM_RIG.ty - 1 }
    const open = withRegistrations(sliceWithGateOn(null), () =>
      boredTilesOf(shootEast([SPLAY_CHOKE_ITEM_ID], SEAM_RIG, FIRE_LOW_EAST).events()),
    )
    expect(open).toContainEqual(twinCell)
    withRegistrations(sliceWithGateOn(twinCell), () => {
      const bored = boredTilesOf(shootEast([SPLAY_CHOKE_ITEM_ID], SEAM_RIG, FIRE_LOW_EAST).events())
      expect(bored).not.toContainEqual(twinCell)
      expect(pastOnLine(bored, twinCell, SEAM_RIG)).toEqual([])
      expect(bored.filter((tile) => isOnRow(tile, SEAM_RIG)).length).toBeGreaterThan(0)
    })
  })

  it("refuses a gated ore cell where the rifled bore's line turns along its seam", () => {
    const turnCell = { tx: TURN_RIG.tx + 1, ty: TURN_RIG.ty - 1 }
    const open = withRegistrations(sliceWithGateOn(null), () =>
      boredTilesOf(shootEast([RIFLED_BORE_ITEM_ID], TURN_RIG).events()),
    )
    expect(open).toContainEqual(turnCell)
    withRegistrations(sliceWithGateOn(turnCell), () => {
      const session = shootEast([RIFLED_BORE_ITEM_ID], TURN_RIG)
      const bored = boredTilesOf(session.events())
      expect(bored).not.toContainEqual(turnCell)
      expect(pastOnLine(bored, turnCell, TURN_RIG)).toEqual([])
      expect(ofType(session.events(), 'BoreEnded')).toMatchObject([{ stop: 'refused' }])
    })
  })

  it('never opens a gated ore cell for the earthing spike: grounding makes nothing diggable', () => {
    const rig = { tx: ORE_RIG.tx + 2, ty: ORE_RIG.ty }
    const open = withRegistrations(sliceWithGateOn(null), () =>
      boredTilesOf(shootEast([EARTHING_SPIKE_ITEM_ID], rig).events()),
    )
    const gated = open[1]
    withRegistrations(sliceWithGateOn(gated), () => {
      const session = shootEast([EARTHING_SPIKE_ITEM_ID], rig)
      expect(boredTilesOf(session.events())).toEqual([open[0]])
      expect(ofType(session.events(), 'BoreEnded')).toMatchObject([{ ...gated, stop: 'refused' }])
    })
  })
})

describe('ground-gun signature modules: what they leave in the ground (ticket 380)', () => {
  it('lines only the cells the cementing round opened, never one it passed through', () =>
    withRegistrations(sliceWithGateOn(null), () => {
      const session = shootEast([CEMENTING_ROUND_ITEM_ID], PLAIN_RIG, FIRE_EAST, (prepared) => {
        prepared.submit(0, setLiningTypeCommand('refractory'))
        const firstCell = { x: (PLAIN_RIG.tx + 1) * 1000 + 500, y: PLAIN_RIG.ty * 1000 + 500 }
        prepared.submit(0, {
          type: 'debug.carveCircle',
          payload: { ...firstCell, radius: 1300, amount: 255 },
        })
      })
      const bored = boredTilesOf(session.events())
      expect(bored.length).toBeGreaterThan(0)
      const lined = (tile: TilePoint) =>
        isCellLined(session.state().world, PARAMS, { tx: tile.tx, ty: tile.ty + 1 })
      expect(bored.every(lined)).toBe(true)
      expect(lined({ tx: PLAIN_RIG.tx + 1, ty: PLAIN_RIG.ty })).toBe(false)
      expect(ofType(session.events(), 'ground-gun.ModuleChargeSpent')).toMatchObject([
        { itemId: CEMENTING_ROUND_ITEM_ID, chargesLeft: 2 },
      ])
    }))

  it('opens no cell and yields nothing with the strut bore, and spends a strut per strut', () => {
    const hollow = carveHollowEast(PLAIN_RIG)
    const plain = withRegistrations(sliceWithGateOn(null), () =>
      shootEast([], PLAIN_RIG, FIRE_EAST, hollow),
    )
    const strut = withRegistrations(sliceWithGateOn(null), () =>
      shootEast([STRUT_BORE_ITEM_ID], PLAIN_RIG, FIRE_EAST, hollow),
    )
    expect(ofType(strut.events(), 'StrutPlaced')).toHaveLength(1)
    expect(boredTilesOf(strut.events())).toEqual(boredTilesOf(plain.events()))
    expect(strut.state().world).toEqual(plain.state().world)
    expect(strut.vehicle().cargo).toEqual(plain.vehicle().cargo)
    expect(ofType(strut.events(), 'ground-gun.ModuleChargeSpent')).toMatchObject([
      { itemId: STRUT_BORE_ITEM_ID, chargesLeft: 1 },
    ])
  })

  it("restocks the spent charges at the dock's recharge, free, and logs the charges after", () =>
    withRegistrations(sliceWithGateOn(null), () => {
      const hollow = carveHollowEast(PLAIN_RIG)
      const session = shootEast([STRUT_BORE_ITEM_ID], PLAIN_RIG, FIRE_EAST, hollow)
      const restocked = MODULE_RESTOCK_SERVICE.onRecharge(session.state(), PLAYER)
      expect(restocked.events).toEqual([
        { type: 'ground-gun.ModuleChargesRefilled', itemId: STRUT_BORE_ITEM_ID, chargesLeft: 2 },
      ])
      expect(MODULE_RESTOCK_SERVICE.onRecharge(restocked.state, PLAYER).events).toEqual([])
      expect(restocked.state.players[PLAYER].wallet).toEqual(session.state().players[PLAYER].wallet)
    }))
})
