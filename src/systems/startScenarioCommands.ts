/**
 * A start scenario as authority commands (#11 section 4): applying a scenario is a list of
 * `debug.*` commands through the same `applyCommand` as play, so it replays and is logged.
 * Only the authority-owned fields become commands; depth is the vehicle's pose, which the client
 * owns (#3), so the store places it.
 */
import type { CommandIntent } from './authority/authorityCommand'
import { spawnEnemyCommand } from './authority/combat/combatCommands'
import { UPGRADE_IDS } from './economy/economyDefinition'
import { fromCanonical, toCanonical } from './money'
import type { StartScenario } from './startScenario'
import { setUpgradeCommand } from './vehicle/vehicleCommands'

/** Call only with a scenario that has no problems; refusing is the caller's first step. */
export function startScenarioCommands(scenario: StartScenario): CommandIntent[] {
  return [
    ...(scenario.planetTier === undefined ? [] : [setPlanetCommand(scenario.planetTier)]),
    ...(scenario.planetSeed === undefined ? [] : [setPlanetSeedCommand(scenario.planetSeed)]),
    ...(scenario.money === undefined ? [] : [setMoneyCommand(scenario.money)]),
    ...upgradeCommandsOf(scenario.upgrades ?? {}),
    ...(scenario.coreFragments === undefined
      ? []
      : [setCoreFragmentsCommand(scenario.coreFragments)]),
    ...(scenario.enemies ?? []).map(({ kind, tier, dx, dy }) =>
      spawnEnemyCommand(kind, tier, { dx, dy }),
    ),
  ]
}

/** In the #7 track order, so a scenario replays the same commands however its file orders them. */
function upgradeCommandsOf(upgrades: Readonly<Record<string, number>>): CommandIntent[] {
  return UPGRADE_IDS.filter((upgradeId) => Object.hasOwn(upgrades, upgradeId)).map((upgradeId) =>
    setUpgradeCommand(upgradeId, upgrades[upgradeId]),
  )
}

export function setPlanetCommand(planetTier: number): CommandIntent<'debug.setPlanet'> {
  return { type: 'debug.setPlanet', payload: { planetIndex: planetTier } }
}

export function setPlanetSeedCommand(planetSeed: number): CommandIntent<'debug.setPlanetSeed'> {
  return { type: 'debug.setPlanetSeed', payload: { planetSeed } }
}

export function setCoreFragmentsCommand(count: number): CommandIntent<'debug.setCoreFragments'> {
  return { type: 'debug.setCoreFragments', payload: { count } }
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
