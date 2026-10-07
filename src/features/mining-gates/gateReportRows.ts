/**
 * The mining gates' rows in the balance and session reports (#223 `reportRows`; #142 acceptance
 * 14, ticket 236), derived from a run's log and never written into it: per planet, the gate hits,
 * the gated cells cleared and the ore lost, each by gate kind. The dynamite clears are what the
 * GD lock on #148 judges (a median of 1.5 or more per run, on the pacing seeds). Printed on every
 * planet with gate content, and on an earlier one only when a gate met the drill there.
 */
import type { ReportRow, ReportRowSource } from '../../logging/registries/reportRows'
import type { RunEvent } from '../../logging/runEvent'
import { GATE_ROWS } from './systems/gateRows'

export const MINING_GATES_REPORT_ROWS_ID = 'mining-gates.gates'

const GATE_HIT = 'gate_hit'
const GATE_CLEARED = 'mining-gates.gate_cleared'
const GATE_ORE_LOST = 'mining-gates.gate_ore_lost'
const GATE_KINDS = ['drill', 'rig', 'dynamite']

export const miningGatesReportRows: ReportRowSource = {
  id: MINING_GATES_REPORT_ROWS_ID,
  rowsOf: gateRowsOf,
}

function gateRowsOf(events: readonly RunEvent[], _worldSeed: number, planet: number): ReportRow[] {
  const onPlanet = events.filter((event) => event.planet === planet)
  if (planet < GATE_ROWS.gateContentFromPlanet && !onPlanet.some(isGateLine)) return []
  return [
    { label: 'gate hits by kind', value: countsByKind(onPlanet, GATE_HIT, 'gateKind') },
    {
      label: 'gated cells cleared by kind',
      value: countsByKind(onPlanet, GATE_CLEARED, 'gateKind'),
    },
    {
      label: 'gated ore lost by cause',
      value: countsOf(linesNamed(onPlanet, GATE_ORE_LOST), 'cause'),
    },
  ]
}

function isGateLine(event: RunEvent): boolean {
  return [GATE_HIT, GATE_CLEARED, GATE_ORE_LOST].includes(event.event)
}

/** `drill 3, rig 0, dynamite 2`: every kind, zeros included, so a missing clear reads as 0. */
function countsByKind(events: readonly RunEvent[], name: string, field: string): string {
  const lines = linesNamed(events, name)
  return GATE_KINDS.map(
    (kind) => `${kind} ${lines.filter((data) => data[field] === kind).length}`,
  ).join(', ')
}

/** `vented 2, drifted 1`, or `none`. */
function countsOf(lines: readonly Record<string, unknown>[], field: string): string {
  const counts = new Map<string, number>()
  for (const data of lines)
    counts.set(String(data[field]), (counts.get(String(data[field])) ?? 0) + 1)
  if (counts.size === 0) return 'none'
  return [...counts].map(([value, count]) => `${value} ${count}`).join(', ')
}

function linesNamed(events: readonly RunEvent[], name: string): Record<string, unknown>[] {
  return events
    .filter((event) => event.event === name)
    .map((event) => event.data as Record<string, unknown>)
}
