import { describe, expect, it } from 'vitest'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../constants/physics'
import { withRegistrations } from '../../registries/registrar'
import { withoutGatedBite } from '../vehicle/gatedBite'
import { FACING } from '../vehicle/vehiclePose'
import type { TilePoint } from '../world/tileGrid'
import { applyCommand } from './applyCommand'
import { withVehicle, vehicleOf, type AuthorityState } from './authorityState'
import type { CommandIntent } from './authorityCommand'
import type { DomainEvent } from './domainEvent'
import { drillGatedAt, holdDrillOver, refusingGateAt } from './gatedBiteFixtures'
import { createScriptedSession, poseAbove, surfaceOreTiles } from './scriptedSession'
import { stateDigest } from './stateDigest'

// The gated bite (ticket 519) only leaves repeat `DrillGated` lines out: the cut, its charge and
// its dig time are the report's own, replays are exact at any interval, and a rig crossing a gate
// at any speed raises it as often as a slow one does.

const ORE_TILES = surfaceOreTiles(6)
const [ORE_TILE] = ORE_TILES
const GATE = refusingGateAt([ORE_TILE])

/** About 20 degrees off the planet's up, 1024 long within the pose check's tolerance. */
const TILTED_UP = { upx: 350, upy: 962 }

function withoutBiteOf(state: AuthorityState): AuthorityState {
  return withVehicle(state, 'p1', withoutGatedBite(vehicleOf(state, 'p1')))
}

function applyAt(state: AuthorityState, tick: number, intent: CommandIntent) {
  const seq = state.players.p1.lastSeq + 1
  return applyCommand(state, { playerId: 'p1', tick, seq, ...intent })
}

function withoutDrillGated(events: readonly DomainEvent[]): DomainEvent[] {
  return events.filter((event) => event.type !== 'DrillGated')
}

/**
 * Each held report applied twice, once as played and once with the bite taken off first (the
 * report as it ran before ticket 519): the state and the events each gives, the bite and
 * `DrillGated` left out, and how many lines the bite left out.
 */
function heldReportsWithAndWithoutBite(up: { upx: number; upy: number }) {
  return withRegistrations([refusingGateAt(ORE_TILES)], () => {
    const session = createScriptedSession()
    const pairs: { played: string; unbitten: string; leftOut: number }[] = []
    for (let tick = 12; tick <= 120; tick += 12) {
      const intent = poseAbove(ORE_TILE, FACING.down, { drillTicks: 12 })
      const report = { ...intent, payload: { ...intent.payload, ...up } }
      const unbitten = applyAt(withoutBiteOf(session.state()), tick, report)
      const played = session.submit(tick, report)
      pairs.push({
        played: JSON.stringify([
          stateDigest(withoutBiteOf(session.state())),
          withoutDrillGated(played),
        ]),
        unbitten: JSON.stringify([
          stateDigest(withoutBiteOf(unbitten.state)),
          withoutDrillGated(unbitten.events),
        ]),
        leftOut:
          unbitten.events.length -
          withoutDrillGated(unbitten.events).length -
          (played.length - withoutDrillGated(played).length),
      })
    }
    return pairs
  })
}

/**
 * A rig reporting every tick down the column over `tile` at `metresPerSecond`, the drill on, from
 * three metres above the cell's pose to three under it (at least one report each side). The
 * report path carves at the reported pose, so the rig's speed is the spacing of its poses; each
 * report's own velocity is left at rest so the pose check's travel bound does not refuse it.
 */
function crossingAt(tile: TilePoint, metresPerSecond: number) {
  return withRegistrations([GATE], () => {
    const session = createScriptedSession()
    const stepMm = Math.round((metresPerSecond * MM_PER_METRE) / TICKS_PER_SECOND)
    const reach = Math.max(1, Math.ceil((3 * MM_PER_METRE) / stepMm))
    const over = poseAbove(tile, FACING.down, { drillTicks: 1 })
    const reports: DomainEvent[][] = []
    for (let step = reach; step >= -reach; step--) {
      const payload = { ...over.payload, y: over.payload.y + step * stepMm }
      reports.push(session.submit(reports.length + 1, { ...over, payload }))
    }
    return reports
  })
}

/** The `DrillGated` lines at the gated cell, without the command each was raised by. */
function untimedGatesOf(reports: readonly DomainEvent[][]) {
  return drillGatedAt(reports, ORE_TILE).map(({ tick: _raisedAt, seq: _by, ...line }) => line)
}

/** A held drill over `tile` for 120 ticks, reporting every `interval`. */
function heldFor120Ticks(interval: number) {
  return withRegistrations([GATE], () => {
    const session = createScriptedSession()
    const held = holdDrillOver(session, ORE_TILE, 0, 120 / interval, { interval })
    return { lines: untimedGatesOf(held.events), digest: stateDigest(session.state()) }
  })
}

describe('reported drill gate bite on tracks', () => {
  it.each([
    ['flat', { upx: 0, upy: 1024 }],
    ['tilted', TILTED_UP],
  ])(
    'cuts, charges and digs a held gate %s exactly as the report did with no bite',
    (_name, up) => {
      const pairs = heldReportsWithAndWithoutBite(up)
      expect(pairs.map(({ played }) => played)).toEqual(pairs.map(({ unbitten }) => unbitten))
      expect(pairs.some(({ leftOut }) => leftOut > 0)).toBe(true)
    },
  )

  it('replays a held gate identically, at a report every tick and every 12', () => {
    expect(heldFor120Ticks(1)).toEqual(heldFor120Ticks(1))
    expect(heldFor120Ticks(12)).toEqual(heldFor120Ticks(12))
    expect(heldFor120Ticks(1).lines[0]).toMatchObject(ORE_TILE)
    expect(heldFor120Ticks(1).lines).toEqual(heldFor120Ticks(12).lines)
    expect(heldFor120Ticks(1).lines).toHaveLength(1)
  })

  it.each([5, 44, 240, 3600])(
    'a %d m/s rig crossing a gated cell raises what a 5 m/s rig does',
    (metresPerSecond) => {
      const slow = crossingAt(ORE_TILE, 5)
      const fast = crossingAt(ORE_TILE, metresPerSecond)
      expect(fast.flat().filter((event) => event.type === 'CommandRejected')).toEqual([])
      expect(untimedGatesOf(fast)).toEqual(untimedGatesOf(slow))
      expect(drillGatedAt(slow, ORE_TILE)).toHaveLength(1)
    },
  )
})
