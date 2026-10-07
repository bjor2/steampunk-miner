import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { AuthorityReaction } from '../registries/authorityReactions'
import { oreTypeOf } from '../registries/oreTypes'
import { FACING } from '../vehicle/vehiclePose'
import { add, fromSafeInteger } from '../money'
import { familyOfCell } from '../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../world/worldState'
import type { AuthorityState } from './authorityState'
import {
  BLAST_TICK,
  blastAt,
  liveBlastSession,
  R24_MM,
  SOLID_SITE,
} from './charges/liveBlastFixtures'
import { unchanged } from './commandRule'
import type { DomainEvent } from './domainEvent'
import { resourceTierOf } from './minedOre'
import {
  createScriptedSession,
  drill,
  GROUND,
  mineTile,
  PARAMS,
  poseAbove,
  surfaceOreTiles,
  type ScriptedSession,
} from './scriptedSession'
import { stateDigest } from './stateDigest'
import { oreTypeAtTile } from './tileOre'

// Slices fold the authority's domain events into their sections through authority reactions
// (#219, the #207 TD lock); a fake `probe` slice registers them through withRegistrations, so no
// real slice is imported.
declare module './domainEvent' {
  interface DomainEventBodies {
    'probe.Heard': { reaction: string; count: number }
    'probe.OreTouched': { oreId: string }
  }
}

const isProbeEvent = (event: DomainEvent) => event.type.startsWith('probe.')

/** Says how many events it heard, and pays their player a coin each: a change the digest sees. */
function tallyReaction(id: string): AuthorityReaction {
  return {
    id,
    react: (_before, after, events) => ({
      state: payEachPlayerOf(after, events),
      events: [{ type: 'probe.Heard', reaction: id, count: events.length }],
    }),
  }
}

function payEachPlayerOf(state: AuthorityState, events: readonly DomainEvent[]): AuthorityState {
  return events.reduce((current, { playerId }) => {
    if (playerId === undefined) return current
    const player = current.players[playerId]
    const wallet = add(player.wallet, fromSafeInteger(1))
    return { ...current, players: { ...current.players, [playerId]: { ...player, wallet } } }
  }, state)
}

/** Names the ore the drill touched, read on the state from before the command. */
const ORE_TOUCH: AuthorityReaction = {
  id: 'probe.ore-touch',
  react: (before, after, events) => ({
    state: after,
    events: events.flatMap((event) => oreTouchedOf(before, event)),
  }),
}

function oreTouchedOf(before: AuthorityState, event: DomainEvent) {
  if (event.type !== 'DrillDamageDealt') return []
  const ore = oreTypeAtTile(before, event)
  return ore === null ? [] : [{ type: 'probe.OreTouched' as const, oreId: ore.id }]
}

const QUIET: AuthorityReaction = { id: 'probe.quiet', react: (_before, after) => unchanged(after) }

function probeSliceOf(...reactions: AuthorityReaction[]): SliceDefinition {
  return { id: 'probe', register: (r) => reactions.forEach((it) => r.authorityReaction(it)) }
}

const [ORE_TILE] = surfaceOreTiles(1)

/** Mines one ore tile and one ground tile, then lets the clock cross a periodic digest. */
function digAndWait(session: ScriptedSession): ScriptedSession {
  mineTile(session, 1, ORE_TILE)
  mineTile(session, 100, GROUND)
  session.advanceTo(4000)
  return session
}

/** Poses over the ground tile and drills it 10 ticks: the drill command's events only. */
function drillGroundOnce(session: ScriptedSession): DomainEvent[] {
  session.submit(1, poseAbove(GROUND, FACING.down))
  return session.submit(11, drill(GROUND, 10))
}

function digAndWaitWith(slices: readonly SliceDefinition[]) {
  return withRegistrations(slices, () => digAndWait(createScriptedSession()))
}

/** Blasts of two players going live on the same tick, far enough apart not to meet. */
function twoPlayerBlasts(slices: readonly SliceDefinition[]) {
  return withRegistrations(slices, () => {
    const session = liveBlastSession(
      [
        blastAt(SOLID_SITE, R24_MM / 8, { playerId: 'p1' }),
        blastAt({ tx: SOLID_SITE.tx + 12, ty: SOLID_SITE.ty }, R24_MM / 8, { playerId: 'p2' }),
      ],
      ['p1', 'p2'],
    )
    session.advanceTo(30)
    return session
  })
}

/** The events of one player at one tick that a reaction heard: every rule event, no probe's. */
function heardBy(events: readonly DomainEvent[], { tick, playerId }: DomainEvent): DomainEvent[] {
  return events.filter(
    (event) => !isProbeEvent(event) && event.tick === tick && event.playerId === playerId,
  )
}

describe('authority reactions', () => {
  it('leaves every answer byte-identical when a reaction changes nothing', () => {
    const plain = digAndWaitWith([])
    const quiet = digAndWaitWith([probeSliceOf(QUIET)])
    expect(quiet.events()).toEqual(plain.events())
    expect(stateDigest(quiet.state())).toBe(stateDigest(plain.state()))
  })

  it("stamps a reaction's events on an accepted command with that command's stamp", () => {
    const events = withRegistrations([probeSliceOf(tallyReaction('probe.tally'))], () =>
      drillGroundOnce(createScriptedSession()),
    )
    const [drillDealt] = events.filter((event) => event.type === 'DrillDamageDealt')
    const heard = events.filter((event) => event.type === 'probe.Heard')
    const stamp = { playerId: 'p1', tick: 11, seq: 2 }
    expect(drillDealt).toMatchObject(stamp)
    expect(heard).toEqual([
      { ...stamp, type: 'probe.Heard', reaction: 'probe.tally', count: expect.any(Number) },
    ])
  })

  it("carries a reaction's state into the answer", () => {
    const plain = digAndWaitWith([])
    const tallied = digAndWaitWith([probeSliceOf(tallyReaction('probe.tally'))])
    expect(tallied.state().players.p1.wallet).not.toEqual(plain.state().players.p1.wallet)
  })

  it('runs no reaction for a refused command', () => {
    const session = withRegistrations([probeSliceOf(tallyReaction('probe.tally'))], () => {
      const scripted = createScriptedSession()
      scripted.submit(1, drill(GROUND, 10), 'nobody')
      return scripted
    })
    expect(session.events().map((event) => event.type)).toEqual(['CommandRejected'])
  })

  it('reads the ore a drill touched from the state before the command that broke it', () => {
    const session = withRegistrations([probeSliceOf(ORE_TOUCH)], () => {
      const scripted = createScriptedSession()
      return { events: mineTile(scripted, 1, ORE_TILE), after: scripted.state() }
    })
    const cell = cellAt(EMPTY_WORLD, PARAMS, ORE_TILE)
    const ore = oreTypeOf({ tier: resourceTierOf(PARAMS, cell), cellFamily: familyOfCell(cell) })
    expect(session.events.map((event) => event.type)).toContain('TileDestroyed')
    expect(oreTypeAtTile(session.after, ORE_TILE)).toBeNull()
    expect(session.events.filter((event) => event.type === 'probe.OreTouched')).toEqual([
      { playerId: 'p1', tick: 41, seq: 2, type: 'probe.OreTouched', oreId: ore.id },
    ])
  })

  it('reacts on each clock tick once per player, stamped for the player whose events it heard', () => {
    const events = twoPlayerBlasts([probeSliceOf(tallyReaction('probe.tally'))]).events()
    const clockHeard = events.filter((event) => event.type === 'probe.Heard' && event.tick >= 1)
    const onBlastTick = clockHeard.filter((event) => event.tick === BLAST_TICK)
    expect(onBlastTick.map((event) => event.playerId)).toEqual(['p1', 'p2'])
    for (const heard of clockHeard) {
      expect(heard.seq).toBeUndefined()
      expect(heard).toMatchObject({ count: heardBy(events, heard).length })
    }
  })

  it("runs reactions in id order, none hearing another's events", () => {
    const slice = probeSliceOf(tallyReaction('probe.b'), tallyReaction('probe.a'))
    const events = withRegistrations([slice], () => drillGroundOnce(createScriptedSession()))
    const heard = events.filter((event) => event.type === 'probe.Heard')
    expect(heard.map((event) => (event as { reaction: string }).reaction)).toEqual([
      'probe.a',
      'probe.b',
    ])
    expect(new Set(heard.map((event) => (event as { count: number }).count)).size).toBe(1)
  })
})
