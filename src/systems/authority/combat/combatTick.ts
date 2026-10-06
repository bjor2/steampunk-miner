/**
 * One tick of the enemy simulation (decision #9), run by the authority's clock for every tick
 * while combat is live: strays leave, spawn points near each vehicle out on a trip come alive, a
 * lined route may call a tunnel wrecker (#111), then every enemy acts in spawn order. Events are stamped with the tick and the player whose
 * enemy or vehicle they concern, with no `seq`: the clock caused them, not a command.
 *
 * Combat is live while an enemy is active or a vehicle's position is still being carried on from
 * its last report. Outside those ticks nothing can change, so the clock jumps over them and a run
 * gives the same state and events however its ticks are batched (30 or 144 render fps).
 */
import { COMBAT_EXTRAPOLATION_TICKS } from '../../../constants/balance'
import { vehicleOf, type AuthorityState } from '../authorityState'
import type { RuleEffect } from '../commandRule'
import type { DomainEvent } from '../domainEvent'
import { planetParamsOf } from '../planetOfState'
import { combatVehicleOf } from './combatState'
import { stepEnemy } from './enemyBehaviour'
import type { Terrain } from './enemyMovement'
import { activateSpawnPoints, despawnEnemies } from './enemyRoster'
import { isStray } from './enemyRoster'
import { isOnTrip } from './vehicleTarget'
import { callWrecker } from './wreckerSpawn'

export interface TickOutcome {
  state: AuthorityState
  events: DomainEvent[]
}

type TickStep = (state: AuthorityState) => TickOutcome

export function isCombatLive(state: AuthorityState, tick: number): boolean {
  return (
    state.combat.enemies.length > 0 ||
    Object.keys(state.players).some((playerId) => isCarriedOn(state, playerId, tick))
  )
}

export function runCombatTick(state: AuthorityState, tick: number): TickOutcome {
  const params = planetParamsOf(state.planet)
  const ran =
    params === null
      ? { state, events: [] }
      : runSteps(state, tickSteps({ world: state.world, params }, tick, state.combat.isFrozen))
  return { state: { ...ran.state, tick }, events: ran.events }
}

function tickSteps(terrain: Terrain, tick: number, isFrozen: boolean): TickStep[] {
  const roster: TickStep[] = [
    (state) => despawnStrays(state, tick),
    (state) => activateNearVehicles(state, tick),
    (state) => callWreckersToRoutes(state, tick),
  ]
  return [...(isFrozen ? [] : roster), (state) => stepEveryEnemy(state, terrain, tick)]
}

function despawnStrays(state: AuthorityState, tick: number): TickOutcome {
  const strays = state.combat.enemies.filter((enemy) => isStray(state, enemy, tick))
  return runSteps(
    state,
    strays.map(
      (enemy) => (current) => stampedFor(despawnEnemies(current, [enemy]), enemy.ownerId, tick),
    ),
  )
}

function activateNearVehicles(state: AuthorityState, tick: number): TickOutcome {
  return runSteps(
    state,
    Object.keys(state.players)
      .sort()
      .map(
        (playerId) => (current) =>
          stampedFor(activateSpawnPoints(current, playerId, tick), playerId, tick),
      ),
  )
}

/** Each vehicle's lined route may call a tunnel wrecker (#111); its events concern that vehicle. */
function callWreckersToRoutes(state: AuthorityState, tick: number): TickOutcome {
  return runSteps(
    state,
    Object.keys(state.players)
      .sort()
      .map(
        (playerId) => (current) => stampedFor(callWrecker(current, playerId, tick), playerId, tick),
      ),
  )
}

function stepEveryEnemy(state: AuthorityState, terrain: Terrain, tick: number): TickOutcome {
  return runSteps(
    state,
    state.combat.enemies.map(
      (enemy) => (current) =>
        stampedFor(stepEnemy(current, enemy.id, terrain, tick), enemy.ownerId, tick),
    ),
  )
}

function isCarriedOn(state: AuthorityState, playerId: string, tick: number): boolean {
  const vehicle = vehicleOf(state, playerId)
  const ticksSinceReport = tick - combatVehicleOf(state.combat, playerId).reportTick
  return (
    isOnTrip(vehicle) && vehicle.pose !== null && ticksSinceReport <= COMBAT_EXTRAPOLATION_TICKS
  )
}

function runSteps(state: AuthorityState, steps: readonly TickStep[]): TickOutcome {
  return steps.reduce<TickOutcome>(
    (outcome, step) => {
      const next = step(outcome.state)
      return { state: next.state, events: [...outcome.events, ...next.events] }
    },
    { state, events: [] },
  )
}

function stampedFor(effect: RuleEffect, playerId: string, tick: number): TickOutcome {
  return {
    state: effect.state,
    events: effect.events.map((body): DomainEvent => ({ tick, playerId, ...body })),
  }
}
