import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { createAuthorityState } from '../authority/authorityState'
import { FREEZE_ENEMIES, GROUND } from '../authority/scriptedSession'
import { drillQuantumAt } from '../authority/stepBoundRead'
import { cutCellsPerSecondOf } from '../vehicle/cutSpeed'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import { FACING } from '../vehicle/vehiclePose'
import { statsOfVehicle } from '../vehicle/vehicleState'
import type { TilePoint } from '../world/tileGrid'
import { boreTile, enterBoredTile, type BotPilot } from './botPilot'
import { createBotSession, type BotSession } from './botSession'
import { boreSubSteps, cellOfTile, paramsOfSession, tileKindAt } from './botWorld'

// The pacing bot on the scripted sub-step clock (ticket 559, #551 B2 "a bot on a rig at 840 m/s
// crosses more than 60 cells/s"): it waits each tile's own sub-steps, carrying what a tile leaves
// of its last tick into the next, so its time down a column is the column's drill time rounded up
// once, never a whole tick a tile.

const PLAYER = 'p1'
/** Twenty band-1 cells straight down from the surface of planet 1. */
const COLUMN: readonly TilePoint[] = Array.from({ length: 20 }, (_, depth) => ({
  tx: GROUND.tx,
  ty: GROUND.ty - depth,
}))
/** VS on #551 (6254671302): a rig descends at 0.891 of its band-1 cut speed in cells/s. */
const DESCENT_PER_CUT = 0.891
/** Drill power purchase 32: band-1 rock at about 1300 cells/s, past 840 m/s down. */
const FAST_DRILL = 32
/** Drill power purchase 12: band-1 rock at about 1.3 ticks a cell, a fraction a whole tick rounds. */
const FRACTIONAL_DRILL = 12

function botWithDrill(drillPower: number): BotSession {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: [PLAYER] })
  const session = createBotSession(start, PLAYER)
  session.submit(FREEZE_ENEMIES)
  session.submit(setUpgradeCommand('drill_power', drillPower))
  return session
}

/** The column's drill time on the scripted clock, in sub-steps, read before any of it is bored. */
function columnSubStepsOf(session: BotSession): number {
  const drill = statsOfVehicle(session.vehicle())
  const quantum = drillQuantumAt(session.state(), PLAYER)
  const params = paramsOfSession(session.state())
  return COLUMN.reduce(
    (sum, tile) =>
      sum + (boreSubSteps(drill, quantum, params, tile, cellOfTile(session.state(), tile)) ?? 0),
    0,
  )
}

/** Bores the column top down as the bot bores a shaft; answers the ticks it took. */
function boreColumn(session: BotSession): number {
  const pilot: BotPilot = { position: { tx: GROUND.tx, ty: GROUND.ty + 1 }, facing: FACING.down }
  const quantum = drillQuantumAt(session.state(), PLAYER)
  const drill = statsOfVehicle(session.vehicle())
  const params = paramsOfSession(session.state())
  const startTick = session.tick()
  for (const tile of COLUMN) {
    const subSteps = boreSubSteps(drill, quantum, params, tile, cellOfTile(session.state(), tile))
    boreTile(session, pilot, tile, { subSteps: subSteps ?? 0, quantum })
    enterBoredTile(pilot, tile)
  }
  return session.tick() - startTick
}

const isColumnOpen = (session: BotSession) =>
  COLUMN.every((tile) => tileKindAt(session.state(), tile) === 'open')

describe('pacing bot bore speed on the sub-step clock (ticket 559)', () => {
  it('bores band-1 rock past 840 m/s at more than 60 cells a second', () => {
    const session = botWithDrill(FAST_DRILL)
    const quantum = drillQuantumAt(session.state(), PLAYER)
    const cellsPerSecond = cutCellsPerSecondOf(columnSubStepsOf(session) / COLUMN.length, quantum)
    expect(cellsPerSecond * DESCENT_PER_CUT).toBeGreaterThan(840)
    const ticks = boreColumn(session)
    expect(isColumnOpen(session)).toBe(true)
    expect((COLUMN.length * TICKS_PER_SECOND) / ticks).toBeGreaterThan(60)
  })

  it('takes the column drill time rounded up once, not a whole tick a cell', () => {
    for (const drillPower of [FAST_DRILL, FRACTIONAL_DRILL]) {
      const session = botWithDrill(drillPower)
      const quantum = drillQuantumAt(session.state(), PLAYER)
      const expected = Math.ceil(columnSubStepsOf(session) / quantum)
      expect(boreColumn(session)).toBe(expected)
      expect(isColumnOpen(session)).toBe(true)
    }
  })
})
