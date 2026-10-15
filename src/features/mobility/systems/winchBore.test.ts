import { describe, expect, it } from 'vitest'
import { MM_PER_METRE } from '../../../constants/physics'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { nextShotTickOf } from '../../../systems/authority/bore/boreFire'
import { boreFarEndOf } from '../../../systems/authority/bore/boreLine'
import {
  BORE_STATS,
  FIRE_EAST,
  gateOnTile,
  ORE_RIG,
  PLAIN_RIG,
  standInPocket,
} from '../../../systems/authority/bore/boreFixtures'
import { poseOnTile } from '../../../systems/authority/charges/chargeFixtures'
import { carveCircleCommand } from '../../../systems/authority/groundCommands'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { stateDigest } from '../../../systems/authority/stateDigest'
import type { BoreGunStats } from '../../../systems/registries/boreGun'
import type { GateCheck, GateVerdict } from '../../../systems/registries/gateChecks'
import type { ItemHookContext } from '../../../systems/registries/itemHooks'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { chunkOfTile, cellIndexOfTile, type TilePoint } from '../../../systems/world/tileGrid'
import { withLavaFlipped } from '../../../systems/world/chunkDelta'
import { deltaOfChunk, withChunkDelta } from '../../../systems/world/worldState'
import { chargesLeftOf, withPowerUpCore } from '../../power-up-core'
import { ofType, press } from '../mobilityTestSession'
import { slice as MOBILITY_SLICE } from '../register'
import { MOBILITY_ITEM } from './itemIds'
import { mobilityOf } from './mobilitySection'
import { MOBILITY_POWER_UPS } from './mobilityPowerUps'

// The winch bore's mobility side (ticket 414, TD lock 6180863028 on #320 section 1, GD ruling
// 6180873822): the grapple asks the `reach` hook once per fire, and while it answers past the
// shot's own range the reel goes to the far end of the miner's own latest bore line, on that tile,
// whatever the aim cone. A probe hook stands in for the combo #320 registers, answering as the lock
// words it: ceil(distance) − magnitude while the shot is at most 60 ticks old.

const GRAPPLE = { 'powerup.1': MOBILITY_ITEM.grappleWinch }
const FIRE_TICK = 10
/** Ten cells at one every 2 ticks: the line has opened by tick 30 and stands 30 more. */
const PRESS_TICK = 32
const WINDOW_TICKS = 60
/** The probe gun: the 10-cell range cap, a budget and energy that never stop a line short. */
const LONG_GUN: BoreGunStats = {
  ...BORE_STATS,
  rangeCells: 10,
  boreBudgetTicks: 100000,
  energyPerCellBp: 10000,
}

type HookAnswer = (state: AuthorityState, playerId: string, ctx: ItemHookContext) => number | null

/** The lock's winch bore answer, as #320 will register it. */
const winchBoreAnswer: HookAnswer = (state, playerId, ctx) => {
  const farEnd = boreFarEndOf(state, playerId)
  if (farEnd === null || ctx.tick - farEnd.firedTick > WINDOW_TICKS) return null
  const dx = farEnd.tile.tx - ctx.origin.tx
  const dy = farEnd.tile.ty - ctx.origin.ty
  return Math.max(0, Math.ceil(Math.sqrt(dx * dx + dy * dy)) - ctx.magnitude)
}

interface Probe {
  gun?: BoreGunStats
  answer?: HookAnswer
  gate?: GateCheck
}

function probeSlice({ gun = LONG_GUN, answer, gate }: Probe): SliceDefinition {
  return {
    id: 'probe',
    register(r) {
      r.boreGun({ id: 'probe.bore-gun', boreGunOf: () => gun })
      if (answer !== undefined) r.itemHook(reachHookOf(answer))
      if (gate !== undefined) r.gateCheck(gate)
    },
  }
}

function reachHookOf(answer: HookAnswer) {
  return {
    id: 'probe.winch-bore-reach',
    hook: 'reach' as const,
    laneId: 'mobility',
    parentItemId: MOBILITY_ITEM.grappleWinch,
    answer,
  }
}

/** A gate only a power-up's query hears, so the bore opens the cell and the grapple asks it. */
function toolGateOn(tile: TilePoint, outcome: GateVerdict['outcome'], gateKind: string) {
  const gate = gateOnTile(tile, outcome, gateKind)
  return {
    id: gate.id,
    check: (query: Parameters<GateCheck['check']>[0]) =>
      query.tool === undefined ? null : gate.check(query),
  }
}

function playWith<T>(probe: Probe, run: () => T): T {
  return withPowerUpCore([MOBILITY_SLICE, probeSlice(probe)], run)
}

/** The grapple slotted, the rig in its pocket facing east, one bore fired east at tick 10. */
function boredFrom(rig: TilePoint): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, setVehicleLoadoutCommand(GRAPPLE))
  standInPocket(session, rig, 1)
  session.submit(FIRE_TICK, FIRE_EAST)
  session.advanceTo(FIRE_TICK + 1)
  return session
}

/** Opens the row west of `rig` for `tiles` tiles and stands the miner at its west end. */
function standWestOf(session: ScriptedSession, rig: TilePoint, tiles: number, tick: number) {
  for (let step = 1; step <= tiles; step += 1)
    carveTileAt(session, { tx: rig.tx - step, ty: rig.ty }, tick)
  session.submit(tick, poseOnTile({ tx: rig.tx - tiles, ty: rig.ty }, FACING.right))
}

function carveTileAt(session: ScriptedSession, tile: TilePoint, tick: number) {
  const centre = { x: tile.tx * MM_PER_METRE + 500, y: tile.ty * MM_PER_METRE + 500 }
  session.submit(tick, carveCircleCommand({ ...centre, radius: 450, amount: 255 }))
}

/** Presses the grapple at `tick` and plays out its wind-up; the reel's target, or null. */
function grappleAt(session: ScriptedSession, tick: number): TilePoint | null {
  session.submit(tick, press())
  session.advanceTo(tick + 8)
  const reel = mobilityOf(session.state(), 'p1').reel
  return reel === null ? null : { tx: reel.tx, ty: reel.ty }
}

/** Plays on past the gun's recovery, when the bore's line is dropped (`boreTick.ts`). */
function tickTheLineIsGone(session: ScriptedSession): number {
  session.advanceTo(nextShotTickOf(session.state(), 'p1') + 1)
  return session.state().tick + 1
}

function farEndOf(session: ScriptedSession): TilePoint {
  session.advanceTo(PRESS_TICK - 1)
  const farEnd = boreFarEndOf(session.state(), 'p1')
  if (farEnd === null) throw new Error('the bore opened nothing')
  return farEnd.tile
}

describe('winch bore: the far end', () => {
  it('reels onto the far end of a line past the shot range, outside the aim cone', () =>
    playWith({ answer: winchBoreAnswer }, () => {
      const session = boredFrom(PLAIN_RIG)
      const farEnd = farEndOf(session)
      expect(farEnd).toEqual({ tx: PLAIN_RIG.tx + 10, ty: PLAIN_RIG.ty })
      expect(grappleAt(session, PRESS_TICK)).toEqual(farEnd)
      expect(ofType(session.events(), 'mobility.GrappleHooked')).toMatchObject([
        { hookTx: farEnd.tx, hookTy: farEnd.ty, toTx: farEnd.tx, toTy: farEnd.ty },
      ])
    }))

  it('spends one grapple charge and its cooldown', () =>
    playWith({ answer: winchBoreAnswer }, () => {
      const session = boredFrom(PLAIN_RIG)
      farEndOf(session)
      grappleAt(session, PRESS_TICK)
      expect(chargesLeftOf(session.state(), 'p1', MOBILITY_ITEM.grappleWinch)).toBe(3)
      grappleAt(session, PRESS_TICK + 10)
      expect(ofType(session.events(), 'mobility.GrappleHooked')).toHaveLength(1)
      expect(chargesLeftOf(session.state(), 'p1', MOBILITY_ITEM.grappleWinch)).toBe(3)
    }))

  it('reaches a far end exactly 12 cells off and none past the 12-cell clamp', () => {
    const at = (tiles: number) =>
      playWith({ answer: winchBoreAnswer }, () => {
        const session = boredFrom(PLAIN_RIG)
        const farEnd = farEndOf(session)
        standWestOf(session, PLAIN_RIG, tiles, PRESS_TICK - 1)
        return { farEnd, reel: grappleAt(session, PRESS_TICK) }
      })
    const twelve = at(2)
    expect(twelve.reel).toEqual(twelve.farEnd)
    const thirteen = at(3)
    expect(thirteen.reel).not.toEqual(thirteen.farEnd)
  })
})

describe('winch bore: refused', () => {
  it('plays exactly as with no hook when the combo is not owned', () => {
    const play = (probe: Probe) =>
      playWith(probe, () => {
        const session = boredFrom(PLAIN_RIG)
        const farEnd = farEndOf(session)
        const reel = grappleAt(session, PRESS_TICK)
        return { farEnd, reel, digest: stateDigest(session.state()), events: session.events() }
      })
    const unowned = play({ answer: () => null })
    const none = play({})
    expect(unowned.reel).not.toEqual(unowned.farEnd)
    expect(unowned.digest).toBe(none.digest)
    expect(unowned.events).toEqual(none.events)
  })

  it('takes no far end once the shot is older than the 60-tick window', () =>
    playWith({ gun: { ...LONG_GUN, collapseHoldTicks: 200 }, answer: winchBoreAnswer }, () => {
      const session = boredFrom(PLAIN_RIG)
      const farEnd = farEndOf(session)
      const reel = grappleAt(session, FIRE_TICK + WINDOW_TICKS)
      expect(boreFarEndOf(session.state(), 'p1')).not.toBeNull()
      expect(reel).not.toEqual(farEnd)
    }))

  it('takes no far end once the line no longer stands, whatever the hook answers', () =>
    playWith({ answer: () => 4 }, () => {
      const session = boredFrom(PLAIN_RIG)
      const farEnd = farEndOf(session)
      const reel = grappleAt(session, tickTheLineIsGone(session))
      expect(boreFarEndOf(session.state(), 'p1')).toBeNull()
      expect(reel).not.toEqual(farEnd)
    }))

  it('takes no far end it cannot see through open cells', () =>
    playWith({ answer: winchBoreAnswer }, () => {
      const session = boredFrom(PLAIN_RIG)
      const farEnd = farEndOf(session)
      const below = { tx: PLAIN_RIG.tx + 1, ty: PLAIN_RIG.ty - 4 }
      carveTileAt(session, below, PRESS_TICK - 1)
      session.submit(PRESS_TICK - 1, poseOnTile(below, FACING.right))
      expect(grappleAt(session, PRESS_TICK)).not.toEqual(farEnd)
    }))

  it.each([
    ['gated', 'rig'],
    ['tip-locked', 'drill'],
  ])('takes no %s far end, and takes one a gate cuts', (_name, gateKind) => {
    const reelWith = (outcome: GateVerdict['outcome']) =>
      playWith(
        {
          gun: BORE_STATS,
          answer: winchBoreAnswer,
          gate: toolGateOn(oreFarEnd(), outcome, gateKind),
        },
        () => {
          const session = boredFrom(ORE_RIG)
          expect(farEndOf(session)).toEqual(oreFarEnd())
          standWestOf(session, ORE_RIG, 6, PRESS_TICK - 1)
          return grappleAt(session, PRESS_TICK)
        },
      )
    expect(reelWith('refused')).not.toEqual(oreFarEnd())
    expect(reelWith('blocked')).not.toEqual(oreFarEnd())
    expect(reelWith('cut')).toEqual(oreFarEnd())
  })

  it('takes no far end that lava has flowed into', () =>
    playWith({ answer: winchBoreAnswer }, () => {
      const session = boredFrom(PLAIN_RIG)
      const farEnd = farEndOf(session)
      const grapple = MOBILITY_POWER_UPS.find(
        (powerUp) => powerUp.itemId === MOBILITY_ITEM.grappleWinch,
      )!
      const use = {
        playerId: 'p1',
        itemId: grapple.itemId,
        slot: 'powerup.1' as const,
        tick: PRESS_TICK,
        origin: PLAIN_RIG,
        mark: 0,
        magnitude: null,
      }
      const open = grapple.activate(session.state(), use)
      const flooded = grapple.activate(withLavaAt(session.state(), farEnd), use)
      expect(open).toMatchObject({ kind: 'acted', effect: { events: [{ toTx: farEnd.tx }] } })
      expect(flooded).not.toMatchObject({ effect: { events: [{ toTx: farEnd.tx }] } })
    }))
})

/** The fourth cell east of the ore rig, ore in the ground: the far end a 4-cell shot opens. */
function oreFarEnd(): TilePoint {
  return { tx: ORE_RIG.tx + 4, ty: ORE_RIG.ty }
}

function withLavaAt(state: AuthorityState, tile: TilePoint): AuthorityState {
  const cx = chunkOfTile(tile.tx)
  const cy = chunkOfTile(tile.ty)
  const delta = withLavaFlipped(deltaOfChunk(state.world, cx, cy), [
    cellIndexOfTile(tile.tx, tile.ty),
  ])
  return { ...state, world: withChunkDelta(state.world, cx, cy, delta) }
}
