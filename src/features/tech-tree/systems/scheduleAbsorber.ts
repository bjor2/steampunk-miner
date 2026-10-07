/**
 * The Schedule C rows the tree absorbs (spec #161 section 1, Horizontal Scaler): `side_drills`,
 * `shields`, `grav_anchor`, `buoyancy_tanks` and `escape_thrusters` carry `unlockVia: tech_tree`
 * on the locked schedule, so each is one tech node at its own planet, not a second unlock beside
 * it. The fixed map below ties each row to its node; the node claims the row (`scheduleRowId`),
 * opens no earlier than the row's planet, and counts once on the planet's unlock cadence. The
 * `research_lab` row is read here too: combos are researched there, never before its planet.
 */
import type { UnlockRow } from '../../../systems/unlocks/readUnlockSchedule'
import { LOCKED_SCHEDULE } from '../../../systems/unlocks/unlockSchedule'
import type { TechNode } from './techNode'

/** Row id to node id, as #161 fixes it. */
export const ABSORBED_SCHEDULE_ROWS: Readonly<Record<string, string>> = {
  side_drills: 'tech.drill-gear.side_cutters',
  shields: 'tech.mobility.steam_shield',
  grav_anchor: 'tech.mobility.grav_anchor',
  buoyancy_tanks: 'tech.mobility.buoyancy_tanks',
  escape_thrusters: 'tech.mobility.escape_thruster',
}

/** The Schedule C facility where combos are researched (moved to P15 by the Game Director, #162). */
export const RESEARCH_LAB_ROW_ID = 'research_lab'

/** The research lab's planet on the locked schedule: no combo comes before it. */
export function researchLabPlanet(rows: readonly UnlockRow[] = LOCKED_SCHEDULE.rows): number {
  const lab = rows.find((row) => row.id === RESEARCH_LAB_ROW_ID)
  if (lab === undefined) throw new Error(`the locked schedule has no ${RESEARCH_LAB_ROW_ID} row`)
  return lab.planetIndex
}

/** The schedule row a node absorbs; null for every other node. */
export function absorbedRowOf(
  nodeId: string,
  rows: readonly UnlockRow[] = LOCKED_SCHEDULE.rows,
): UnlockRow | null {
  const rowId = Object.keys(ABSORBED_SCHEDULE_ROWS).find(
    (id) => ABSORBED_SCHEDULE_ROWS[id] === nodeId,
  )
  return rows.find((row) => row.id === rowId) ?? null
}

/** Whether the session has reached the planet of the row a node absorbs (true for other nodes). */
export function isAbsorbedRowReached(planetIndex: number, nodeId: string): boolean {
  const row = absorbedRowOf(nodeId)
  return row === null || planetIndex >= row.planetIndex
}

/** Every way the registered nodes disagree with the map and the locked schedule. */
export function absorbedRowProblems(
  nodes: readonly TechNode[],
  rows: readonly UnlockRow[] = LOCKED_SCHEDULE.rows,
): string[] {
  return [
    ...Object.entries(ABSORBED_SCHEDULE_ROWS).flatMap(([rowId, nodeId]) =>
      mappedRowProblems(rowId, nodeId, nodes, rows),
    ),
    ...strayClaimProblems(nodes),
  ]
}

/**
 * The planet's new unlocks, schedule rows and tree capabilities together, each named once: an
 * absorbed row is counted as its node, so its planet never unlocks the same thing twice.
 */
export function unlocksOnPlanet(
  planetIndex: number,
  nodes: readonly TechNode[],
  rows: readonly UnlockRow[] = LOCKED_SCHEDULE.rows,
): string[] {
  const rowUnlocks = rows
    .filter((row) => row.planetIndex === planetIndex && !(row.id in ABSORBED_SCHEDULE_ROWS))
    .map((row) => `row:${row.id}`)
  const nodeUnlocks = nodes
    .filter((node) => node.unlockTier === planetIndex && node.lane !== 'combo')
    .map((node) => node.id)
  return [...rowUnlocks, ...nodeUnlocks]
}

function mappedRowProblems(
  rowId: string,
  nodeId: string,
  nodes: readonly TechNode[],
  rows: readonly UnlockRow[],
): string[] {
  const row = rows.find((candidate) => candidate.id === rowId)
  if (row === undefined) return [`schedule row "${rowId}" is not on the locked schedule`]
  const node = nodes.find((candidate) => candidate.id === nodeId)
  if (node === undefined) return []
  return [
    ...(node.unlockTier === row.planetIndex
      ? []
      : [`${nodeId} sits on P${node.unlockTier}, its row "${rowId}" on P${row.planetIndex}`]),
    ...(node.scheduleRowId === rowId ? [] : [`${nodeId} must claim schedule row "${rowId}"`]),
  ]
}

function strayClaimProblems(nodes: readonly TechNode[]): string[] {
  return nodes
    .filter(isStrayClaim)
    .map((node) => `${node.id} claims "${node.scheduleRowId}", which the map does not give it`)
}

/** A node claiming a schedule row the map gives to another node, or no row the tree absorbs. */
function isStrayClaim(node: TechNode): boolean {
  if (node.scheduleRowId === undefined) return false
  return ABSORBED_SCHEDULE_ROWS[node.scheduleRowId] !== node.id
}
