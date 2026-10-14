import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import {
  CORRIDOR_MIDDLE,
  CORRIDOR_ROW,
  prepareCorridor,
  spawnEnemy,
} from '../../../systems/authority/combat/combatFixtures'
import type { Enemy } from '../../../systems/authority/combat/combatState'
import { walkStepMmOf } from '../../../systems/authority/combat/enemyMovement'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { stepOfMajor } from '../../../systems/economy/upgradeSteps'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { moduleStatsAt } from './armouryModules'
import { FLUSHING_SHELL_ITEM_ID } from './autoGunsLane'
import { shellFlushTicksOf } from './flushingShell'

const STATS = moduleStatsAt(FLUSHING_SHELL_ITEM_ID, 1).stats
/** A thump lands on every multiple of the shell's cooldown. */
const THUMP_TICK = 4 * STATS.flushCooldownTicks
const BURROWER_ROWS_UNDER = -2

const mountGuns: CommandIntent = { type: 'debug.setGunLevel', payload: { level: stepOfMajor(1) } }

function own(itemIds: readonly string[]): CommandIntent {
  return { type: 'debug.setVehicleLoadout', payload: { slots: {}, owned: itemIds } }
}

interface Fight {
  session: ScriptedSession
  start: number
}

/** The planet 1 corridor with the guns mounted, `owned` on them and a burrower `dx` behind. */
function corridorFight(owned: readonly string[], dx: number, extra: CommandIntent[] = []): Fight {
  const session = createScriptedSession()
  const start = prepareCorridor(session, FACING.left)
  session.submit(start, mountGuns)
  session.submit(start, own(owned))
  for (const intent of extra) session.submit(start, intent)
  session.submit(start, spawnEnemy('burrower', 1, dx, BURROWER_ROWS_UNDER))
  session.advanceTo(start + 1)
  return { session, start }
}

function burrowerOf(session: ScriptedSession): Enemy {
  const burrower = session.state().combat.enemies.find(({ kind }) => kind === 'burrower')
  if (burrower === undefined) throw new Error('no burrower')
  return burrower
}

function flushAt({ session }: Fight, tick: number): number | null {
  return shellFlushTicksOf(burrowerOf(session), session.state(), tick)
}

describe('ground-gun: the flushing shell (ticket 388 through the K-flush registry)', () => {
  it("gives a burrower in the turret's range the shiver's ticks, cut to its walk of flushRange", () => {
    const fight = corridorFight([FLUSHING_SHELL_ITEM_ID], 4)
    const reachTicks = Math.floor(
      (STATS.flushRange * 1000) / walkStepMmOf(burrowerOf(fight.session)),
    )

    expect(flushAt(fight, THUMP_TICK)).toBe(Math.min(STATS.flushTicks, reachTicks))
    expect(flushAt(fight, THUMP_TICK + 30)).toBe(Math.min(STATS.flushTicks - 30, reachTicks))
  })

  it('gives nothing between thumps, once the shiver has died away', () => {
    expect(
      flushAt(corridorFight([FLUSHING_SHELL_ITEM_ID], 4), THUMP_TICK + STATS.flushTicks),
    ).toBeNull()
  })

  it('gives nothing without the shell, to a burrower out of range, or with the guns off Auto', () => {
    const offAuto: CommandIntent = { type: 'setGunMode', payload: { mode: 'off' } }

    expect(flushAt(corridorFight([], 4), THUMP_TICK)).toBeNull()
    expect(flushAt(corridorFight([FLUSHING_SHELL_ITEM_ID], 12), THUMP_TICK)).toBeNull()
    expect(flushAt(corridorFight([FLUSHING_SHELL_ITEM_ID], 4, [offAuto]), THUMP_TICK)).toBeNull()
  })

  it('drives the burrower out into the corridor within flushTicks of a thump, cutting no cell', () => {
    const fight = corridorFight([FLUSHING_SHELL_ITEM_ID], 4)
    const before = fight.session.state().world
    const thump = Math.ceil((fight.start + 1) / STATS.flushCooldownTicks) * STATS.flushCooldownTicks
    fight.session.advanceTo(thump + STATS.flushTicks)
    const burrower = burrowerOf(fight.session)

    expect(Math.floor(burrower.y / 1000)).toBe(CORRIDOR_ROW)
    expect(Math.abs(Math.floor(burrower.x / 1000) - CORRIDOR_MIDDLE.tx)).toBeLessThanOrEqual(6)
    expect(fight.session.state().world).toEqual(before)
  })
})
