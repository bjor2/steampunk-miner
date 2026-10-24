/**
 * Fail-on-recolour for a whole planet (ticket 779; the GD lock's point 5 on Campaign Scaling: "the
 * HS fail-on-recolour test lives here: it fails if any SS2 planet only recolours SS1 content").
 * A drawn planet brings something the first system never had only when its new-content slot holds a
 * family, that family is new by id, by name and by behaviour, and no kind of its material pool is a
 * first-system species under a new hue. The three parts are the earlier tickets' checks (the words
 * of `newContentSlots.test.ts`, ticket 775; the behaviour ledger of `familyBehaviours.ts`, ticket
 * 780; the pool kinds of `poolRecolour.ts`, ticket 777), judged together per planet.
 */
import { ECONOMY } from '../../../systems/economy/economy'
import { LOCKED_SCHEDULE } from '../../../systems/unlocks/unlockSchedule'
import { MATERIALS } from '../../materials'
import { ORE_ROWS, oreFamilies } from '../../ores'
import { recolourProblemsOf } from './familyBehaviours'
import { systemMaterialPoolsOf, type MaterialPool } from './materialPool'
import type { NewContentFamily } from './paletteRows'
import { recolouredKindProblemsOf } from './poolRecolour'
import { systemRosterOf, type RosterPlanet } from './systemRoster'

/** Every planet of system `system` that would only recolour the first system, with why. */
export function systemRecolourProblemsOf(worldSeed: number, system: bigint): string[] {
  const pools = systemMaterialPoolsOf(worldSeed, system)
  return systemRosterOf(worldSeed, system).flatMap((planet, at) =>
    planetRecolourProblemsOf(planet, pools[at]),
  )
}

/** Why the planet would only recolour the first system; empty when it brings something new. */
export function planetRecolourProblemsOf(planet: RosterPlanet, pool: MaterialPool): string[] {
  return [...newFamilyProblemsOf(planet), ...recolouredKindProblemsOf([pool])]
}

function newFamilyProblemsOf(planet: RosterPlanet): string[] {
  const family = planet.slot
  if (family === null) return [`${addressOf(planet)} brings no new enemy, hazard or ore family`]
  return [...takenWordProblemsOf(planet, family), ...recolourProblemsOf([family])]
}

function takenWordProblemsOf(planet: RosterPlanet, family: NewContentFamily): string[] {
  const taken = firstSystemWordsOf()
  return [family.id, family.name]
    .filter((word) => taken.has(normalisedWord(word)))
    .map((word) => `${addressOf(planet)}'s family "${word}" is a first-system word`)
}

/** Every id and display name the first system's content already uses, normalised. */
function firstSystemWordsOf(): Set<string> {
  const enemies = ECONOMY.enemies.kinds.map((kind) => kind.id)
  const metalEnemies = Object.keys(ECONOMY.enemies.metal)
  const hazards = Object.keys(ORE_ROWS.planets.hazards)
  const families = oreFamilies().flatMap((family) => [family.id, family.name])
  const species = MATERIALS.materials.flatMap((material) => [material.id, material.name])
  const rows = LOCKED_SCHEDULE.rows.flatMap((row) => [row.id, row.name])
  return new Set(
    [...enemies, ...metalEnemies, ...hazards, ...families, ...species, ...rows].map(normalisedWord),
  )
}

function normalisedWord(text: string): string {
  return text.toLowerCase().replace(/[\s_-]+/g, '')
}

function addressOf(planet: RosterPlanet): string {
  return `${planet.id.system}·${planet.id.planet}`
}
