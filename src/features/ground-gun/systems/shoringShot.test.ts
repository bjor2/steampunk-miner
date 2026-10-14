import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import { FIRE_EAST, PLAIN_RIG, standInPocket } from '../../../systems/authority/bore/boreFixtures'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { gnawCasingCommand } from '../../../systems/authority/casingDebugCommands'
import { ofType } from '../../../systems/authority/charges/chargeFixtures'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  createScriptedSession,
  PARAMS,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { add, toCanonical, ZERO_MONEY } from '../../../systems/money'
import { isCellReinforced } from '../../../systems/registries/groundReinforcement'
import { setLiningTypeCommand } from '../../../systems/vehicle/vehicleCommands'
import { blockContaining, blockIdOf } from '../../../systems/world/collapseBlock'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { slice as GROUND_GUN_SLICE } from '../register'
import { CEMENTING_ROUND_ITEM_ID } from './boreGunLane'
import { wallLevels } from './boreGunProvider'
import { SHORING_SHOT_REACTION } from './shoringShot'
import { shotCellPrice } from './shotCellPrice'
import { shotCellsOf } from './shotCells'

// Ticket 369 (piece iii of the #157 seam): the cementing round holds what it opened as permanent
// ground, checked on apply, priced in the band of each cell. Only the ground-gun slice is
// registered, so casing_cement's cased tiles (ticket 367) never answer for it.

const FIRE_TICK = 10
const END_TICK = FIRE_TICK + 40
const PLAYER = 'p1'

const mountAtWalls: CommandIntent = { type: 'debug.ground-gun.setLevels', payload: wallLevels() }

function own(itemIds: readonly string[]): CommandIntent {
  return { type: 'debug.setVehicleLoadout', payload: { slots: {}, owned: itemIds } }
}

/** A gun at its walls in refractory lining owning `owned`, fired east, `between` run, then on. */
function shootEast(
  owned: readonly string[],
  between: (session: ScriptedSession) => void = () => {},
): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, mountAtWalls)
  session.submit(0, own(owned))
  session.submit(0, setLiningTypeCommand('refractory'))
  standInPocket(session, PLAIN_RIG, 0)
  session.submit(FIRE_TICK, FIRE_EAST)
  between(session)
  session.advanceTo(END_TICK)
  return session
}

function boredTilesOf(events: readonly DomainEvent[]): TilePoint[] {
  return ofType(events, 'TileDestroyed')
    .filter((event) => event.cause === 'bore')
    .map(({ tx, ty }) => ({ tx, ty }))
}

function reinforcedOf(session: ScriptedSession, tiles: readonly TilePoint[]): TilePoint[] {
  return tiles.filter((tile) => isCellReinforced(session.state(), tile.tx, tile.ty))
}

/** Breaches the lining round each cell's centre: breached lining is weak in every band (#111). */
function gnawLineOf(session: ScriptedSession, tiles: readonly TilePoint[]): void {
  for (const { tx, ty } of tiles) {
    session.submit(END_TICK + 1, gnawCasingCommand(tx * 1000 + 500, ty * 1000 + 500))
  }
}

/**
 * The collapse block holding `tile`. The rig's own pocket is open ground no shot opened, so its
 * block is never all held and may warn (#157: a block is held only when all its open cells are).
 */
function blockOfTile({ tx, ty }: TilePoint): string {
  return blockIdOf(blockContaining({ xMm: tx * 1000 + 500, yMm: ty * 1000 + 500 }))
}

const inGroundGun = <T>(run: () => T): T => withRegistrations([GROUND_GUN_SLICE], run)

describe('ground-gun shoring shot: what it holds (ticket 369)', () => {
  it('holds every cell a cementing round opened as permanent ground once its line ends', () =>
    inGroundGun(() => {
      const session = shootEast([CEMENTING_ROUND_ITEM_ID])
      const bored = boredTilesOf(session.events())
      expect(bored.length).toBeGreaterThan(0)
      expect(reinforcedOf(session, bored)).toEqual(bored)
      expect(Object.values(shotCellsOf(session.state()))).toEqual(bored)
      expect(isCellReinforced(session.state(), PLAIN_RIG.tx, PLAIN_RIG.ty)).toBe(false)
    }))

  it('bills each held cell one metre of first lining at its own band onto the lining bill', () =>
    inGroundGun(() => {
      const session = shootEast([CEMENTING_ROUND_ITEM_ID])
      const bored = boredTilesOf(session.events())
      const price = bored.reduce(
        (total, cell) => add(total, shotCellPrice(PARAMS, cell, 'refractory')),
        ZERO_MONEY,
      )
      expect(ofType(session.events(), 'ground-gun.ShotCellsReinforced')).toMatchObject([
        { cells: bored.length, liningType: 'refractory', price: toCanonical(price) },
      ])
      expect(toCanonical(session.vehicle().liningBill)).toBe(toCanonical(price))
      expect(toCanonical(price)).not.toBe(toCanonical(ZERO_MONEY))
    }))

  it("never warns a block whose open cells it holds, its lining gnawed, where the plain shot's warns", () =>
    inGroundGun(() => {
      const awayFromRig = (owned: readonly string[]) => {
        const session = shootEast(owned)
        gnawLineOf(session, boredTilesOf(session.events()))
        session.advanceTo(END_TICK + 200)
        const warned = ofType(session.events(), 'CollapseWarned').map(({ block }) => block)
        return warned.filter((block) => block !== blockOfTile(PLAIN_RIG))
      }
      expect(awayFromRig([]).length).toBeGreaterThan(0)
      expect(awayFromRig([CEMENTING_ROUND_ITEM_ID])).toEqual([])
    }))
})

describe('ground-gun shoring shot: ownership on apply (ticket 369, TD lock on #157)', () => {
  it("can't be fired by a player who doesn't own the cementing round: nothing held or billed", () =>
    inGroundGun(() => {
      const session = shootEast([])
      expect(boredTilesOf(session.events()).length).toBeGreaterThan(0)
      expect(reinforcedOf(session, boredTilesOf(session.events()))).toEqual([])
      expect(shotCellsOf(session.state())).toEqual({})
      expect(ofType(session.events(), 'ground-gun.ShotCellsReinforced')).toEqual([])
      expect(toCanonical(session.vehicle().liningBill)).toBe(toCanonical(ZERO_MONEY))
    }))

  it('checks ownership as the line ends: a round given up mid-bore holds nothing', () =>
    inGroundGun(() => {
      const session = shootEast([CEMENTING_ROUND_ITEM_ID], (fired) =>
        fired.submit(FIRE_TICK + 1, own([])),
      )
      expect(boredTilesOf(session.events()).length).toBeGreaterThan(0)
      expect(shotCellsOf(session.state())).toEqual({})
      expect(toCanonical(session.vehicle().liningBill)).toBe(toCanonical(ZERO_MONEY))
    }))
})

describe('ground-gun shoring shot: when a shot cell goes (ticket 369)', () => {
  it('drops a held cell the step cut again, and keeps the rest', () =>
    inGroundGun(() => {
      const session = shootEast([CEMENTING_ROUND_ITEM_ID])
      const [cut, ...kept] = boredTilesOf(session.events())
      const destroyed: DomainEvent = {
        type: 'TileDestroyed',
        tick: END_TICK + 1,
        playerId: PLAYER,
        kind: 'ground',
        ...cut,
      }
      const state = session.state()
      const after = SHORING_SHOT_REACTION.react(state, state, [destroyed]).state
      expect(Object.values(shotCellsOf(after))).toEqual(kept)
    }))

  it('drops every shot cell on another planet', () =>
    inGroundGun(() => {
      const session = shootEast([CEMENTING_ROUND_ITEM_ID])
      expect(Object.keys(shotCellsOf(session.state())).length).toBeGreaterThan(0)
      session.submit(END_TICK + 1, { type: 'debug.setPlanet', payload: { planetIndex: 2 } })
      expect(shotCellsOf(session.state())).toEqual({})
    }))
})
