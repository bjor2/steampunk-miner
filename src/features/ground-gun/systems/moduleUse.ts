/**
 * What the charged signature modules have spent (the `ground-gun.module-use` save section v1,
 * ticket 380; Content's node table on #310, Systems' numbers on #322 section 5): the cementing
 * round fires `cementCharges` cemented shots a dock, at most one every `cementCooldownTicks`; the
 * strut bore wedges `strutCharges` struts a dock; the earthing spike grounds a line at most every
 * `groundCooldownTicks`. Each module keeps the charges it has spent since the last dock and the
 * tick it may act again; the charge count itself is the module's Mark stat, so a Mark researched
 * between docks adds its charge at once. The dock's paid recharge restocks the charges (the TD
 * lock on #318: slice-side, on the dock-service path), never the cooldowns.
 *
 * At its initial value (nothing spent, nothing cooling) the section is out of the state and the
 * digest, so a player who never fires a charged module saves and digests as before. Every field is
 * a safe integer, so the portable form is the value.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { isJsonObject, isWholeNumber } from '../../../systems/authority/payloadFields'
import {
  readSection,
  withSection,
  type SaveSection,
} from '../../../systems/registries/saveSections'
import { moduleStatsAt } from './armouryModules'
import { CEMENTING_ROUND_ITEM_ID, EARTHING_SPIKE_ITEM_ID, STRUT_BORE_ITEM_ID } from './boreGunLane'

/** One charged module's use since the last dock. */
export interface ModuleUse {
  /** Charges spent since the last restock. */
  spent: number
  /** The first tick it may act again. */
  readyTick: number
}

export type ModuleUses = Readonly<Record<string, ModuleUse>>

/** Which of a module's stats are its per-dock charges and its wait between uses. */
interface UseStats {
  dockCharges?: string
  useCooldownTicks?: string
}

const USE_STATS: Readonly<Record<string, UseStats>> = {
  [CEMENTING_ROUND_ITEM_ID]: {
    dockCharges: 'cementCharges',
    useCooldownTicks: 'cementCooldownTicks',
  },
  [EARTHING_SPIKE_ITEM_ID]: { useCooldownTicks: 'groundCooldownTicks' },
  [STRUT_BORE_ITEM_ID]: { dockCharges: 'strutCharges' },
}

const UNUSED: ModuleUse = { spent: 0, readyTick: 0 }

export const MODULE_USE_SECTION: SaveSection<ModuleUses> = {
  id: 'ground-gun.module-use',
  version: 1,
  scope: 'player',
  initial: {},
  problems: moduleUsesProblems,
  toPortable: (value) => value,
  ofPortable: (body) => body as ModuleUses,
}

export function moduleUsesOf(state: AuthorityState, playerId: string): ModuleUses {
  return readSection(state, playerId, MODULE_USE_SECTION)
}

/** The charged modules: those with per-dock charges or a wait between uses. */
export function chargedModuleIds(): readonly string[] {
  return Object.keys(USE_STATS)
}

/** The module's charges a dock at this Mark; null for a module that has none. */
export function dockChargesAt(itemId: string, mark: number): number | null {
  const stat = USE_STATS[itemId]?.dockCharges
  return stat === undefined ? null : statAt(itemId, mark, stat)
}

/** Charges the module has left this dock at this Mark; null for a module that has none. */
export function chargesLeftOf(
  state: AuthorityState,
  playerId: string,
  itemId: string,
  mark: number,
): number | null {
  const charges = dockChargesAt(itemId, mark)
  if (charges === null) return null
  return Math.max(0, charges - moduleUseOf(state, playerId, itemId).spent)
}

/** The module may act on this tick: a charge left (if it has charges) and its wait run out. */
export function isModuleReady(
  state: AuthorityState,
  playerId: string,
  itemId: string,
  mark: number,
): boolean {
  if (chargesLeftOf(state, playerId, itemId, mark) === 0) return false
  return state.tick >= moduleUseOf(state, playerId, itemId).readyTick
}

/** The state after the module acted at `tick`: one charge spent, its wait started. */
export function withModuleUsed(
  state: AuthorityState,
  playerId: string,
  { itemId, mark, tick }: { itemId: string; mark: number; tick: number },
): AuthorityState {
  const use = moduleUseOf(state, playerId, itemId)
  const charges = dockChargesAt(itemId, mark)
  const used: ModuleUse = {
    spent: charges === null ? use.spent : Math.min(charges, use.spent + 1),
    readyTick: tick + cooldownTicksAt(itemId, mark),
  }
  return withModuleUse(state, playerId, itemId, used)
}

/** The state with every charge of the module back; its wait runs on. */
export function withChargesRestocked(
  state: AuthorityState,
  playerId: string,
  itemId: string,
): AuthorityState {
  const use = moduleUseOf(state, playerId, itemId)
  return withModuleUse(state, playerId, itemId, { ...use, spent: 0 })
}

function moduleUseOf(state: AuthorityState, playerId: string, itemId: string): ModuleUse {
  return moduleUsesOf(state, playerId)[itemId] ?? UNUSED
}

function withModuleUse(
  state: AuthorityState,
  playerId: string,
  itemId: string,
  use: ModuleUse,
): AuthorityState {
  const uses = { ...moduleUsesOf(state, playerId), [itemId]: use }
  return withSection(state, playerId, MODULE_USE_SECTION, uses)
}

/** Ticks before the module may act again after acting; 0 for a module with no wait. */
function cooldownTicksAt(itemId: string, mark: number): number {
  const stat = USE_STATS[itemId]?.useCooldownTicks
  return stat === undefined ? 0 : statAt(itemId, mark, stat)
}

function statAt(itemId: string, mark: number, stat: string): number {
  const value = moduleStatsAt(itemId, mark).stats[stat]
  if (value === undefined) throw new RangeError(`no module stat ${stat} on ${itemId}`)
  return value
}

function moduleUsesProblems(body: unknown): string[] {
  if (!isJsonObject(body)) return ['ground-gun.module-use must be an object']
  return Object.entries(body).flatMap(([itemId, use]) => moduleUseProblems(itemId, use))
}

function moduleUseProblems(itemId: string, use: unknown): string[] {
  if (!(itemId in USE_STATS)) return [`ground-gun.module-use.${itemId} is no charged module`]
  if (!isJsonObject(use)) return [`ground-gun.module-use.${itemId} must be an object`]
  return (['spent', 'readyTick'] as const)
    .filter((field) => !isWholeNumber(use[field]))
    .map((field) => `ground-gun.module-use.${itemId}.${field} must be a whole number`)
}
