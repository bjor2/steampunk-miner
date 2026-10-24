/**
 * Read-only (docs/standards/feature-slices.md 3.14): the roster is a pure function of the world
 * seed and the address, so printing it changes no state and logs no line. `rosterOf(system,
 * worldSeed)` is how a planner re-prints the real draw the palette gives a system (ticket 775: the
 * picks in the lock were illustrative; the generator's are these). `lookArtOf(lookId)` is a look's
 * art row and tile (ticket 778).
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import type { DebugResult } from '../../debug/debugScreens'
import { readIndexText } from '../../systems/starMap/planetAddress'
import { ARCHETYPE_PALETTE } from './systems/paletteRows'
import { lookArtOf, LOOK_ART, type LookArt } from './systems/render/lookArt'
import { systemRosterOf, type RosterPlanet } from './systems/systemRoster'

export const solarSystemsDebugActions: Readonly<Record<string, DebugAction>> = {
  describe: () => ({ ok: true, ...describePalette() }),
  rosterOf: (system, worldSeed) => rosterResultOf(system, worldSeed),
  lookArtOf: (lookId) => lookArtResultOf(lookId),
}

function describePalette() {
  const { names, looks, newContent, sizeClasses } = ARCHETYPE_PALETTE
  return {
    sliceId: 'solar-systems',
    prefixes: Object.values(names.prefixesByAct).flat().length,
    nouns: names.nouns.length,
    looks: looks.map((look) => look.id),
    lookTiles: LOOK_ART.map((art) => art.tileAssetId),
    newContentSet: newContent.set,
    newFamilies: newContent.families.map((family) => family.id),
    sizeClasses: sizeClasses.classes.map((sizeClass) => sizeClass.id),
  }
}

function rosterResultOf(
  system: unknown,
  worldSeed: unknown,
): DebugResult<{ planets: RosterPlanet[] }> {
  const index = readIndexText(typeof system === 'number' ? String(system) : system)
  const problems = [
    ...(index === null ? ['system must be a whole index from 1'] : []),
    ...(Number.isSafeInteger(worldSeed) ? [] : ['worldSeed must be a safe integer']),
  ]
  if (index === null || problems.length > 0) return { ok: false, problems }
  return rosterOrProblem(index, worldSeed as number)
}

function rosterOrProblem(
  system: bigint,
  worldSeed: number,
): DebugResult<{ planets: RosterPlanet[] }> {
  try {
    return { ok: true, planets: systemRosterOf(worldSeed, system) }
  } catch (error) {
    return { ok: false, problems: [error instanceof Error ? error.message : String(error)] }
  }
}

/** A look's art row and tile, or the problem: the palette has no such look. */
function lookArtResultOf(lookId: unknown): DebugResult<{ art: LookArt }> {
  const art = typeof lookId === 'string' ? lookArtOf(lookId) : null
  return art === null
    ? { ok: false, problems: ['lookId must name a palette look'] }
    : { ok: true, art }
}
