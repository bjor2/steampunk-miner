import { describe, expect, it } from 'vitest'
import { COLLAPSE_WARN_TICKS } from '../../../constants/balance'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { recordDomainEventsTo } from '../../../logging/domainEventLog'
import { createMemorySink } from '../../../logging/eventSink'
import { createRunLog } from '../../../logging/runLog'
import { runEventProblems } from '../../../logging/runEventSchema'
import { advanceTicks } from '../../../systems/authority/advanceTicks'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { buildWeakTunnel } from '../../../systems/authority/collapse/collapseFixtures'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { carveCircleCommand } from '../../../systems/authority/groundCommands'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { isDiggableByStartingDrill } from '../../../systems/authority/magnet/magnetFixtures'
import {
  createScriptedSession,
  PARAMS,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { readSnapshot, takeSnapshot } from '../../../systems/authority/sessionSnapshot'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { NEW_FIXED_STEP_CLOCK, stepsForFrame } from '../../../systems/fixedStepClock'
import { ENERGY_QUANTA_PER_TICK } from '../../../systems/vehicle/energyQuanta'
import { FACING, tileOfPose } from '../../../systems/vehicle/vehiclePose'
import { SOLID_DENSITY } from '../../../systems/world/sampleGrid'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../../systems/world/worldCell'
import { cellAt } from '../../../systems/world/worldState'
import { chargesLeftOf, intentToReleaseSlot } from '../../power-up-core'
import { buriedTile, MM, ofType, press, sessionWith, standAt } from '../terrainTestSession'
import { distanceSqOf } from './editGeometry'
import { bracedBlocksOf, LODE_CLAMP_ID } from './lodeClamp'
import { terrainToolsOf } from './terrainSection'

// The lode clamp (GD lock on #246, the anchor verb; the GD, TD and G&V lines on #285, ticket 285):
// a field held from its slot pins up to 8 diggable cells, moves none, and braces every collapse
// block that contains or borders one. Every way the field ends (release, its length, a dry tank)
// gives each braced block a fresh 60-tick warning, logs `magnet_used` once and starts the cooldown.
// The scene is the collapse specs' weak band-2 tunnel: its blocks warn on tick 10 and would refill
// on tick 70, the miner at rest in its middle with the clamp in slot 1.

const CLAMP_SLOT = { 'powerup.1': LODE_CLAMP_ID }
const WARN_TICK = 10
const REFILL_TICK = WARN_TICK + COLLAPSE_WARN_TICKS
const PRESS_TICK = 20
/** The clamp's wind-up is 6 ticks (terrain-tools.economy.json). */
const ACT_TICK = PRESS_TICK + 6
/** Mark 0 holds for the bought 180 ticks. */
const FINISH_TICK = ACT_TICK + 180
const RELEASE_TICK = 100
/** Half a unit: 120 quanta, 30 ticks of the drill's draw. */
const LOW_TANK_TICK = 40
const LOW_TANK_UNITS = '0.5'
const STEP_RATES = [30, 144] as const

/** The weak tunnel with the clamp slotted, warning from `WARN_TICK`. */
function clampTunnel(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, setVehicleLoadoutCommand(CLAMP_SLOT))
  buildWeakTunnel(session, WARN_TICK)
  return session
}

/** The tunnel with the clamp pressed and its field locked on `ACT_TICK`. */
function heldClamp(): ScriptedSession {
  const session = clampTunnel()
  session.submit(PRESS_TICK, press())
  session.advanceTo(ACT_TICK)
  return session
}

const blocksOf = (events: readonly DomainEvent[], type: 'CollapseWarned' | 'CollapseBraced') =>
  ofType(events, type).map((event) => ('block' in event ? event.block : ''))

const startTicksOf = (session: ScriptedSession, block: string) =>
  ofType(session.events(), 'CollapseStarted')
    .filter((event) => 'block' in event && event.block === block)
    .map(({ tick }) => tick)

const warnTicksOf = (session: ScriptedSession, block: string) =>
  ofType(session.events(), 'CollapseWarned')
    .filter((event) => 'block' in event && event.block === block)
    .map(({ tick }) => tick)

function bracedBlocks(session: ScriptedSession): string[] {
  return blocksOf(session.events(), 'CollapseBraced')
}

function fieldCells(state: AuthorityState): readonly TilePoint[] {
  return terrainToolsOf(state, 'p1').clamp?.cells ?? []
}

function usedEvents(session: ScriptedSession) {
  return ofType(session.events(), 'terrain-tools.MagnetUsed')
}

/** The tick the field ended, from its one `MagnetUsed`. */
function endTickOf(session: ScriptedSession): number {
  const [used] = usedEvents(session)
  if (used === undefined) throw new Error('the field never ended')
  return used.tick
}

/** A field held from `ACT_TICK`, ended the way `end` names; answers the session past the refill. */
function endedBy(end: 'release' | 'duration' | 'dry tank'): ScriptedSession {
  const session = heldClamp()
  if (end === 'release') session.submit(RELEASE_TICK, intentToReleaseSlot('powerup.1'))
  if (end === 'dry tank')
    session.submit(LOW_TANK_TICK, { type: 'debug.setEnergy', payload: { energy: LOW_TANK_UNITS } })
  session.advanceTo(FINISH_TICK + COLLAPSE_WARN_TICKS + 30)
  return session
}

function magnetUsedLines(session: ScriptedSession) {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_285', sink, secondsSinceStart: () => 0 })
  recordDomainEventsTo(runLog, { playerId: 'p1', planet: 1, depthTiles: 0 }, session.events())
  return sink.events.filter((line) => (line.event as string) === 'terrain-tools.magnet_used')
}

describe('lode clamp: the pinned set', () => {
  it('pins at most 8 diggable cells nearest the rig, and moves none of them', () => {
    const session = clampTunnel()
    session.advanceTo(PRESS_TICK)
    const before = session.state()
    session.submit(PRESS_TICK, press())
    session.advanceTo(RELEASE_TICK)
    const cells = fieldCells(session.state())
    const rig = tileOfPose(before.players.p1.vehicle.pose!)
    expect(cells.length).toBeGreaterThan(0)
    expect(cells.length).toBeLessThanOrEqual(8)
    const distances = cells.map((cell) => distanceSqOf(cell, rig))
    expect(distances).toEqual([...distances].sort((a, b) => a - b))
    expect(Math.max(...distances)).toBeLessThanOrEqual(2 * 2)
    for (const cell of cells) {
      expect(cellAt(session.state().world, PARAMS, cell)).toBe(cellAt(before.world, PARAMS, cell))
      expect([CELL_KIND.ground, CELL_KIND.ore]).toContain(
        kindOfCell(cellAt(before.world, PARAMS, cell)),
      )
      expect(isDiggableByStartingDrill(PARAMS, cell)).toBe(true)
    }
  })

  it('is refused with nothing to pin in an open cave, and costs nothing', () => {
    const session = sessionWith(CLAMP_SLOT)
    const stand = buriedTile(12)
    standAt(session, 5, stand, FACING.right)
    const centre = { x: stand.tx * MM + MM / 2, y: stand.ty * MM + MM / 2 }
    session.submit(5, carveCircleCommand({ ...centre, radius: 3500, amount: SOLID_DENSITY }))
    const energyBefore = session.vehicle().energy
    session.submit(PRESS_TICK, press())
    session.advanceTo(ACT_TICK + 10)
    expect(ofType(session.events(), 'power-up-core.PowerUpRefused')).toMatchObject([
      { itemId: LODE_CLAMP_ID, reason: 'terrain-tools.nothing_to_pin' },
    ])
    expect(session.vehicle().energy).toBe(energyBefore)
    expect(chargesLeftOf(session.state(), 'p1', LODE_CLAMP_ID)).toBe(2)
    expect(usedEvents(session)).toEqual([])
  })
})

describe('lode clamp: the brace', () => {
  it('braces every warning block that contains or borders a pinned cell, and no other', () => {
    const session = heldClamp()
    const warned = new Set(blocksOf(session.events(), 'CollapseWarned'))
    const claimed = new Set(bracedBlocksOf(session.state(), 'p1'))
    const expected = [...warned].filter((block) => claimed.has(block)).sort()
    expect(expected.length).toBeGreaterThan(0)
    expect([...bracedBlocks(session)].sort()).toEqual(expected)
    expect(ofType(session.events(), 'CollapseBraced').map(({ tick }) => tick)).toEqual(
      expected.map(() => ACT_TICK),
    )
  })

  it('holds the braced blocks past their refill tick while the slot is held', () => {
    const session = heldClamp()
    session.advanceTo(RELEASE_TICK - 1)
    const braced = bracedBlocks(session)
    expect(braced.flatMap((block) => startTicksOf(session, block))).toEqual([])
    const unbraced = blocksOf(session.events(), 'CollapseWarned').filter(
      (block) => !braced.includes(block),
    )
    expect(unbraced.flatMap((block) => startTicksOf(session, block))).toEqual(
      unbraced.map(() => REFILL_TICK),
    )
  })

  it('braces nothing once the clamp is no longer owned', () => {
    const session = heldClamp()
    expect(bracedBlocksOf(session.state(), 'p1').length).toBeGreaterThan(0)
    session.submit(ACT_TICK + 10, setVehicleLoadoutCommand({}))
    expect(bracedBlocksOf(session.state(), 'p1')).toEqual([])
  })
})

describe('lode clamp: every way the field ends behaves the same', () => {
  it.each(['release', 'duration', 'dry tank'] as const)(
    'gives every braced block a fresh 60-tick warning when the field ends by %s',
    (end) => {
      const session = endedBy(end)
      const endTick = endTickOf(session)
      const braced = bracedBlocks(session)
      expect(braced.length).toBeGreaterThan(0)
      for (const block of braced) {
        expect(warnTicksOf(session, block)).toEqual([WARN_TICK, endTick])
        expect(startTicksOf(session, block)).toEqual([endTick + COLLAPSE_WARN_TICKS])
      }
    },
  )

  it('ends on the release tick, at its length, or on the tick the tank runs dry', () => {
    expect(endTickOf(endedBy('release'))).toBe(RELEASE_TICK)
    expect(endTickOf(endedBy('duration'))).toBe(FINISH_TICK)
    const dried = endedBy('dry tank')
    expect(endTickOf(dried)).toBeLessThan(FINISH_TICK)
    expect(ofType(dried.events(), 'EnergyDepleted').map(({ tick }) => tick)).toEqual([
      endTickOf(dried),
    ])
  })

  it.each(['release', 'duration', 'dry tank'] as const)(
    'counts the cooldown from the end by %s',
    (end) => {
      const session = endedBy(end)
      const endTick = endTickOf(session)
      session.submit(endTick + 1200 - 1, { type: 'debug.setEnergy', payload: { energy: '100' } })
      const early = session.submit(endTick + 1200 - 1, press())
      expect(early).toMatchObject([{ reason: 'power-up-core.cooling_down' }])
      expect(session.submit(endTick + 1200, press())).toEqual([])
    },
  )

  it('gives a tap released during the wind-up no brace and no draw', () => {
    const session = clampTunnel()
    session.submit(PRESS_TICK, press())
    session.submit(PRESS_TICK + 2, intentToReleaseSlot('powerup.1'))
    session.advanceTo(RELEASE_TICK)
    expect(usedEvents(session)).toMatchObject([{ tick: ACT_TICK, energy: 0 }])
    expect(bracedBlocks(session)).toEqual([])
    expect(fieldCells(session.state())).toEqual([])
  })
})

describe('lode clamp: draw and log', () => {
  it("draws the drill's rate on every held tick and logs magnet_used once with the total", () => {
    const session = clampTunnel()
    session.advanceTo(PRESS_TICK)
    const energyBefore = session.vehicle().energy
    session.submit(PRESS_TICK, press())
    session.submit(RELEASE_TICK, intentToReleaseSlot('powerup.1'))
    session.advanceTo(RELEASE_TICK + 20)
    const spent = energyBefore - session.vehicle().energy
    // Every tick from the act to the release's own, which the command reaches after its draw.
    const heldTicks = RELEASE_TICK - ACT_TICK + 1
    expect(spent).toBe(heldTicks * ENERGY_QUANTA_PER_TICK.drill)
    expect(usedEvents(session)).toMatchObject([
      { itemId: LODE_CLAMP_ID, verb: 'anchor', cellsMoved: 0, energy: spent },
    ])
    const lines = magnetUsedLines(session)
    expect(lines.map((line) => line.data)).toEqual([
      { itemId: LODE_CLAMP_ID, verb: 'anchor', cellsMoved: 0, energy: spent },
    ])
    expect(lines.flatMap(runEventProblems)).toEqual([])
  })

  it('ends in the same state with the same events at 30 and 144 steps/s', () => {
    const runs = STEP_RATES.map((rate) => {
      const session = clampTunnel()
      session.submit(PRESS_TICK, press())
      stepInFrames(session, rate, RELEASE_TICK)
      session.submit(RELEASE_TICK, intentToReleaseSlot('powerup.1'))
      stepInFrames(session, rate, RELEASE_TICK + COLLAPSE_WARN_TICKS + 10)
      return { events: session.events(), digest: stateDigest(session.state()) }
    })
    expect(runs[1]).toEqual(runs[0])
  })

  it('keeps the field and its braces across a save taken mid-hold', () => {
    const session = heldClamp()
    session.advanceTo(REFILL_TICK + 10)
    const loaded = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
    if (!('state' in loaded)) throw new Error(loaded.problems.join('; '))
    expect(fieldCells(loaded.state)).toEqual(fieldCells(session.state()))
    const original = advanceTicks(session.state(), 300)
    const resumed = advanceTicks(loaded.state, 300)
    expect(ofType(original.events, 'terrain-tools.MagnetUsed')).toHaveLength(1)
    expect(resumed.events).toEqual(original.events)
    expect(stateDigest(resumed.state)).toBe(stateDigest(original.state))
  })
})

/** Steps the session to `endTick` in render frames at `rate` frames a second. */
function stepInFrames(session: ScriptedSession, rate: number, endTick: number): void {
  let clock = NEW_FIXED_STEP_CLOCK
  let tick = session.state().tick
  while (tick < endTick) {
    const frame = stepsForFrame(clock, 1 / rate, 1 / TICKS_PER_SECOND, 8)
    clock = frame.clock
    tick = Math.min(endTick, tick + frame.steps)
    session.advanceTo(tick)
  }
}
