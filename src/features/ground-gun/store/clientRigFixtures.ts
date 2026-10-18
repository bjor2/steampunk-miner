/**
 * The local client on a real authority, for the fire input's store specs (ticket 314): a planet-1
 * rig standing in band-1 rock with a planet-4 drill, behind a spy that keeps every submitted
 * command, and the client hearing the authority's fire refusals as the clock hook does. The rig
 * faces right, so a shot along the facing goes east.
 */
import { resetGameStore } from '../../../store/gameStore'
import type { AuthorityCommand, CommandIntent } from '../../../systems/authority/authorityCommand'
import { PLAIN_RIG, standInPocket } from '../../../systems/authority/bore/boreFixtures'
import { nextShotTickOf } from '../../../systems/authority/bore/boreFire'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  createLoopbackAuthority,
  type Authority,
} from '../../../systems/authority/loopbackAuthority'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { setUpgradeCommand } from '../../../systems/vehicle/vehicleCommands'
import { mountedLevels } from '../systems/gunLevels'
import { hearFireRefusals } from './fireInput'

/**
 * The planet-4 drill the gun's bore is timed against: purchase 17, the power planet 4's on-curve
 * major 31 had before drill power grew per purchase (#552); the on-curve purchase 21 is 2.3x it,
 * and its bore through band-1 rock ends inside the gun's cooldown.
 */
const PLANET_4_DRILL = 17

/** The store's local player, whose replica the fire input reads. */
export const CLIENT_PLAYER = 'player_1'
export const PRESS_TICK = 10
export const FIRE_COMMAND = 'ground_gun.fire'
const TICKS_PER_SECOND = 60

export interface ClientRig {
  authority: Authority
  /** Every command the client submitted, the ticks of its fires, and each fire refusal. */
  submitted: AuthorityCommand[]
  firedTicks: number[]
  refusals: string[]
}

/** The store on a spy of the rig's authority at `PRESS_TICK`, the gun mounted or not. */
export function clientRig(isGunMounted = true): ClientRig {
  const real = rigAuthority(isGunMounted)
  const rig: ClientRig = { authority: real, submitted: [], firedTicks: [], refusals: [] }
  rig.authority = { ...real, submit: (command) => keepAndSubmit(rig, real, command) }
  real.subscribe((events) => hearRefusals(rig, events))
  resetGameStore(rig.authority)
  rig.authority.advanceTo(PRESS_TICK)
  return rig
}

/** The client's frames to `toTick`: the authority moves on, then `onFrame` runs, as the hook does. */
export function playFrames(
  rig: ClientRig,
  toTick: number,
  framesPerSecond: number,
  onFrame: () => void,
): void {
  const fromTick = rig.authority.readState().tick
  for (let frame = 1; rig.authority.readState().tick < toTick; frame++) {
    rig.authority.advanceTo(Math.min(toTick, fromTick + framesToTicks(frame, framesPerSecond)))
    onFrame()
  }
}

export function nextShotTickOfRig(rig: ClientRig): number {
  return nextShotTickOf(rig.authority.readState(), CLIENT_PLAYER)
}

export function commandTypesOf(rig: ClientRig): string[] {
  return rig.submitted.map((command) => command.type)
}

function rigAuthority(isGunMounted: boolean): Authority {
  const session = createScriptedSession([CLIENT_PLAYER])
  const asPlayer: ScriptedSession = {
    ...session,
    submit: (tick, intent) => session.submit(tick, intent, CLIENT_PLAYER),
  }
  if (isGunMounted) asPlayer.submit(0, setLevelsIntent())
  asPlayer.submit(0, setUpgradeCommand('drill_power', PLANET_4_DRILL))
  standInPocket(asPlayer, PLAIN_RIG, 0)
  return createLoopbackAuthority(session.state())
}

function setLevelsIntent(): CommandIntent {
  return { type: 'debug.ground-gun.setLevels', payload: mountedLevels() }
}

function keepAndSubmit(rig: ClientRig, real: Authority, command: AuthorityCommand): void {
  rig.submitted.push(command)
  if (command.type === FIRE_COMMAND) rig.firedTicks.push(command.tick)
  real.submit(command)
}

function hearRefusals(rig: ClientRig, events: readonly DomainEvent[]): void {
  rig.refusals.push(...fireRefusalsOf(events))
  hearFireRefusals(events, CLIENT_PLAYER)
}

function fireRefusalsOf(events: readonly DomainEvent[]): string[] {
  return events.flatMap((event) =>
    event.type === 'CommandRejected' && event.commandType === FIRE_COMMAND ? [event.reason] : [],
  )
}

function framesToTicks(frame: number, framesPerSecond: number): number {
  return Math.floor((frame * TICKS_PER_SECOND) / framesPerSecond)
}
