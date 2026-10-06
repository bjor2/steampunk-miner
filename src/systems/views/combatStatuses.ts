/**
 * The HUD's combat status stack (#158 "Combat statuses"): the six statuses that must read without
 * their text, in priority order (hull critical, collapse, fuse, overheat, low energy, threat); at
 * most three show at once and the rest fold into a "+N" pip. Urgency is a pulse rate, never a
 * colour; with flashes off the screen draws a thicker rim instead. Cargo full and the tow
 * countdown are secondary, read between fights. Display only: nothing here is authority state.
 *
 * Hull critical is the hull at or under `hullCriticalPercent` of `src/data/hud/hud.json` (25, the
 * first energy warning line of #7 reused, to be checked in the feel test). Collapse is a block
 * warning within the collapse watch's radius of this vehicle (#43), the same rule that started it.
 */
import HUD_TUNING from '../../data/hud/hud.json'
import { COLLAPSE_ACTIVE_RADIUS_MM } from '../../constants/balance'
import {
  combatStatusIconIdOf,
  type CombatStatusId,
  type SecondaryStatusId,
} from '../art/icons/iconSet'
import type { AuthorityState } from '../authority/authorityState'
import { blockOfEntry, isWarningAt } from '../authority/collapse/collapseState'
import { vehicleBodiesOf } from '../authority/collapse/collapseWatch'
import { isBlockCentreWithin } from '../world/collapseBlock'
import type { FuseWarning } from './chargeReading'
import type { HeatReading } from './heatReading'
import type { CargoReading, EnergyWarning } from './hudModel'
import type { VehicleStateReading } from './hudReadings'
import type { ThreatMarker } from './threatMarkers'

/** Steady, a slow pulse, a fast pulse: the only three rates, so the ear's cue matches the eye's. */
export type StatusUrgency = 'steady' | 'slow' | 'fast'

export interface CombatStatusReading {
  id: CombatStatusId
  iconId: string
  text: string
  urgency: StatusUrgency
}

export interface SecondaryStatusReading {
  id: SecondaryStatusId
  iconId: string
  text: string
}

export interface CombatStatusStack {
  /** At most `MOST_STATUSES_SHOWN`, highest priority first. */
  shown: CombatStatusReading[]
  /** The rest, as the "+N" pip counts them. */
  hiddenCount: number
  secondary: SecondaryStatusReading[]
}

export interface CombatStatusSources {
  hullPermille: number
  isCollapseWarned: boolean
  chargeFuse: FuseWarning | null
  heat: HeatReading | null
  warning: EnergyWarning
  threats: readonly ThreatMarker[]
  cargo: CargoReading
  vehicleState: VehicleStateReading
}

export const MOST_STATUSES_SHOWN = 3

export const HULL_CRITICAL_PERCENT: number = HUD_TUNING.hullCriticalPercent

const PERMILLE_PER_PERCENT = 10

const HULL_CRITICAL_TEXT = 'HULL CRITICAL'
const COLLAPSE_TEXT = 'COLLAPSE: back off'
const OVERHEAT_TEXT = 'OVERHEAT: drill throttled'
const CARGO_FULL_TEXT = 'CARGO FULL'

export function combatStatusStackOf(sources: CombatStatusSources): CombatStatusStack {
  const active = [
    hullCriticalOf(sources),
    collapseOf(sources),
    fuseOf(sources),
    overheatOf(sources),
    lowEnergyOf(sources),
    threatOf(sources),
  ].filter((status): status is CombatStatusReading => status !== null)
  return {
    shown: active.slice(0, MOST_STATUSES_SHOWN),
    hiddenCount: Math.max(0, active.length - MOST_STATUSES_SHOWN),
    secondary: secondaryOf(sources),
  }
}

/** A block warning within the watch radius of this player's vehicle: it may fall on them. */
export function isCollapseWarnedFor(state: AuthorityState, playerId: string): boolean {
  const body = vehicleBodiesOf(state).find((each) => each.playerId === playerId)
  if (body === undefined) return false
  return state.collapse.blocks.some(
    (entry) =>
      isWarningAt(entry, state.tick) &&
      isBlockCentreWithin(blockOfEntry(entry), body.centre, COLLAPSE_ACTIVE_RADIUS_MM),
  )
}

function hullCriticalOf(sources: CombatStatusSources): CombatStatusReading | null {
  if (sources.hullPermille > HULL_CRITICAL_PERCENT * PERMILLE_PER_PERCENT) return null
  return statusOf('hull_critical', HULL_CRITICAL_TEXT, 'fast')
}

function collapseOf(sources: CombatStatusSources): CombatStatusReading | null {
  return sources.isCollapseWarned ? statusOf('collapse', COLLAPSE_TEXT, 'fast') : null
}

function fuseOf(sources: CombatStatusSources): CombatStatusReading | null {
  const fuse = sources.chargeFuse
  if (fuse === null) return null
  return statusOf('fuse', fuse.text, fuse.isInsideBlast ? 'fast' : 'slow')
}

function overheatOf(sources: CombatStatusSources): CombatStatusReading | null {
  if (sources.heat?.isThrottled !== true) return null
  return statusOf('overheat', OVERHEAT_TEXT, 'slow')
}

function lowEnergyOf(sources: CombatStatusSources): CombatStatusReading | null {
  const { warning } = sources
  if (warning.level === 'ok') return null
  return statusOf('low_energy', warning.text, warning.level === 'critical' ? 'fast' : 'slow')
}

/** One status for every threat: the arrows say where, this says how many and how close. */
function threatOf(sources: CombatStatusSources): CombatStatusReading | null {
  const { threats } = sources
  if (threats.length === 0) return null
  const isLanding = threats.some((threat) => threat.phase !== 'windup')
  const text = threats.length === 1 ? 'THREAT' : `THREATS x${threats.length}`
  return statusOf('threat', text, isLanding ? 'fast' : 'slow')
}

function secondaryOf(sources: CombatStatusSources): SecondaryStatusReading[] {
  const towText = sources.vehicleState.rescueCountdownText
  return [
    ...(sources.cargo.isFull ? [secondaryStatusOf('cargo_full', CARGO_FULL_TEXT)] : []),
    ...(towText === '' ? [] : [secondaryStatusOf('tow', towText)]),
  ]
}

function statusOf(id: CombatStatusId, text: string, urgency: StatusUrgency): CombatStatusReading {
  return { id, iconId: combatStatusIconIdOf(id), text, urgency }
}

function secondaryStatusOf(id: SecondaryStatusId, text: string): SecondaryStatusReading {
  return { id, iconId: combatStatusIconIdOf(id), text }
}
