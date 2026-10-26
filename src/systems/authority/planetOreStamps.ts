/**
 * The ore rules stamp of each planet (ticket 888, the TD's storage row in the GD lock on #888): a
 * small integer stamped once, the first time the session generates the planet at `(s, p)`, and
 * never migrated. The session's planet carries its stamp on `planet.oreRulesVersion`, so chunk
 * generation and regeneration read the stamp, never this build's newest rules; the stamps of the
 * planets the session has left wait in `awayOreRules`, a sparse map keyed by the planet's stable id
 * `s:p` (`corePlanetKeyOf`), beside the core bays of those planets.
 *
 * Moving the session stows the stamp it leaves under its planet and takes out the stamp of the
 * planet it lands on, so a planet left and come back to regenerates as it was first made:
 *
 * - a planet with a stowed stamp lands under it;
 * - a planet with saved state and no stamp, a left planet's core bay in a save from before the
 *   stamps were kept, lands as the build before the generated pools entered it (the TD's `v_pre`,
 *   `oreRulesStampBefore`), so its digests are pre-ticket-888 main's;
 * - any other planet is generated for the first time and takes this build's stamp from its index.
 *
 * A legacy planet, one a save holds with no stamp at all, is never stowed. Absent while no planet
 * is left stamped, so a session that never travels digests as before.
 */
import {
  GENERATED_POOLS_ORE_RULES,
  isKnownOreRulesVersion,
  oreRulesStampBefore,
  oreRulesVersionOnEntry,
} from '../world/planetParams'
import type { AuthorityState } from './authorityState'
import { isJsonObject } from './payloadFields'
import { corePlanetKeyOf, isCorePlanetKey } from './planetCoreBays'
import type { SessionPlanet } from './planetOfState'
import { unknownOreRulesProblemOf } from './unknownOreRules'

export type AwayOreRules = Readonly<Record<string, number>>

/** The stamp the session lands on `to` under, and the stamps of the planets it then has left. */
export interface LandingStamp {
  oreRulesVersion: number | undefined
  awayOreRules: AwayOreRules
  /** Whether `to` is generated for the first time: no stamp was kept and no state was saved. */
  isFirstGeneration: boolean
}

/** Where the session lands on `to`: the stamp it takes and the stamps left behind. */
export function landingStampOf(state: AuthorityState, to: SessionPlanet): LandingStamp {
  const stowed = withStampStowed(state)
  const key = corePlanetKeyOf(to)
  const kept = stowed[key]
  const isSaved = kept === undefined && hasSavedStateAt(state, key)
  return {
    oreRulesVersion: kept ?? (isSaved ? stampBeforePools(to) : oreRulesVersionOnEntry(to.index)),
    awayOreRules: withoutKey(stowed, key),
    isFirstGeneration: kept === undefined && !isSaved,
  }
}

/** The state with `stamps` under its key, or no key at all while no planet is left stamped. */
export function withAwayOreRules(state: AuthorityState, stamps: AwayOreRules): AuthorityState {
  const { awayOreRules: _left, ...rest } = state
  return Object.keys(stamps).length === 0 ? rest : { ...rest, awayOreRules: stamps }
}

/** The stamps under their key for a snapshot, or no key while there are none. */
export function awayOreRulesFieldOf(stamps: AwayOreRules | undefined): {
  awayOreRules?: AwayOreRules
} {
  return stamps === undefined || Object.keys(stamps).length === 0
    ? {}
    : { awayOreRules: { ...stamps } }
}

/** Why a snapshot's `awayOreRules` is not stamps this build can generate by; empty when it is. */
export function awayOreRulesProblems(stamps: unknown, path: string): string[] {
  if (stamps === undefined) return []
  if (!isJsonObject(stamps)) return [`${path} must be an object, or be left out`]
  const entries = Object.entries(stamps)
  if (entries.length === 0) return [`${path} holds no stamp, so it must be left out`]
  return entries.flatMap(([key, stamp]) => [
    ...(isCorePlanetKey(key) ? [] : [`${path} key "${key}" is not a planet's s:p`]),
    ...(isStampThisBuildKnows(stamp) ? [] : [unknownOreRulesProblemOf(`${path}["${key}"]`)]),
  ])
}

/** The stamps of `stamps` newer than this build's rules, by `s:p`, as a load refuses them. */
export function newerAwayStampsOf(stamps: unknown): { key: string; oreRulesVersion: number }[] {
  if (!isJsonObject(stamps)) return []
  return Object.entries(stamps).flatMap(([key, stamp]) =>
    typeof stamp === 'number' && !isKnownOreRulesVersion(stamp)
      ? [{ key, oreRulesVersion: stamp }]
      : [],
  )
}

/** The left stamps with the session's own stamp added under its planet, when it has one. */
function withStampStowed(state: AuthorityState): AwayOreRules {
  const away = state.awayOreRules ?? {}
  const leaving = state.planet.oreRulesVersion
  return leaving === undefined ? away : { ...away, [corePlanetKeyOf(state.planet)]: leaving }
}

/** A left planet's core bay is state a save holds for it (ticket 790). */
function hasSavedStateAt(state: AuthorityState, key: string): boolean {
  return state.platform.awayCoreBays?.[key] !== undefined
}

function stampBeforePools(planet: SessionPlanet): number | undefined {
  return oreRulesStampBefore(planet.index, GENERATED_POOLS_ORE_RULES)
}

function isStampThisBuildKnows(stamp: unknown): boolean {
  return typeof stamp === 'number' && isKnownOreRulesVersion(stamp)
}

function withoutKey(stamps: AwayOreRules, key: string): AwayOreRules {
  const { [key]: _taken, ...rest } = stamps
  return rest
}
