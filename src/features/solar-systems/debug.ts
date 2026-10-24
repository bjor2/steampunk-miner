/**
 * Read-only (docs/standards/feature-slices.md 3.14): the roster is a pure function of the world
 * seed and the address, so printing it changes no state and logs no line. `rosterOf(system,
 * worldSeed)` is how a planner re-prints the real draw the palette gives a system (ticket 775: the
 * picks in the lock were illustrative; the generator's are these). `lookArtOf(lookId)` is a look's
 * art row and tile (ticket 778). `slotCopyOf(system, planet, worldSeed)` is a planet's new-family
 * copy as the card and the hover will show it, filled with its name (ticket 780).
 * `economyRowsOf(system, worldSeed)` is the system's economy rows, amounts as canonical text, with
 * the problems the lock's guards find (none on a sound build; ticket 776).
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import type { DebugResult } from '../../debug/debugScreens'
import { readIndexText } from '../../systems/starMap/planetAddress'
import { economyRowProblemsOf } from './systems/economyRowGuards'
import { economyRowTextOf, systemEconomyRowsOf, type EconomyRowText } from './systems/economyRows'
import { slotCopyOf, type SlotCopy } from './systems/familyCopy'
import { ARCHETYPE_PALETTE } from './systems/paletteRows'
import { lookArtOf, LOOK_ART, type LookArt } from './systems/render/lookArt'
import { rosterPlanetOf, systemRosterOf, type RosterPlanet } from './systems/systemRoster'

export const solarSystemsDebugActions: Readonly<Record<string, DebugAction>> = {
  describe: () => ({ ok: true, ...describePalette() }),
  rosterOf: (system, worldSeed) => rosterResultOf(system, worldSeed),
  lookArtOf: (lookId) => lookArtResultOf(lookId),
  slotCopyOf: (system, planet, worldSeed) => slotCopyResultOf(system, planet, worldSeed),
  economyRowsOf: (system, worldSeed) => economyRowsResultOf(system, worldSeed),
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
  const index = indexOf(system)
  const problems = [
    ...(index === null ? ['system must be a whole index from 1'] : []),
    ...(Number.isSafeInteger(worldSeed) ? [] : ['worldSeed must be a safe integer']),
  ]
  if (index === null || problems.length > 0) return { ok: false, problems }
  return answerOrProblem(() => ({ planets: systemRosterOf(worldSeed as number, index) }))
}

function economyRowsResultOf(
  system: unknown,
  worldSeed: unknown,
): DebugResult<{ rows: EconomyRowText[]; lockProblems: string[] }> {
  const index = indexOf(system)
  const problems = [
    ...(index === null ? ['system must be a whole index from 1'] : []),
    ...(Number.isSafeInteger(worldSeed) ? [] : ['worldSeed must be a safe integer']),
  ]
  if (index === null || problems.length > 0) return { ok: false, problems }
  return answerOrProblem(() => economyRowsAnswerOf(worldSeed as number, index))
}

function economyRowsAnswerOf(worldSeed: number, system: bigint) {
  const rows = systemEconomyRowsOf(worldSeed, system)
  return { rows: rows.map(economyRowTextOf), lockProblems: economyRowProblemsOf(rows) }
}

/** A planet's filled family copy; `copy` is null where the planet's slot is empty. */
function slotCopyResultOf(
  system: unknown,
  planet: unknown,
  worldSeed: unknown,
): DebugResult<{ copy: SlotCopy | null }> {
  const systemIndex = indexOf(system)
  const planetIndex = indexOf(planet)
  const problems = [
    ...(systemIndex === null ? ['system must be a whole index from 1'] : []),
    ...(planetIndex === null ? ['planet must be a whole index from 1'] : []),
    ...(Number.isSafeInteger(worldSeed) ? [] : ['worldSeed must be a safe integer']),
  ]
  if (systemIndex === null || planetIndex === null || problems.length > 0)
    return { ok: false, problems }
  return answerOrProblem(() => ({
    copy: slotCopyOf(rosterPlanetOf(worldSeed as number, systemIndex, planetIndex)),
  }))
}

function indexOf(value: unknown): bigint | null {
  return readIndexText(typeof value === 'number' ? String(value) : value)
}

/** The read's answer, or the refusal the roster throws (system 1, a missing place) as a problem. */
function answerOrProblem<T extends object>(read: () => T): DebugResult<T> {
  try {
    return { ok: true, ...read() }
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
