/**
 * The HUD's debug staging (#500's layout specs; the GD accepted it as scaffolding): a debug run
 * can draw the worst case the specs need, a full hold and a threat marker with its status, over
 * whatever the run really holds, because a real threat spawn and a full hold are slow or flaky to
 * reach in a browser. It changes only what the HUD draws: never authority state, a command, a log
 * line or the digest. Only the debug API sets it; a normal run's staging is always `NO_HUD_STAGING`.
 */
import { combatStatusIconIdOf, enemyIconIdOf } from '../art/icons/iconSet'
import { CARGO_FULL_TEXT, MOST_STATUSES_SHOWN, type CombatStatusStack } from './combatStatuses'
import type { HudModel } from './hudModel'
import type { ThreatMarker } from './threatMarkers'

export interface HudStaging {
  isCargoFull: boolean
  /** A scripted threat marker at this screen-edge octant (0 top, clockwise), or none. */
  threatOctant: number | null
  /** More scripted markers, one at each octant: the upright threat chips' row (#486). */
  threatOctants?: readonly number[]
}

export const NO_HUD_STAGING: HudStaging = { isCargoFull: false, threatOctant: null }

const OCTANTS = 8
const SCRIPTED_THREAT_KIND = 'crawler' as const

export function stagedHudModelOf(model: HudModel, staging: HudStaging): HudModel {
  const withCargo = staging.isCargoFull ? withFullHold(model) : model
  return stagedOctantsOf(staging).reduce(withThreat, withCargo)
}

export function hudStagingProblemsOf(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return ['staging must be an object']
  const { isCargoFull, threatOctant, threatOctants } = value as Partial<HudStaging>
  return [
    ...(typeof isCargoFull === 'boolean' ? [] : ['isCargoFull must be true or false']),
    ...(isOctantOrNone(threatOctant) ? [] : ['threatOctant must be null or a whole 0 to 7']),
    ...(areOctantsOrAbsent(threatOctants) ? [] : ['threatOctants must be a list of wholes 0 to 7']),
  ]
}

function stagedOctantsOf(staging: HudStaging): number[] {
  const first = staging.threatOctant === null ? [] : [staging.threatOctant]
  return [...first, ...(staging.threatOctants ?? [])]
}

function areOctantsOrAbsent(value: unknown): boolean {
  if (value === undefined) return true
  return Array.isArray(value) && value.every((octant) => octant !== null && isOctantOrNone(octant))
}

function isOctantOrNone(value: unknown): boolean {
  return (
    value === null || (Number.isInteger(value) && Number(value) >= 0 && Number(value) < OCTANTS)
  )
}

function withFullHold(model: HudModel): HudModel {
  const { statuses } = model
  const isAlreadyFull = statuses.secondary.some((status) => status.id === 'cargo_full')
  const secondary = isAlreadyFull
    ? statuses.secondary
    : [
        {
          id: 'cargo_full' as const,
          iconId: combatStatusIconIdOf('cargo_full'),
          text: CARGO_FULL_TEXT,
        },
        ...statuses.secondary,
      ]
  return { ...model, cargo: { ...model.cargo, isFull: true }, statuses: { ...statuses, secondary } }
}

function withThreat(model: HudModel, octant: number): HudModel {
  const marker: ThreatMarker = {
    kind: SCRIPTED_THREAT_KIND,
    iconId: enemyIconIdOf(SCRIPTED_THREAT_KIND),
    phase: 'windup',
    octant,
    arc: 'F',
    ticksLeft: 60,
    isTremor: false,
  }
  return {
    ...model,
    threats: [...model.threats, marker],
    statuses: withThreatStatus(model.statuses),
  }
}

/** The threat status in its priority place (last of the six), folded into "+N" past three. */
function hasThreatStatus(statuses: CombatStatusStack): boolean {
  return [...statuses.shown, ...statuses.folded].some((status) => status.id === 'threat')
}

function withThreatStatus(statuses: CombatStatusStack): CombatStatusStack {
  if (hasThreatStatus(statuses)) return statuses
  const threat = {
    id: 'threat' as const,
    iconId: combatStatusIconIdOf('threat'),
    text: 'THREAT',
    urgency: 'slow' as const,
  }
  if (statuses.shown.length >= MOST_STATUSES_SHOWN)
    return {
      ...statuses,
      hiddenCount: statuses.hiddenCount + 1,
      folded: [...statuses.folded, threat],
    }
  return { ...statuses, shown: [...statuses.shown, threat] }
}
