/**
 * A start scenario as authority commands (#11 section 4): applying a scenario is a list of
 * `debug.*` commands through the same `applyCommand` as play, so it replays and is logged.
 * Only the authority-owned fields become commands; depth is the vehicle's pose, which the client
 * owns (#3), so the store places it.
 */
import type { CommandIntent } from './authority/authorityCommand'
import { fromCanonical, toCanonical } from './money'
import type { StartScenario } from './startScenario'

/** Call only with a scenario that has no problems; refusing is the caller's first step. */
export function startScenarioCommands(scenario: StartScenario): CommandIntent[] {
  return [
    ...(scenario.planetTier === undefined ? [] : [setPlanetCommand(scenario.planetTier)]),
    ...(scenario.planetSeed === undefined ? [] : [setPlanetSeedCommand(scenario.planetSeed)]),
    ...(scenario.money === undefined ? [] : [setMoneyCommand(scenario.money)]),
  ]
}

export function setPlanetCommand(planetTier: number): CommandIntent<'debug.setPlanet'> {
  return { type: 'debug.setPlanet', payload: { planetIndex: planetTier } }
}

export function setPlanetSeedCommand(planetSeed: number): CommandIntent<'debug.setPlanetSeed'> {
  return { type: 'debug.setPlanetSeed', payload: { planetSeed } }
}

export function grantMoneyCommand(amount: string): CommandIntent<'debug.grantMoney'> {
  return { type: 'debug.grantMoney', payload: { amount: canonicalText(amount) } }
}

function setMoneyCommand(amount: string): CommandIntent<'debug.setMoney'> {
  return { type: 'debug.setMoney', payload: { amount: canonicalText(amount) } }
}

/** Commands carry the canonical spelling, so `commands.ndjson` has one text per amount. */
function canonicalText(amount: string): string {
  return toCanonical(fromCanonical(amount))
}
