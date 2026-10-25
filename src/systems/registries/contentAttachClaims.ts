/**
 * One owner kind per attach point (ticket 881; the TD's Q3 on #850: "a load-time check that
 * refuses any socket claimed by both `vehicle-item` and `kit-item` content"): two parts drawn on
 * one point is a visual bug, so the content registry's seal refuses a named point that entries of
 * two content kinds both claim, listing each. A kind's own entries may share a point (the coverage
 * rule, `attachCoverage.ts`, judges those by loadout), and the shared cluster points
 * (`cab.gauge`, `hull.rear`) take any kind, as their items extend one asset.
 */
import type { ContentRegistration } from './content'
import type { SealedRegistration } from './seal'
import { SHARED_ATTACH_IDS } from './sharedAttachIds'

/** Why the entries' attach points are claimed by two kinds; null when none is. */
export function crossKindAttachProblemOf(
  registrations: readonly SealedRegistration<ContentRegistration>[],
): string | null {
  const kindsByPoint = kindsByNamedPoint(registrations.map(({ entry }) => entry))
  const shared = [...kindsByPoint].filter(([, kinds]) => kinds.size > 1)
  if (shared.length === 0) return null
  const lines = shared.map(([point, kinds]) => `${point} by ${[...kinds].sort().join(' and ')}`)
  return `attach points claimed by two content kinds: ${lines.sort().join('; ')}`
}

function kindsByNamedPoint(entries: readonly ContentRegistration[]): Map<string, Set<string>> {
  const kindsByPoint = new Map<string, Set<string>>()
  entries.forEach(({ kind, entry }) => {
    const point = namedPointOf(entry)
    if (point === null) return
    kindsByPoint.set(point, (kindsByPoint.get(point) ?? new Set()).add(kind))
  })
  return kindsByPoint
}

/** The entry's own named point; null for none, a `slot` point or a shared cluster point. */
function namedPointOf(entry: object): string | null {
  const { attach } = entry as { attach?: unknown }
  if (typeof attach !== 'string' || attach === 'slot') return null
  return (SHARED_ATTACH_IDS as readonly string[]).includes(attach) ? null : attach
}
