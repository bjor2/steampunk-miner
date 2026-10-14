/**
 * The off-act item heat gauge (the GD ruling on #263 Q1 a, numbers Systems' per Q3): off the Fire
 * act the kernel's gauge reads 0 (`heatRules.ts`), so the heat the lane's items add lives here, in
 * each player's `aetheric.heat` section v1. Only item costs fill it (the governor's pocket, #263);
 * it never takes terrain or drill heat and never throttles, damages or slows the vehicle. It cools
 * `coolingUnitsPerTick` a tick from the tick it was last set, worked out when read, so no clock
 * runs for it; a cold gauge goes back to the section's initial value, out of the state and the
 * digest. Units are the kernel gauge's (`HEAT_UNITS_PER_POINT` a point), the unit the condenser's
 * ratio burns (#360).
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { isJsonObject } from '../../../systems/authority/payloadFields'
import {
  readSection,
  withSection,
  type SaveSection,
} from '../../../systems/registries/saveSections'
import { AETHERIC_ECONOMY, type ItemHeatBalance } from './aethericEconomy'

/** `units` of heat as they stood at `settledTick`. */
export interface ItemHeat {
  units: number
  settledTick: number
}

export const COLD: ItemHeat = { units: 0, settledTick: 0 }

export const ITEM_HEAT_SECTION: SaveSection<ItemHeat> = {
  id: 'aetheric.heat',
  version: 1,
  scope: 'player',
  initial: COLD,
  problems: itemHeatProblems,
  toPortable: (value) => value,
  ofPortable: (body) => body as ItemHeat,
}

export function itemHeatBalance(): ItemHeatBalance {
  return AETHERIC_ECONOMY.itemHeat
}

/** The player's item heat at `tick`, cooled since it was last set. */
export function itemHeatUnitsAt(state: AuthorityState, playerId: string, tick: number): number {
  return cooledUnitsOf(readSection(state, playerId, ITEM_HEAT_SECTION), tick)
}

/** The gauge with `units` more heat at `tick`, held to its max. */
export function withItemHeatAdded(
  state: AuthorityState,
  playerId: string,
  tick: number,
  units: number,
): AuthorityState {
  const heat = Math.min(itemHeatUnitsAt(state, playerId, tick) + units, gaugeMaxUnits())
  return withItemHeatUnits(state, playerId, tick, heat)
}

/** The gauge set to `units` at `tick`; a cold gauge leaves the section. */
export function withItemHeatUnits(
  state: AuthorityState,
  playerId: string,
  tick: number,
  units: number,
): AuthorityState {
  const heat = units === 0 ? COLD : { units, settledTick: tick }
  return withSection(state, playerId, ITEM_HEAT_SECTION, heat)
}

export function gaugeMaxUnits(): number {
  return itemHeatBalance().gaugeMaxUnits
}

function cooledUnitsOf(heat: ItemHeat, tick: number): number {
  const cooling = itemHeatBalance().coolingUnitsPerTick * Math.max(0, tick - heat.settledTick)
  return Math.max(0, heat.units - cooling)
}

const ITEM_HEAT_FIELDS = ['units', 'settledTick'] as const

function itemHeatProblems(body: unknown): string[] {
  if (!isJsonObject(body)) return ['aetheric.heat must be an object']
  return ITEM_HEAT_FIELDS.filter((field) => !Number.isSafeInteger(body[field])).map(
    (field) => `aetheric.heat.${field} must be a safe integer`,
  )
}
