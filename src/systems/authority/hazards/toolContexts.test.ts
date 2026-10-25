import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { ContactEffectRow } from '../../registries/contactEffects'
import type { PreCutContext } from '../../registries/preCutContexts'
import { isToolActing } from '../../vehicle/actingTools'
import { FACING } from '../../vehicle/vehiclePose'
import { vehicleOf } from '../authorityState'
import type { DomainEvent } from '../domainEvent'
import {
  createScriptedSession,
  dockInBay,
  GROUND,
  mineTile,
  poseAbove,
  type ScriptedSession,
} from '../scriptedSession'
import { stateDigest } from '../stateDigest'
import { placeHazardCommand } from './hazardDebugRules'
import { hazardVehicleFieldProblems } from './hazardVehicleFields'
import { hazardKindsInDrillReach } from './toolContexts'

// Tools that act by context (ticket 881; the GD lock on #850, the TD's `preCutContext` seam, G&V's
// 0.5 s hysteresis): a probe slice owns a tongs-like tool whose context is spinecrystal within the
// drill's reach, and whose factor takes the bite to 40% while it acts.

const START = 100
const TAIL = 30
const TOOL = 'probe.tongs'
/** Three cells to the side of the rig standing over GROUND: far outside the 1.6 m reach. */
const AWAY = { tx: GROUND.tx + 3, ty: GROUND.ty }

const BITE_ROW: ContactEffectRow = {
  id: 'probe.spinecrystal',
  kind: 'spinecrystal',
  effect: 'bite',
  factorBp: 10000,
  diveHullCapBp: 2500,
  hullShareBp: 200,
}

function probeSlice(isOwned: boolean, withHook = true): SliceDefinition {
  const hook: PreCutContext = {
    id: 'probe.kit',
    tailTicks: TAIL,
    toolContextsOf: (state, _playerId, params, at) =>
      isOwned
        ? [
            {
              toolId: TOOL,
              isInContext: hazardKindsInDrillReach(state, params, at).has('spinecrystal'),
            },
          ]
        : [],
  }
  return {
    id: 'probe',
    register: (r) => {
      r.contactEffect(BITE_ROW)
      r.contactFactor({
        id: 'probe.tongs_bite',
        kind: 'spinecrystal',
        factorBpOf: (state, playerId) =>
          isToolActing(vehicleOf(state, playerId), TOOL) ? 4000 : null,
      })
      if (withHook) r.preCutContext(hook)
    },
  }
}

function actingChanges(events: readonly DomainEvent[]) {
  return events.filter((event) => event.type === 'ToolActingChanged')
}

/** A session on planet 1 with spinecrystal placed in GROUND. */
function sessionWithShard(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(START, placeHazardCommand('spinecrystal', GROUND.tx, GROUND.ty))
  return session
}

function withProbe<T>(run: () => T, isOwned = true, withHook = true): T {
  return withRegistrations([probeSlice(isOwned, withHook)], run)
}

describe('tool contexts', () => {
  it('starts an owned tool on the first report with its hazard in drill reach, and says so once', () => {
    withProbe(() => {
      const session = sessionWithShard()
      const first = session.submit(START + 1, poseAbove(GROUND, FACING.down))
      expect(actingChanges(first)).toMatchObject([
        { type: 'ToolActingChanged', toolId: TOOL, on: true },
      ])
      expect(session.vehicle().toolsSeenAt).toEqual([{ toolId: TOOL, tick: START + 1 }])
      expect(actingChanges(session.submit(START + 5, poseAbove(GROUND, FACING.down)))).toEqual([])
      expect(session.vehicle().toolsSeenAt).toEqual([{ toolId: TOOL, tick: START + 5 }])
    })
  })

  it('acts on through the 30-tick tail after a drive-only report leaves, then stops once', () => {
    withProbe(() => {
      const session = sessionWithShard()
      session.submit(START + 1, poseAbove(GROUND, FACING.down))
      expect(actingChanges(session.submit(START + 12, poseAbove(AWAY, FACING.right)))).toEqual([])
      expect(isToolActing(session.vehicle(), TOOL)).toBe(true)
      expect(actingChanges(session.submit(START + 24, poseAbove(AWAY, FACING.right)))).toEqual([])
      const stopped = session.submit(START + 1 + TAIL, poseAbove(AWAY, FACING.right))
      expect(actingChanges(stopped)).toMatchObject([
        { type: 'ToolActingChanged', toolId: TOOL, on: false },
      ])
      expect(session.vehicle().actingTools).toBeUndefined()
      expect(session.vehicle().toolsSeenAt).toBeUndefined()
      expect(actingChanges(session.submit(START + 43, poseAbove(AWAY, FACING.right)))).toEqual([])
    })
  })

  it('lets the cut of the report that reaches the context meet the tool’s factor', () => {
    const bites = withProbe(() => {
      const session = sessionWithShard()
      session.submit(START + 1, poseAbove(AWAY, FACING.right))
      session.submit(START + 61, poseAbove(GROUND, FACING.down, { drillTicks: 60 }))
      return session.events().filter((event) => event.type === 'HazardBit')
    })
    expect(bites).toMatchObject([{ kind: 'spinecrystal', hullBp: 20 }])
  })

  it('changes nothing while the player owns no tool: the state digests as with no hook', () => {
    const play = (isOwned: boolean, withHook: boolean) =>
      withProbe(
        () => {
          const session = sessionWithShard()
          mineTile(session, START + 1, GROUND)
          session.submit(START + 80, poseAbove(AWAY, FACING.right))
          return { digest: stateDigest(session.state()), events: session.events() }
        },
        isOwned,
        withHook,
      )
    const unowned = play(false, true)
    const none = play(false, false)
    expect(unowned.digest).toBe(none.digest)
    expect(unowned.events).toEqual(none.events)
  })

  it('flips the flag at the same ticks on a replay of the same seed and inputs', () => {
    const flips = () =>
      withProbe(() => {
        const session = sessionWithShard()
        const ticks: number[] = []
        const reports = [
          [START + 1, GROUND],
          [START + 13, AWAY],
          [START + 40, AWAY],
          [START + 52, GROUND],
          [START + 64, AWAY],
          [START + 100, AWAY],
        ] as const
        reports.forEach(([tick, tile]) => {
          const events = session.submit(tick, poseAbove(tile, FACING.down))
          actingChanges(events).forEach(() => ticks.push(tick))
        })
        return ticks
      })
    expect(flips()).toEqual([START + 1, START + 40, START + 52, START + 100])
    expect(flips()).toEqual(flips())
  })

  it('stops every tool and forgets where its context was seen at the dock', () => {
    withProbe(() => {
      const session = sessionWithShard()
      session.submit(START + 1, poseAbove(GROUND, FACING.down))
      const events = dockInBay(session, START + 5, 'sell')
      expect(actingChanges(events)).toMatchObject([
        { type: 'ToolActingChanged', toolId: TOOL, on: false },
      ])
      expect(session.vehicle().actingTools).toBeUndefined()
      expect(session.vehicle().toolsSeenAt).toBeUndefined()
    })
  })

  it('carries toolsSeenAt in the snapshot only as { toolId, tick } in tool id order', () => {
    const seen = (toolsSeenAt: unknown) => hazardVehicleFieldProblems({ toolsSeenAt }, 'v')
    expect(seen(undefined)).toEqual([])
    expect(
      seen([
        { toolId: 'a.b', tick: 3 },
        { toolId: 'a.c', tick: 0 },
      ]),
    ).toEqual([])
    const refused = ['v.toolsSeenAt must list { toolId, tick } in tool id order, or be left out']
    expect(seen([])).toEqual(refused)
    expect(
      seen([
        { toolId: 'a.c', tick: 3 },
        { toolId: 'a.b', tick: 3 },
      ]),
    ).toEqual(refused)
    expect(seen([{ toolId: 'a.b', tick: -1 }])).toEqual(refused)
    expect(seen([{ toolId: 'a.b', tick: 1, extra: true }])).toEqual(refused)
  })
})
