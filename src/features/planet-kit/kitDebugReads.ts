/**
 * Read-only (feature-slices.md 3.14, ticket 824): `kitOf(system, planet, worldSeed)` prints a
 * planet's kit as `generatedKitOf` composes it (authored on planets 1 to 5, drawn from the family
 * kit rows past the first system), so a planner reads the real draw without a session. A pure
 * function of the seed and the address: it changes no state and logs no line.
 */
import type { DebugResult } from '../../debug/debugScreens'
import { readIndexText } from '../../systems/starMap/planetAddress'
import { generatedKitOf } from './systems/generatedKit'
import type { PlanetKit } from './systems/planetKitTypes'

/** The planet's kit, null where none stands, or the problems with the arguments. */
export function kitResultOf(
  system: unknown,
  planet: unknown,
  worldSeed: unknown,
): DebugResult<{ kit: PlanetKit | null }> {
  const s = indexOf(system)
  const p = indexOf(planet)
  if (s === null || p === null || !Number.isSafeInteger(worldSeed)) {
    return { ok: false, problems: [NOT_AN_ADDRESS] }
  }
  return kitOrProblem(() => generatedKitOf(worldSeed as number, s, p))
}

const NOT_AN_ADDRESS =
  'kitOf takes system and planet as whole indices from 1 and a safe-integer worldSeed'

function indexOf(value: unknown): bigint | null {
  return readIndexText(typeof value === 'number' ? String(value) : value)
}

/** The kit, or the refusal the roster throws (a place the system lacks) as a problem. */
function kitOrProblem(read: () => PlanetKit | null): DebugResult<{ kit: PlanetKit | null }> {
  try {
    return { ok: true, kit: read() }
  } catch (error) {
    return { ok: false, problems: [error instanceof Error ? error.message : String(error)] }
  }
}
