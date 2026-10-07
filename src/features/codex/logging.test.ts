import { describe, expect, it } from 'vitest'
import { recordDomainEventsTo } from '../../logging/domainEventLog'
import { createMemorySink } from '../../logging/eventSink'
import { createRunLog } from '../../logging/runLog'
import { runEventProblems } from '../../logging/runEventSchema'
import { withRegistrations } from '../../registries/registrar'
import {
  createScriptedSession,
  mineTile,
  surfaceOreTiles,
} from '../../systems/authority/scriptedSession'
import { slice as CODEX } from './register'

// Each codex domain event is logged as its `codex.<snake_case>` run event, checked by the run-log
// schema like a kernel line (#207, feature-slices.md 3.15).

function codexLinesOfFirstMine() {
  return withRegistrations([CODEX], () => {
    const events = mineTile(createScriptedSession(), 1, surfaceOreTiles(1)[0])
    const sink = createMemorySink()
    const runLog = createRunLog({ runId: 'run_codex', sink, secondsSinceStart: () => 0 })
    recordDomainEventsTo(runLog, { playerId: 'p1', planet: 1, depthTiles: 0 }, events)
    const lines = sink.events.filter(({ event }) => event.startsWith('codex.'))
    return { lines, problems: lines.flatMap(runEventProblems) }
  })
}

describe('codex run events', () => {
  it('logs contact, discovery and both entries as schema-valid run events', () => {
    const { lines, problems } = codexLinesOfFirstMine()
    expect(lines.map(({ event, data }) => ({ event, data }))).toEqual([
      {
        event: 'codex.ore_contacted',
        data: { oreId: 'kernel.metal.t1', family: 'metal', tier: 1, grade: 0, via: 'drill' },
      },
      { event: 'codex.entry_added', data: { key: 'ore:kernel.metal.t1', stage: 'contacted' } },
      {
        event: 'codex.ore_discovered',
        data: { oreId: 'kernel.metal.t1', family: 'metal', tier: 1, grade: 0 },
      },
      { event: 'codex.entry_added', data: { key: 'ore:kernel.metal.t1', stage: 'mined' } },
    ])
    expect(problems).toEqual([])
  })
})
