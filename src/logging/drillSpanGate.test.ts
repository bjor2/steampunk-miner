import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import type { AuthorityCommand, CommandIntent } from '../systems/authority/authorityCommand'
import { createScriptedSession, poseAbove } from '../systems/authority/scriptedSession'
import { stepBoundsAt } from '../systems/authority/stepBoundRead'
import { NO_DRIVE } from '../systems/vehicle/driveSigns'
import { FACING } from '../systems/vehicle/vehiclePose'
import type { TilePoint } from '../systems/world/tileGrid'
import { recordDomainEventsTo } from './domainEventLog'
import { createMemorySink } from './eventSink'
import type { RunEvent } from './runEvent'
import { createRunLog, type DrillLines } from './runLog'

// Ticket 420, the Horizontal Scaler's condition on #396: the folded log still shows a gate hit at
// its exact cell, after the span of the cells the swept cut broke on its way down, which stopped
// at the gated cell and discarded the leftover; and the domain events are the same whichever way
// the run log writes them.

/** Planet 1's surface ore cluster round (57, 291), as `fullHoldSweep` crosses it: ground above. */
const GATED: TilePoint = { tx: 57, ty: 289 }
const ABOVE = { x: 57_500, y: 297_500 }
const PLACE = { playerId: 'p1', planet: 1, depthTiles: 0 }

/** A fake slice whose gate refuses the one ore cell `GATED` (feature-slices.md 3.6). */
const REFUSING_GATE: SliceDefinition = {
  id: 'gate-probe',
  register: (r) =>
    r.gateCheck({
      id: 'gate-probe.one-cell',
      check: ({ tile }) =>
        tile.tx === GATED.tx && tile.ty === GATED.ty
          ? { outcome: 'refused', gateKind: 'probe', required: 'probe-rig', have: 'none' }
          : null,
    }),
}

/** A strong drill stepping down column 57 onto the gated cell, every step logged as the game does. */
function sweepOntoTheGate(drillLines: DrillLines) {
  return withRegistrations([REFUSING_GATE], () => {
    const session = createScriptedSession()
    const sink = createMemorySink()
    const runLog = createRunLog({ runId: 'run_gate', sink, secondsSinceStart: () => 0, drillLines })
    const send = (tick: number, intent: CommandIntent) => {
      const seq = session.state().players.p1.lastSeq + 1
      runLog.recordCommand({ playerId: 'p1', tick, seq, ...intent } as AuthorityCommand)
      recordDomainEventsTo(runLog, PLACE, session.submit(tick, intent), session.state())
    }
    send(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_power', level: 1000 } })
    send(0, { type: 'debug.setEnergy', payload: { energy: '100000' } })
    const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
    send(0, { type: 'reportPose', payload: { ...payload, ...ABOVE } })
    const stepMm = stepBoundsAt(session.state(), 'p1').cuttingMm
    for (let tick = 1; tick <= 60; tick++) {
      send(tick, {
        type: 'drillStep',
        payload: { x: ABOVE.x, y: ABOVE.y - stepMm * tick, drive: NO_DRIVE },
      })
    }
    runLog.flushDrillSpans()
    return { lines: sink.events, events: session.events() }
  })
}

describe('drill spans at a gate (ticket 420)', () => {
  it('logs the gate hit at its exact cell right after the span and lining the cut stopped there', () => {
    const { lines } = sweepOntoTheGate('spans')
    const at = lines.findIndex((line) => line.event === 'gate_hit')
    const spanAt = lines.map(({ event }) => event).lastIndexOf('drill_cut', at)
    const span = lines[spanAt] as RunEvent<'drill_cut'>
    const hit = lines[at] as RunEvent<'gate_hit'>
    expect(hit.data).toMatchObject({ tx: GATED.tx, ty: GATED.ty, outcome: 'refused' })
    expect(lines.slice(spanAt + 1, at).map(({ event }) => event)).toEqual(['casing_lined'])
    expect(span.data.stop).toBe('gate')
    expect(span.data.cells).toBeGreaterThan(0)
    expect(span.data.last?.[1]).toBeGreaterThan(GATED.ty)
    expect(lines.some((line) => line.event === 'tile_destroyed')).toBe(false)
  })

  it('answers the same domain events with the drill spans folded or one line a cell', () => {
    const folded = sweepOntoTheGate('spans')
    const perCell = sweepOntoTheGate('cells')
    expect(JSON.stringify(folded.events)).toBe(JSON.stringify(perCell.events))
    const gateLines = (lines: readonly RunEvent[]) =>
      lines.filter((line) => line.event === 'gate_hit').map(({ seq: _seq, ...line }) => line)
    expect(gateLines(folded.lines)).toEqual(gateLines(perCell.lines))
  })
})
