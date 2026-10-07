/**
 * Read-only debug actions (feature-slices.md 3.14), so e2e specs and balance probes can read a
 * planet's mix without generating it: `steampunkDebug.features['planet-mix'].mixOf(8, 83921)`.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { oreMixFor } from './systems/oreMix'
import { familyRows } from './systems/familyRows'

function describe() {
  return { ok: true as const, sliceId: 'planet-mix', families: familyRows() }
}

function mixOf(planetIndex: unknown, worldSeed: unknown) {
  const isPlanet = Number.isSafeInteger(planetIndex) && (planetIndex as number) >= 1
  const isSeed = Number.isSafeInteger(worldSeed) && (worldSeed as number) >= 0
  if (!isPlanet || !isSeed) {
    return { ok: false as const, problems: ['mixOf takes a planet index from 1 and a world seed'] }
  }
  return { ok: true as const, ...oreMixFor(planetIndex as number, worldSeed as number) }
}

export const planetMixDebugActions: Readonly<Record<string, DebugAction>> = { describe, mixOf }
