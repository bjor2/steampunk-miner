import { describe, expect, it } from 'vitest'
import { COLLAPSE_WARN_TICKS } from '../../../constants/balance'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { bracesAt, COLLAPSE_BRACE_REGISTRY } from '../../registries/collapseBraces'
import { entriesOf } from '../../registries/seal'
import { blockContaining, blockIdOf } from '../../world/collapseBlock'
import { advanceTicks } from '../advanceTicks'
import { ofType } from '../charges/chargeFixtures'
import type { DomainEvent } from '../domainEvent'
import { createScriptedSession, type ScriptedSession } from '../scriptedSession'
import { readSnapshot, takeSnapshot } from '../sessionSnapshot'
import { stateDigest } from '../stateDigest'
import { boreGunSlice, FIRE_EAST, lineEastOf, PLAIN_RIG, standInPocket } from '../bore/boreFixtures'
import { braceCommand, braceProbeSlice, gatedBraceProbeSlice, RELEASE_BRACE } from './braceFixtures'
import { forceCollapseCommand } from './collapseCommands'
import {
  BAND_1_Y,
  BAND_2_Y,
  buildWeakTunnel,
  lineTunnel,
  poseAt,
  TUNNEL_FROM_X,
  TUNNEL_TO_X,
} from './collapseFixtures'
import { nextCollapseTick } from './collapseState'

// The weak band-2 tunnel warns its blocks at tick 10, so each would refill at 70.
const WARN_TICK = 10
const REFILL_TICK = WARN_TICK + COLLAPSE_WARN_TICKS
const BRACE_TICK = 20
const END_TICK = 200
const TUNNEL_MIDDLE_X = (TUNNEL_FROM_X + TUNNEL_TO_X) / 2

/** The weak tunnel with the probe slice registered, and the first block it warned. */
function braceableTunnel(): { session: ScriptedSession; block: string; others: string[] } {
  const session = createScriptedSession()
  buildWeakTunnel(session, WARN_TICK)
  const [block, ...others] = ofType(session.events(), 'CollapseWarned').map((event) => event.block)
  return { session, block, others }
}

const blockNamedBy = (event: DomainEvent) => ('block' in event ? event.block : null)

/** The collapse events naming `block`, in order. */
function eventsOfBlock(session: ScriptedSession, block: string): DomainEvent[] {
  return session.events().filter((event) => blockNamedBy(event) === block)
}

const startTicksOf = (session: ScriptedSession, block: string) =>
  ofType(session.events(), 'CollapseStarted')
    .filter((event) => event.block === block)
    .map(({ tick }) => tick)

/** What a brace that ends on `END_TICK` must leave: a fresh warning then, the refill 60 later. */
function expectFreshWarningAtEnd(session: ScriptedSession, block: string): void {
  session.advanceTo(END_TICK + COLLAPSE_WARN_TICKS - 1)
  expect(startTicksOf(session, block)).toEqual([])
  session.advanceTo(END_TICK + COLLAPSE_WARN_TICKS)
  const warned = ofType(session.events(), 'CollapseWarned').filter((event) => event.block === block)
  expect(warned.map(({ tick }) => tick)).toEqual([WARN_TICK, END_TICK])
  expect(startTicksOf(session, block)).toEqual([END_TICK + COLLAPSE_WARN_TICKS])
}

describe('collapse braces: holding a warning (ticket 331)', () => {
  it('holds a block braced on its refill tick in its warning, while the others refill', () =>
    withRegistrations([braceProbeSlice()], () => {
      const { session, block, others } = braceableTunnel()
      session.submit(BRACE_TICK, braceCommand([block], { fromTick: REFILL_TICK }))
      session.advanceTo(REFILL_TICK + 300)
      const braced = ofType(session.events(), 'CollapseBraced')
      expect(braced).toEqual([
        { tick: REFILL_TICK, type: 'CollapseBraced', block, by: ['brace-probe.clamp'] },
      ])
      expect(startTicksOf(session, block)).toEqual([])
      expect(startTicksOf(session, others[0])).toEqual([REFILL_TICK])
      expect(session.state().collapse.blocks).toEqual([
        { block, startTick: WARN_TICK, isForced: false, isBraced: true },
      ])
    }))

  it('warns afresh on the tick a release command ends the brace, and refills 60 ticks later', () =>
    withRegistrations([braceProbeSlice()], () => {
      const { session, block } = braceableTunnel()
      session.submit(BRACE_TICK, braceCommand([block]))
      session.submit(END_TICK, RELEASE_BRACE)
      expectFreshWarningAtEnd(session, block)
    }))

  it("warns afresh on the tick the slice's clock step ends the brace", () =>
    withRegistrations([braceProbeSlice()], () => {
      const { session, block } = braceableTunnel()
      session.submit(BRACE_TICK, braceCommand([block], { endTick: END_TICK }))
      expectFreshWarningAtEnd(session, block)
    }))

  it("warns afresh on the claim's untilTick, the quiet clock stopping there", () =>
    withRegistrations([braceProbeSlice()], () => {
      const { session, block } = braceableTunnel()
      session.submit(BRACE_TICK, braceCommand([block], { untilTick: END_TICK }))
      expectFreshWarningAtEnd(session, block)
    }))

  it('never braces a block whose refill has begun', () =>
    withRegistrations([braceProbeSlice()], () => {
      const { session, block } = braceableTunnel()
      session.submit(REFILL_TICK + 5, braceCommand([block]))
      session.advanceTo(REFILL_TICK + 100)
      expect(ofType(session.events(), 'CollapseBraced')).toEqual([])
      expect(startTicksOf(session, block)).toEqual([REFILL_TICK])
    }))
})

describe('collapse braces: a brace never keeps a warning alive (ticket 331)', () => {
  it('still cancels a braced block when the tunnel is relined', () =>
    withRegistrations([braceProbeSlice()], () => {
      const { session, block } = braceableTunnel()
      session.submit(BRACE_TICK, braceCommand([block]))
      session.submit(30, { type: 'debug.setCasingGrade', payload: { grade: 2 } })
      lineTunnel(session, 30, 2)
      session.advanceTo(400)
      expect(eventsOfBlock(session, block).map(({ type, tick }) => [type, tick])).toEqual([
        ['CollapseWarned', WARN_TICK],
        ['CollapseBraced', BRACE_TICK],
        ['CollapseCancelled', 30],
      ])
    }))

  it('still cancels a braced block when no vehicle is within 16 m', () =>
    withRegistrations([braceProbeSlice()], () => {
      const { session, block } = braceableTunnel()
      session.submit(BRACE_TICK, braceCommand([block]))
      session.submit(REFILL_TICK + 20, poseAt(TUNNEL_MIDDLE_X + 40000, BAND_2_Y))
      session.advanceTo(400)
      expect(eventsOfBlock(session, block).map(({ type, tick }) => [type, tick])).toEqual([
        ['CollapseWarned', WARN_TICK],
        ['CollapseBraced', BRACE_TICK],
        ['CollapseCancelled', REFILL_TICK + 20],
      ])
    }))

  it('cancels, never re-warns, a block that no longer holds when its brace ends', () =>
    withRegistrations([braceProbeSlice()], () => {
      const { session, block } = braceableTunnel()
      session.submit(BRACE_TICK, braceCommand([block], { endTick: END_TICK, leaveAtEnd: true }))
      session.advanceTo(400)
      expect(eventsOfBlock(session, block).map(({ type, tick }) => [type, tick])).toEqual([
        ['CollapseWarned', WARN_TICK],
        ['CollapseBraced', BRACE_TICK],
        ['CollapseCancelled', END_TICK],
      ])
      expect(session.state().collapse.blocks).toEqual([])
    }))

  it('never cancels a braced forced block, and refills it 60 ticks after the brace ends', () =>
    withRegistrations([braceProbeSlice()], () => {
      const session = createScriptedSession()
      const block = blockIdOf(blockContaining({ xMm: 20500, yMm: BAND_1_Y }))
      session.submit(WARN_TICK, forceCollapseCommand(block))
      session.submit(BRACE_TICK, braceCommand([block]))
      session.submit(30, poseAt(20500 + 60000, BAND_1_Y))
      session.submit(END_TICK, RELEASE_BRACE)
      session.advanceTo(END_TICK + COLLAPSE_WARN_TICKS)
      expect(eventsOfBlock(session, block).map(({ type, tick }) => [type, tick])).toEqual([
        ['CollapseWarned', WARN_TICK],
        ['CollapseBraced', BRACE_TICK],
        ['CollapseWarned', END_TICK],
        ['CollapseStarted', END_TICK + COLLAPSE_WARN_TICKS],
      ])
    }))
})

describe('collapse braces: the bore gun and ownership (ticket 331)', () => {
  it("marks a bore's forced warning braced on its first tick when the block is already braced", () =>
    withRegistrations([boreGunSlice(), braceProbeSlice()], () => {
      const session = createScriptedSession()
      standInPocket(session, PLAIN_RIG, 0)
      const blocks = lineEastOf(PLAIN_RIG).map((tile) =>
        blockIdOf(blockContaining({ xMm: tile.tx * 1000 + 500, yMm: tile.ty * 1000 + 500 })),
      )
      session.submit(5, braceCommand(blocks))
      session.submit(WARN_TICK, FIRE_EAST)
      session.advanceTo(200)
      const warned = ofType(session.events(), 'CollapseWarned')
      const braced = ofType(session.events(), 'CollapseBraced')
      expect(warned.length).toBeGreaterThan(0)
      expect(braced.map(({ block, tick }) => [block, tick])).toEqual(
        warned.map(({ block, tick }) => [block, tick]),
      )
      expect(ofType(session.events(), 'CollapseStarted')).toEqual([])
      expect(session.state().collapse.blocks.every(({ isForced }) => isForced)).toBe(true)
    }))

  it("braces nothing through a provider whose row isn't unlocked", () =>
    withRegistrations([gatedBraceProbeSlice()], () => {
      const { session, block } = braceableTunnel()
      session.submit(BRACE_TICK, braceCommand([block]))
      session.advanceTo(REFILL_TICK)
      expect(ofType(session.events(), 'CollapseBraced')).toEqual([])
      expect(startTicksOf(session, block)).toEqual([REFILL_TICK])
    }))
})

describe('collapse braces: the fold (ticket 331)', () => {
  const PROVIDERS = ['brace-probe.zeta', 'brace-probe.alpha', 'brace-probe.mid']

  /** Three providers bracing the same block, registered in `order`. */
  function bracedRun(order: readonly string[]) {
    return withRegistrations([braceProbeSlice(order)], () => {
      const { session, block } = braceableTunnel()
      session.submit(BRACE_TICK, braceCommand([block, block], { untilTick: END_TICK }))
      const folded = bracesAt(session.state(), BRACE_TICK)
      session.advanceTo(END_TICK + 100)
      return {
        folded: [...folded.entries()],
        events: session.events(),
        digest: stateDigest(session.state()),
        readOrder: entriesOf(COLLAPSE_BRACE_REGISTRY).map(({ id }) => id),
      }
    })
  }

  it('gives the same braces, events and digest whatever order the providers register in', () => {
    const forward = bracedRun(PROVIDERS)
    expect(bracedRun([...PROVIDERS].reverse())).toEqual(forward)
    expect(bracedRun([PROVIDERS[1], PROVIDERS[2], PROVIDERS[0]])).toEqual(forward)
  })

  it('names each bracing provider once, sorted in code-unit order', () => {
    const { folded, events } = bracedRun(PROVIDERS)
    const sorted = ['brace-probe.alpha', 'brace-probe.mid', 'brace-probe.zeta']
    expect(folded.map(([, brace]) => brace)).toEqual([{ by: sorted, untilTick: END_TICK }])
    expect(ofType(events, 'CollapseBraced').map(({ by }) => by)).toEqual([sorted])
  })

  it('holds a block while any claim is open-ended, else to the latest claim', () =>
    withRegistrations(
      [braceProbeSlice(), timedSlice('timed-a', 150), timedSlice('timed-b', 90)],
      () => {
        const { session, block } = braceableTunnel()
        expect(bracesAt(session.state(), 50).get(block)).toEqual({
          by: ['timed-a.brace', 'timed-b.brace'],
          untilTick: 150,
        })
        expect(bracesAt(session.state(), 100).get(block)?.by).toEqual(['timed-a.brace'])
        session.submit(BRACE_TICK, braceCommand([block]))
        expect(bracesAt(session.state(), 50).get(block)?.untilTick).toBeNull()
        expect(bracesAt(session.state(), 150).get(block)).toEqual({
          by: ['brace-probe.clamp'],
          untilTick: null,
        })
      },
    ))

  /** A slice bracing every tunnel block the session warns, up to `untilTick`. */
  function timedSlice(id: string, untilTick: number): SliceDefinition {
    return {
      id,
      register: (r) =>
        r.collapseBrace({
          id: `${id}.brace`,
          bracesAt: (state) => state.collapse.blocks.map(({ block }) => ({ block, untilTick })),
        }),
    }
  }
})

describe('collapse braces: the clock, saves and replays (ticket 331)', () => {
  it('never stops a quiet clock every tick while a block is braced open-ended', () =>
    withRegistrations([braceProbeSlice()], () => {
      const { session, block } = braceableTunnel()
      session.submit(BRACE_TICK, braceCommand([block]))
      session.advanceTo(REFILL_TICK + 30)
      const state = session.state()
      expect(nextCollapseTick(state, state.tick)).toBeNull()
    }))

  it('stops a quiet clock at the brace untilTick', () =>
    withRegistrations([braceProbeSlice()], () => {
      const { session, block } = braceableTunnel()
      session.submit(BRACE_TICK, braceCommand([block], { untilTick: END_TICK }))
      session.advanceTo(REFILL_TICK + 30)
      const state = session.state()
      expect(nextCollapseTick(state, state.tick)).toBe(END_TICK)
    }))

  it.each([
    ['a clock step', { fromTick: REFILL_TICK, endTick: 150 }],
    ['an untilTick', { fromTick: REFILL_TICK, untilTick: 180 }],
  ] as const)(
    'gives the same events and digest stepping every tick, batching or jumping, ended by %s',
    (_, options) => {
      const run = (stride: number) =>
        withRegistrations([braceProbeSlice()], () => {
          const { session, block } = braceableTunnel()
          session.submit(BRACE_TICK, braceCommand([block], options))
          for (let tick = BRACE_TICK + stride; tick < 400; tick += stride) session.advanceTo(tick)
          session.advanceTo(400)
          return { events: session.events(), digest: stateDigest(session.state()) }
        })
      const live = run(1)
      expect(ofType(live.events, 'CollapseBraced')).toHaveLength(1)
      expect(ofType(live.events, 'CollapseStarted').length).toBeGreaterThan(1)
      expect(run(7)).toEqual(live)
      expect(run(60)).toEqual(live)
      expect(run(400)).toEqual(live)
    },
  )

  it('runs the sync once a tick however many commands land on it', () => {
    const run = (reportsPerTick: number) =>
      withRegistrations([braceProbeSlice()], () => {
        const { session, block } = braceableTunnel()
        session.submit(BRACE_TICK, braceCommand([block], { untilTick: END_TICK }))
        for (let tick = BRACE_TICK + 1; tick < 300; tick += 3) {
          for (let report = 0; report < reportsPerTick; report++) {
            session.submit(tick, poseAt(TUNNEL_MIDDLE_X, BAND_2_Y))
          }
        }
        session.advanceTo(300)
        // The extra reports only spend seqs, so the collapse events and state are compared.
        const collapseEvents = session
          .events()
          .filter((event) => event.type.startsWith('Collapse'))
          .map((event) => ({ type: event.type, tick: event.tick, block: blockNamedBy(event) }))
        return { collapseEvents, collapse: session.state().collapse }
      })
    const once = run(1)
    expect(once.collapseEvents.filter(({ type }) => type === 'CollapseBraced')).toHaveLength(1)
    expect(run(4)).toEqual(once)
  })

  it('refills on the same tick and digest after a snapshot taken mid-brace is reloaded', () =>
    withRegistrations([braceProbeSlice()], () => {
      const { session, block } = braceableTunnel()
      session.submit(BRACE_TICK, braceCommand([block], { untilTick: END_TICK }))
      session.advanceTo(REFILL_TICK + 30)
      const loaded = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
      if (!('state' in loaded)) throw new Error(loaded.problems.join('; '))
      expect(loaded.state.collapse.blocks.find((entry) => entry.block === block)?.isBraced).toBe(
        true,
      )
      const original = advanceTicks(session.state(), 400)
      const resumed = advanceTicks(loaded.state, 400)
      expect(ofType(original.events, 'CollapseStarted').map(({ tick }) => tick)).toEqual([
        END_TICK + COLLAPSE_WARN_TICKS,
      ])
      expect(resumed.events).toEqual(original.events)
      expect(stateDigest(resumed.state)).toBe(stateDigest(original.state))
    }))

  it('leaves the events, collapse snapshot and digest of a run with no brace as they were', () => {
    const run = (slices: readonly SliceDefinition[]) =>
      withRegistrations(slices, () => {
        const session = createScriptedSession()
        buildWeakTunnel(session, WARN_TICK)
        session.advanceTo(REFILL_TICK + 10)
        const { collapse } = takeSnapshot(session.state()).state
        return { collapse, events: session.events(), digest: stateDigest(session.state()) }
      })
    const plain = run([])
    expect(run([braceProbeSlice()])).toEqual(plain)
    expect(JSON.stringify(plain.collapse)).not.toContain('isBraced')
  })
})
