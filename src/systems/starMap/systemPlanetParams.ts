/**
 * The generator params of a planet in any solar system (ticket 759): the jump between systems
 * seeds the systems past the first. A planet is generated as its campaign index `g` says, which is
 * what the session holds as its planet index (#781), with two differences from system 1:
 *
 * - its seed hashes its address `(s, p)` (`planetAddressSeed.ts`, the TD architecture in the GD
 *   lock on #650), so planet 1 of system 2 is a world of its own beside planet 6 of system 1, the
 *   same `g`; the params carry the system as canonical index text, and two params of one seed and
 *   index but another system generate other cells;
 * - its ground (rock, ore and core) is `k_jump^(s - 1)` harder (`economy/systemJump.ts`), the system jump's step.
 *
 * System 1 is `planetParamsFor` itself, byte-identical, with no `system` key.
 */
import { systemHardnessStepOf } from '../economy/systemJump'
import { mul, type BigStat } from '../money'
import { planetParamsFor, type PlanetParams } from '../world/planetParams'
import { planetsBefore } from './campaignIndex'
import { FIRST_SYSTEM, readIndexText, toIndexText } from './planetAddress'
import { planetSeedAt } from './planetAddressSeed'

/** The params of the planet at campaign index `planetIndex` of system `system`. */
export function planetParamsAt(
  worldSeed: number,
  system: bigint,
  planetIndex: number,
  oreRulesVersion?: number,
): PlanetParams {
  const params = planetParamsFor(worldSeed, planetIndex, oreRulesVersion)
  if (system === FIRST_SYSTEM) return params
  const planetSeed = planetSeedAt(worldSeed, system, placeInSystem(system, planetIndex))
  return { ...params, planetSeed, system: toIndexText(system) }
}

/** Whether system `system` holds a planet at campaign index `planetIndex`: past its systems before. */
export function isPlanetOfSystem(system: bigint, planetIndex: number): boolean {
  return BigInt(planetIndex) > planetsBefore(system)
}

/** The planet's system: the params' `system`, or system 1 where there is none. */
export function systemOfParams(params: Pick<PlanetParams, 'system'>): bigint {
  return params.system === undefined ? FIRST_SYSTEM : (readIndexText(params.system) ?? FIRST_SYSTEM)
}

/** Ground `hardness` (rock, ore, core) as the planet's system has it: times the system jump's steps. */
export function groundHardnessInSystem(
  params: Pick<PlanetParams, 'system'>,
  hardness: BigStat,
): BigStat {
  return params.system === undefined
    ? hardness
    : mul(hardness, systemHardnessStepOf(systemOfParams(params)))
}

/** The planet's place `p` in its system; throws for a campaign index the system does not hold. */
function placeInSystem(system: bigint, planetIndex: number): bigint {
  if (!isPlanetOfSystem(system, planetIndex)) {
    throw new RangeError(`system ${system} holds no planet at campaign index ${planetIndex}`)
  }
  return BigInt(planetIndex) - planetsBefore(system)
}
