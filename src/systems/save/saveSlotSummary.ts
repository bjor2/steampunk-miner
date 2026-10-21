/**
 * The save header's summary for the slot line (ticket 703; GD lock on #703, the Scalers' input on
 * #672): the planet with its display name (ticket 702), the wallet, how deep the dig has opened the
 * planet and the core's depth for the slot's mini gauge, and the drill level. Written from the
 * session as the save is cut and never read back into play: loading restores the sections and
 * ignores it. Optional: a save or kept entry without one (or with one this build cannot read)
 * shows unknown and still loads, so no migration step is needed.
 *
 * Money crosses as its canonical string (#5), so 1e300 keeps every digit; depths and the level are
 * whole numbers. The drill level is for analytics only and never on the slot line (GD lock).
 */
import type { PortableState } from '../authority/sessionSnapshot'
import { isJsonObject, isWholeNumber } from '../authority/payloadFields'
import { planetParamsOf } from '../authority/planetOfState'
import { levelOfStep } from '../economy/upgradeSteps'
import { isMoneyText } from '../money'
import { planetDisplayNameOf } from '../registries/planetNames'
import { coreDepthOf, deepestOpenedDepthOf } from '../world/openedDepth'

export interface SaveSlotSummary {
  planetIndex: number
  /** The planet's display name when the save was written. */
  planetName: string
  /** The player's wallet as a canonical `Money` string. */
  money: string
  /** Whole metres below the surface of the deepest cell the dig opened on this planet. */
  deepestMetres: number
  /** Whole metres from the surface to the core's top on the dock column: the gauge's full span. */
  coreDepthMetres: number
  /** The drill power track's level, for analytics: never shown. */
  drillLevel: number
}

const WHOLE_FIELDS = ['planetIndex', 'deepestMetres', 'coreDepthMetres', 'drillLevel'] as const

/** The summary of `playerId`'s game; null when the session holds no such player. */
export function slotSummaryOf(state: PortableState, playerId: string): SaveSlotSummary | null {
  const player = state.players[playerId]
  if (player === undefined) return null
  return {
    planetIndex: state.planet.index,
    planetName: planetDisplayNameOf(state.planet.index),
    money: player.wallet,
    ...depthsOf(state),
    drillLevel: levelOfStep('drill_power', player.vehicle.levels.drill_power),
  }
}

function depthsOf(
  state: PortableState,
): Pick<SaveSlotSummary, 'deepestMetres' | 'coreDepthMetres'> {
  const params = planetParamsOf(state.planet)
  if (params === null) return { deepestMetres: 0, coreDepthMetres: 0 }
  return {
    deepestMetres: deepestOpenedDepthOf(params, state.world.chunks),
    coreDepthMetres: coreDepthOf(params),
  }
}

/** The summary as a header or kept entry holds it; undefined when missing or unreadable. */
export function readSlotSummary(raw: unknown): SaveSlotSummary | undefined {
  if (!isJsonObject(raw) || !isSummaryShaped(raw)) return undefined
  const { planetIndex, planetName, money, deepestMetres, coreDepthMetres, drillLevel } =
    raw as unknown as SaveSlotSummary
  return { planetIndex, planetName, money, deepestMetres, coreDepthMetres, drillLevel }
}

function isSummaryShaped(raw: Record<string, unknown>): boolean {
  const hasWholeFields = WHOLE_FIELDS.every((field) => isWholeNumber(raw[field]))
  return hasWholeFields && typeof raw.planetName === 'string' && isMoneyText(raw.money)
}
