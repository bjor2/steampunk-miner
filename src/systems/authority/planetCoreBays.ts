/**
 * The core bay of each planet (ticket 790, the GD lock on #790 with the HS and VS conditions):
 * fragments banked on a planet count toward that planet's core alone. The session's planet keeps
 * its bay in `platform.coreBay`, so every reader of the bay reads the planet it stands on; the
 * bays of the planets it has left wait in `platform.awayCoreBays`, a sparse map keyed by the
 * planet's stable id `(s,p)`, never by `g`, which moves when a system's planet count changes.
 *
 * Moving the session stows the bay it leaves under its planet and takes out the bay of the planet
 * it lands on, empty on a planet never banked on. Neither `Travel` nor the jump needs a fragment
 * for that, so the jump still spends none (ticket 755). A core completed on an earlier visit lands
 * completed, so `core_completed` is said once per planet however often the session comes back.
 * A campaign total, if one is ever needed, is the sum over the bays, never a counter of its own.
 */
import { placeOfCampaign } from '../starMap/campaignIndex'
import { readIndexText, toIndexText } from '../starMap/planetAddress'
import type { AuthorityState } from './authorityState'
import { NEW_CORE_PROGRESS, type CoreProgress } from './coreProgress'
import { isJsonObject, isWholeNumber } from './payloadFields'
import type { PlatformState } from './platformState'
import { systemOfPlanet, type SessionPlanet } from './planetOfState'

/** A planet's bay while the session is elsewhere: its fragments and whether its core completed. */
export interface AwayCoreBay {
  fragments: number
  isCompleted: boolean
}

export type AwayCoreBays = Readonly<Record<string, AwayCoreBay>>

const EMPTY_BAY: AwayCoreBay = { fragments: 0, isCompleted: false }

/** `s:p`, both as canonical index text: the planet's stable id (P&N roster rule, HS on #790). */
export function corePlanetKeyOf(planet: SessionPlanet): string {
  const system = systemOfPlanet(planet)
  return `${toIndexText(system)}:${placeOfCampaign(system, BigInt(planet.index)).toString()}`
}

/** The platform and core progress the session lands with on `to`, the bay it leaves stowed. */
export function coreBaysOnLanding(
  state: AuthorityState,
  to: SessionPlanet,
): { platform: PlatformState; core: CoreProgress } {
  const stowed = withBayStowed(state)
  const landingKey = corePlanetKeyOf(to)
  const landing = stowed[landingKey] ?? EMPTY_BAY
  return {
    platform: {
      ...withAwayCoreBays(state.platform, withoutKey(stowed, landingKey)),
      coreBay: landing.fragments,
    },
    core: { ...NEW_CORE_PROGRESS, isCompleted: landing.isCompleted },
  }
}

/** The platform with `bays` under its key, or no key at all while no planet is left banked. */
export function withAwayCoreBays<P extends Pick<PlatformState, 'awayCoreBays'>>(
  platform: P,
  bays: AwayCoreBays,
): P {
  const { awayCoreBays: _left, ...rest } = platform
  return (Object.keys(bays).length === 0 ? rest : { ...rest, awayCoreBays: bays }) as P
}

export function copyAwayCoreBays(bays: AwayCoreBays): AwayCoreBays {
  return Object.fromEntries(Object.entries(bays).map(([key, bay]) => [key, { ...bay }]))
}

export function awayCoreBaysProblems(bays: unknown, path: string): string[] {
  if (bays === undefined) return []
  if (!isJsonObject(bays)) return [`${path} must be an object, or be left out`]
  return Object.entries(bays).flatMap(([key, bay]) => awayCoreBayProblems(key, bay, path))
}

/** The away bays with the session's own bay added under its planet, when it holds anything. */
function withBayStowed(state: AuthorityState): AwayCoreBays {
  const away = state.platform.awayCoreBays ?? {}
  const leaving = { fragments: state.platform.coreBay, isCompleted: state.core.isCompleted }
  return isEmptyBay(leaving) ? away : { ...away, [corePlanetKeyOf(state.planet)]: leaving }
}

function withoutKey(bays: AwayCoreBays, key: string): AwayCoreBays {
  const { [key]: _taken, ...rest } = bays
  return rest
}

/** A bay with nothing banked and no core is never stored, so a state has one canonical form. */
function isEmptyBay(bay: AwayCoreBay): boolean {
  return bay.fragments === 0 && !bay.isCompleted
}

function awayCoreBayProblems(key: string, bay: unknown, path: string): string[] {
  const keyProblems = isCorePlanetKey(key) ? [] : [`${path} key "${key}" is not a planet's s:p`]
  return [...keyProblems, ...awayBayValueProblems(bay, `${path}["${key}"]`)]
}

function awayBayValueProblems(bay: unknown, path: string): string[] {
  const isShaped =
    isJsonObject(bay) && isWholeNumber(bay.fragments) && typeof bay.isCompleted === 'boolean'
  if (!isShaped) return [`${path} must hold whole fragments and isCompleted`]
  return bay.fragments === 0 && bay.isCompleted === false
    ? [`${path} holds no fragments and no completed core, so it must be left out`]
    : []
}

/** The system as index text, the place as an integer (a planet with no world may sit below 1). */
export function isCorePlanetKey(key: string): boolean {
  const [system, place, ...rest] = key.split(':')
  return rest.length === 0 && readIndexText(system) !== null && /^(0|-?[1-9]\d*)$/.test(place ?? '')
}
