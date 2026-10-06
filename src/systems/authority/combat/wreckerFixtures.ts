/**
 * Places and set-ups the tunnel wrecker specs share (#111, #94): cave-free band-2 rock with no
 * enemy spawn point within 30 tiles on planets 6 and 5 of the scripted session's seed, the drill
 * on its curve there, and a 40 m tunnel dug and lined at grade 2 on planet 6, long enough for its
 * route to call a wrecker.
 */
import { onCurveLevel } from '../../economy/vehicleStats'
import type { CommandIntent } from '../authorityCommand'
import { digAlong } from '../collapse/collapseFixtures'
import { createScriptedSession, type ScriptedSession } from '../scriptedSession'

export const PLANET_6 = { planetIndex: 6, y: 552500 }
export const PLANET_5 = { planetIndex: 5, y: 522500 }
export const TUNNEL_FROM_X = 8000
export const TUNNEL_TO_X = 48000

/** On `planetIndex`, the drill on its curve there, lining at grade 2. */
export function onPlanet(planetIndex: number): ScriptedSession {
  const session = createScriptedSession()
  onPlanetIntents(planetIndex).forEach((intent) => session.submit(0, intent))
  return session
}

/** The 40 m tunnel dug and lined on planet 6; answers the session and the next free tick. */
export function digPlanet6Tunnel(): { session: ScriptedSession; tick: number } {
  const session = onPlanet(PLANET_6.planetIndex)
  return { session, tick: digAlong(session, 1, PLANET_6.y, TUNNEL_FROM_X, TUNNEL_TO_X) }
}

function onPlanetIntents(planetIndex: number): CommandIntent[] {
  return [
    { type: 'debug.setPlanet', payload: { planetIndex } },
    onCurveDrill('drill_tip', planetIndex),
    onCurveDrill('drill_power', planetIndex),
    { type: 'debug.setCasingGrade', payload: { grade: 2 } },
  ]
}

function onCurveDrill(upgradeId: 'drill_tip' | 'drill_power', planetIndex: number): CommandIntent {
  return {
    type: 'debug.setUpgrade',
    payload: { upgradeId, level: onCurveLevel(upgradeId, planetIndex) },
  }
}
