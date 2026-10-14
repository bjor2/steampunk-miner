import { describe, expect, it } from 'vitest'
import { prepareCorridor, spawnEnemy } from '../../systems/authority/combat/combatFixtures'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { lungeWarningsOf } from '../../systems/authority/sensingQueries'
import { AUTO_ACTOR_REGISTRY, type AutoActor } from '../../systems/registries/autoActors'
import { entriesOf } from '../../systems/registries/seal'

// The alarm shield in play (GD lock on #206, decision 6): the steam shield's auto actor (mobility,
// ticket 328) asks the `autoFire` hook, and with the combo owned it has a target on a lunge
// warning and holds `no_target` without one; without the combo it never has a target. Its holds,
// preview, press path, reserve and override gap are the lane's own specs'. The one auto switch is
// the steam sear's (#328), whose research node #318 registers, so play turns it on from then.

const SHIELD = 'power.steam_shield'
const ALARM_SHIELD = 'combo.alarm_shield'
const FIGHT_TICKS = 120

function shieldActor(): AutoActor {
  const actor = entriesOf(AUTO_ACTOR_REGISTRY).find((entry) => entry.itemId === SHIELD)
  if (actor === undefined) throw new Error('no auto actor for the steam shield')
  return actor
}

/** The corridor fight with the shield in slot 1 and a crawler coming; the tick it starts. */
function fightWith(owned: readonly string[]): { session: ScriptedSession; start: number } {
  const session = createScriptedSession()
  const start = prepareCorridor(session)
  session.submit(start, setVehicleLoadoutCommand({ 'powerup.1': SHIELD }, owned))
  return { session, start }
}

function advanceToWindup(session: ScriptedSession, from: number): void {
  for (let tick = from + 1; tick <= from + FIGHT_TICKS; tick++) {
    session.advanceTo(tick)
    if (lungeWarningsOf(session.state(), 'p1', 12).length > 0) return
  }
  throw new Error('no enemy wound up')
}

describe('alarm shield in play', () => {
  it('gives the shield a target on a lunge warning, and none before it', () => {
    const { session, start } = fightWith([SHIELD, ALARM_SHIELD])
    expect(shieldActor().holdOf(session.state(), 'p1')).toBe('no_target')
    session.submit(start, spawnEnemy('crawler', 1, 3))
    advanceToWindup(session, start)
    expect(shieldActor().holdOf(session.state(), 'p1')).toBeNull()
    expect(shieldActor().bestTargetOf(session.state(), 'p1')).not.toBeNull()
  })

  it('never gives the shield a target without the combo', () => {
    const { session, start } = fightWith([SHIELD])
    session.submit(start, spawnEnemy('crawler', 1, 3))
    advanceToWindup(session, start)
    expect(shieldActor().holdOf(session.state(), 'p1')).toBe('no_target')
    expect(shieldActor().bestTargetOf(session.state(), 'p1')).toBeNull()
  })
})
