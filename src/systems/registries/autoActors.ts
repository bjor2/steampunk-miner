/**
 * Items that act on their own while the player has switched them to auto (ticket 317, the #310 GD
 * decision and the GD lock on #206): the mode, its holds, the lamp's reason and the saved preview
 * are one kernel core keyed by item id (`authority/autoMode/`), so the bore gun's steam sear is
 * only its first user and a slice's self-acting item (#328's alarm shield, later spotter guns)
 * registers here without touching gun code.
 *
 * An actor answers for its own item: the numbers its mode runs on, its own clock, its own holds,
 * the target it would act on and the act itself, through the item's normal path. The core adds
 * the holds every item shares (docked, anchored, a collapse warning in the rig's block, the
 * energy reserve) and the preview: it locks the target `previewTicks` before acting and acts on
 * exactly that aim. Everything here is integers and tiles, read on the authority, never the
 * client's fog or input.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { RuleEffect } from '../authority/commandRule'
import type { TilePoint } from '../world/tileGrid'
import { defineRegistry, type SealedRegistration } from './seal'

/**
 * Why an item on auto is not acting, as the lamp names it (Gameplay on #310): the player always
 * sees why. `unavailable` is an item the rig cannot use now (no gun mounted), `inactive` a vehicle
 * stranded or destroyed.
 */
export const AUTO_HOLD_REASONS = [
  'docked',
  'inactive',
  'anchored',
  'collapse_warning',
  'unavailable',
  'recovering',
  'income_cap',
  'no_target',
  'energy_reserve',
  'would_warn',
] as const

export type AutoHoldReason = (typeof AUTO_HOLD_REASONS)[number]

/** The numbers an item's mode runs on, from the item's own data. */
export interface AutoSettings {
  /** Ticks the target is shown, locked, before the act; never fewer than the core's floor. */
  previewTicks: number
  /** Ticks auto waits after a manual use, on the item's own clock (the sear's Mark stat). */
  manualWaitTicks: number
  /**
   * The share of the tank, in basis points, kept above the rescue floor after the act (#322's
   * `reserveAboveRescueBp`, one value every item reads).
   */
  reserveAboveRescueBp: number
}

/** What the item would act on: its aim (a bearing for a gun), the tile it is for, its energy. */
export interface AutoTarget {
  aim: number
  tile: TilePoint
  /** Energy the act would take from the tank, in quanta. */
  energyQuanta: number
}

export interface AutoActor {
  /** `<slice>.<name>`, as every registration. */
  id: string
  /** The item whose mode this is: its toggle, holds and preview are keyed by it. */
  itemId: string
  /** The item's numbers for this player, or null while the rig cannot use it. */
  settingsOf(state: AuthorityState, playerId: string): AutoSettings | null
  /**
   * The first tick it may act again on its own clock (a manual use folds its wait into it), or
   * null while that tick is not yet known.
   */
  readyTickOf(state: AuthorityState, playerId: string): number | null
  /** Its own hold before any target is looked for, or null. */
  holdOf(state: AuthorityState, playerId: string): AutoHoldReason | null
  /** The best target now, or null when there is none worth acting on. */
  bestTargetOf(state: AuthorityState, playerId: string): AutoTarget | null
  /** The target along a locked aim as the ground stands now, or null when none is left on it. */
  targetAlong(state: AuthorityState, playerId: string, aim: number): AutoTarget | null
  /** Its own hold on this target, or null. */
  holdAt(state: AuthorityState, playerId: string, target: AutoTarget): AutoHoldReason | null
  /** Acting on `aim` at `tick`, through the item's normal path. */
  act(state: AuthorityState, playerId: string, aim: number, tick: number): RuleEffect
}

export const AUTO_ACTOR_REGISTRY = defineRegistry<AutoActor>('autoActors', duplicateItemProblem)

/** One actor per item: two registrations for one item would race for its mode. */
function duplicateItemProblem(
  registrations: readonly SealedRegistration<AutoActor>[],
): string | null {
  const seen = new Set<string>()
  for (const { entry } of registrations) {
    if (seen.has(entry.itemId)) return `two auto actors register item ${entry.itemId}`
    seen.add(entry.itemId)
  }
  return null
}
