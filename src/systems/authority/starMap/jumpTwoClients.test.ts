import { describe, expect, it } from 'vitest'
import { JUMP_TRANSITION_SECONDS } from '../../../constants/scene'
import { buyFuelCommand, dockCommand, jumpToPlanetCommand } from '../../platform/platformCommands'
import { travelTransitionOf, type TravelTransition } from '../../sliceProgress'
import { dockedPoseAt } from '../../vehicle/vehiclePose'
import { dockSiteOf } from '../../world/dockSite'
import { freshPlanetParamsFor } from '../../world/planetParams'
import type { CommandIntent } from '../authorityCommand'
import { createAuthorityState, type AuthorityState } from '../authorityState'
import { createLoopbackAuthority, type Authority } from '../loopbackAuthority'
import { isSessionHost } from '../sessionHost'
import { WORLD_SEED } from '../scriptedSession'

const HOST = 'player_1'
const GUEST = 'player_2'

/**
 * One client of a co-op session on the host's authority (#3): it sends requests and keeps what the
 * events tell it, the travel transition it plays and the state it renders.
 */
interface Client {
  playerId: string
  request(tick: number, intent: CommandIntent): void
  transition(): TravelTransition | null
  heardTick(): number | null
  state(): AuthorityState
}

function clientOf(host: Authority, playerId: string): Client {
  let seq = 0
  let transition: TravelTransition | null = null
  let heardTick: number | null = null
  host.subscribe((events) => {
    const started = travelTransitionOf(events)
    if (started === null) return
    transition = started
    heardTick = host.readState().tick
  })
  return {
    playerId,
    request: (tick, intent) => host.submit({ playerId, tick, seq: ++seq, ...intent }),
    transition: () => transition,
    heardTick: () => heardTick,
    state: () => host.readState(),
  }
}

/** A host and a guest docked on planet 1, the guest's tank holding `units` fuel. */
function twoClientSession(units: number) {
  const host = createLoopbackAuthority(
    createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: [HOST, GUEST] }),
  )
  const clients = [clientOf(host, HOST), clientOf(host, GUEST)] as const
  for (const client of clients) {
    client.request(0, { type: 'debug.setMoney', payload: { amount: '1e6' } })
  }
  for (const client of clients) client.request(5, dockCommand('sell'))
  clients[1].request(6, buyFuelCommand(units))
  return { host, hostClient: clients[0], guestClient: clients[1] }
}

/** Seconds from the confirming request to control: the host's answer, then the transition. */
function secondsToControl(client: Client, confirmedTick: number, stepsPerSecond: number): number {
  const heard = client.heardTick() ?? Number.POSITIVE_INFINITY
  const transition = client.transition()?.seconds ?? Number.POSITIVE_INFINITY
  return (heard - confirmedTick) / stepsPerSecond + transition
}

describe('star map jump with two clients (ticket 755)', () => {
  it.each([30, 144])(
    "decides a guest's jump on the host and gives both clients control within 2 s at %i steps/s",
    (stepsPerSecond) => {
      const { hostClient, guestClient } = twoClientSession(1)
      expect(isSessionHost(guestClient.state(), GUEST)).toBe(false)
      guestClient.request(10, jumpToPlanetCommand(1n, 2n))
      for (const client of [hostClient, guestClient]) {
        expect(client.state().planet.index).toBe(2)
        expect(client.transition()).toEqual({ fromPlanet: 1, toPlanet: 2, seconds: 2 })
        expect(secondsToControl(client, 10, stepsPerSecond)).toBeLessThanOrEqual(
          JUMP_TRANSITION_SECONDS,
        )
      }
    },
  )

  it('moves both vehicles to the new dock site and burns only the requesting tank', () => {
    const { host, guestClient } = twoClientSession(3)
    guestClient.request(10, jumpToPlanetCommand(1n, 3n))
    const site = dockSiteOf(freshPlanetParamsFor(WORLD_SEED, 3))
    const { players } = host.readState()
    for (const id of [HOST, GUEST]) {
      expect(players[id].vehicle).toMatchObject({ mode: 'docked', pose: dockedPoseAt(site) })
    }
    expect('fuel' in players[GUEST].vehicle).toBe(true)
    expect('fuel' in players[HOST].vehicle).toBe(false)
  })

  it('answers a request the host refuses on both clients alike, with no transition', () => {
    const { host, hostClient, guestClient } = twoClientSession(1)
    const before = host.readState()
    guestClient.request(10, jumpToPlanetCommand(1n, 4n))
    expect(host.readState().planet).toEqual(before.planet)
    expect(hostClient.transition()).toBeNull()
    expect(guestClient.transition()).toBeNull()
  })
})
