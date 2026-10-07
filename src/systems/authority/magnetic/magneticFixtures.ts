/**
 * The magnetic hazard specs' session (spec #258, ticket 290): recorded, on a planet with every
 * track on the curve, so its drill cuts that planet's cells and its hull is the on-curve hull the
 * caps are shares of. Only specs use it.
 */
import { toCanonical } from '../../money'
import { onCurveSteps, vehicleStatsAt } from '../../economy/vehicleStats'
import { UPGRADE_IDS } from '../../economy/economyDefinition'
import type { AuthorityCommand, CommandIntent } from '../authorityCommand'
import { createScriptedSession, FREEZE_ENEMIES, type ScriptedSession } from '../scriptedSession'

export interface RecordedSession {
  session: ScriptedSession
  /** Every command submitted, as a replay reads them. */
  commands: AuthorityCommand[]
  submit(tick: number, intent: CommandIntent): void
}

/** Player `p1` on `planetIndex` with its enemies frozen and every track at the planet's curve. */
export function onCurveSessionOn(planetIndex: number): RecordedSession {
  const recorded = recordedSession()
  const stats = vehicleStatsAt(onCurveSteps(planetIndex))
  recorded.submit(0, { type: 'debug.setPlanet', payload: { planetIndex } })
  recorded.submit(0, FREEZE_ENEMIES)
  UPGRADE_IDS.forEach((upgradeId) =>
    recorded.submit(0, {
      type: 'debug.setUpgrade',
      payload: { upgradeId, level: onCurveSteps(planetIndex)[upgradeId] },
    }),
  )
  recorded.submit(0, { type: 'debug.setHull', payload: { hull: toCanonical(stats.hullMax) } })
  recorded.submit(0, { type: 'debug.setEnergy', payload: { energy: String(stats.energyMax) } })
  return recorded
}

function recordedSession(): RecordedSession {
  const session = createScriptedSession()
  const commands: AuthorityCommand[] = []
  const submit = (tick: number, intent: CommandIntent) => {
    commands.push({ playerId: 'p1', tick, seq: commands.length + 1, ...intent } as AuthorityCommand)
    session.submit(tick, intent)
  }
  return { session, commands, submit }
}
