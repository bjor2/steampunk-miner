import { describe, expect, it } from 'vitest'
import { LAW_WORK_PER_DRILL_TICK } from '../vehicle/cutCarry'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import { setUpgradeCommand } from '../vehicle/vehicleCommands'
import { FACING } from '../vehicle/vehiclePose'
import type { TilePoint } from '../world/tileGrid'
import {
  chargedHeatTicksOf,
  cutEnergyNumeratorOf,
  energyNumeratorOfLawWork,
  lawWorkRemovedOf,
} from './cutCarryFixtures'
import { vehicleOf } from './authorityState'
import {
  createScriptedSession,
  drill,
  FREEZE_ENEMIES,
  GROUND,
  poseAbove,
  type ScriptedSession,
} from './scriptedSession'
import { drillQuantumAt } from './stepBoundRead'

// Scripted mining on the swept cut's clock (ticket 559, #551 B2): a `drillTile` cuts its window in
// sub-steps of the rig's drill quantum and is charged and heated on the law work it removed, so a
// rig past 60 cells/s bores several cells in one tick, each paying only its own cell.

/** Drill power purchase 30: about 830 cells/s on planet 1's band 1, a cell in a tenth of a tick. */
const FAST_DRILL = 30
/** Three band-1 cells in a column under the surface, top first. */
const COLUMN: readonly TilePoint[] = [0, 1, 2].map((depth) => ({
  tx: GROUND.tx,
  ty: GROUND.ty - depth,
}))

function sessionWithDrill(drillPower: number): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, setUpgradeCommand('drill_power', drillPower))
  return session
}

/** Bores each tile from above at `tick`, one tick of window each, as the pacing bot packs them. */
function boreColumnAt(session: ScriptedSession, tick: number): void {
  for (const tile of COLUMN) {
    session.submit(tick, poseAbove(tile, FACING.down))
    session.submit(tick, drill(tile, 1))
  }
}

const destroyedOf = (session: ScriptedSession) =>
  session.events().filter((event) => event.type === 'TileDestroyed').length

describe('scripted mining on the sub-step clock (ticket 559)', () => {
  it('clears three band-1 cells in one tick for a rig past 60 cells/s', () => {
    const session = sessionWithDrill(FAST_DRILL)
    boreColumnAt(session, 1)
    expect(destroyedOf(session)).toBe(COLUMN.length)
  })

  it('charges the three cells their law work, never a drill tick each', () => {
    const session = sessionWithDrill(FAST_DRILL)
    const before = session.state()
    boreColumnAt(session, 1)
    const after = session.state()
    const quantum = drillQuantumAt(before, 'p1')
    const removed = lawWorkRemovedOf(before, after.world, COLUMN, 'p1', quantum)
    const charged = cutEnergyNumeratorOf(vehicleOf(before, 'p1'), vehicleOf(after, 'p1'))
    expect(charged).toBe(energyNumeratorOfLawWork(removed))
    const spent = vehicleOf(before, 'p1').energy - vehicleOf(after, 'p1').energy
    expect(spent).toBeLessThan(COLUMN.length * ENERGY_QUANTA_PER_TICK.drill)
  })

  it('heats a bore for the law work it removed, not for the window it names', () => {
    const session = sessionWithDrill(0)
    const [tile] = COLUMN
    session.submit(1, poseAbove(tile, FACING.down))
    const before = session.state()
    session.submit(121, drill(tile, 120))
    const after = session.state()
    const lawTicks = lawWorkRemovedOf(before, after.world, [tile]) / LAW_WORK_PER_DRILL_TICK
    expect(lawTicks).toBeGreaterThan(30)
    expect(lawTicks).toBeLessThan(120)
    const heated = chargedHeatTicksOf(vehicleOf(before, 'p1'), vehicleOf(after, 'p1'))
    expect(heated).toBe(Math.floor(lawTicks))
  })
})
