/**
 * Which items a player has switched to auto, in authority state (ticket 317, the #310 GD
 * decision): per player, per item id, saved and digested, so every client sees the same lamp and
 * preview and a replay gives the same act. An item on auto keeps its hold reason (null while it
 * acts or previews) and its locked preview: the aim and target tile chosen `previewTicks` before
 * the act, and the tick it acts.
 *
 * Off is no entry, and a player with none holds no `autoModes` key at all, so a save that never
 * switched anything on digests as before. Docking never touches it; another planet clears only
 * the previews (the shot clock starts afresh there).
 */
import type { TilePoint } from '../../world/tileGrid'
import { AUTO_HOLD_REASONS, type AutoHoldReason } from '../../registries/autoActors'
import type { AuthorityState, PlayerState } from '../authorityState'
import { isJsonObject, isWholeNumber } from '../payloadFields'

/** The target locked for the act, shown to every client until `actTick`. */
export interface AutoPreview extends TilePoint {
  aim: number
  lockedTick: number
  actTick: number
}

export interface AutoMode {
  itemId: string
  preview: AutoPreview | null
  hold: AutoHoldReason | null
}

const NO_MODES: readonly AutoMode[] = []

export function autoModesOf(state: AuthorityState, playerId: string): readonly AutoMode[] {
  return state.players[playerId]?.autoModes ?? NO_MODES
}

export function autoModeOf(
  state: AuthorityState,
  playerId: string,
  itemId: string,
): AutoMode | null {
  return autoModesOf(state, playerId).find((mode) => mode.itemId === itemId) ?? null
}

export function isAutoModeOn(state: AuthorityState, playerId: string, itemId: string): boolean {
  return autoModeOf(state, playerId, itemId) !== null
}

/** The item switched on fresh: no preview, no hold until the clock looks. */
export function switchedOnMode(itemId: string): AutoMode {
  return { itemId, preview: null, hold: null }
}

/** The player's modes with `mode` in place of the one for its item, kept in item id order. */
export function modesWith(state: AuthorityState, playerId: string, mode: AutoMode): AutoMode[] {
  const others = autoModesOf(state, playerId).filter((kept) => kept.itemId !== mode.itemId)
  return [...others, mode].sort((a, b) => (a.itemId < b.itemId ? -1 : 1))
}

/** The player's modes with the item switched off. */
export function modesWithout(state: AuthorityState, playerId: string, itemId: string): AutoMode[] {
  return autoModesOf(state, playerId).filter((kept) => kept.itemId !== itemId)
}

/** The state with the player's modes set; with none, the `autoModes` key is dropped. */
export function withPlayerAutoModes(
  state: AuthorityState,
  playerId: string,
  modes: readonly AutoMode[],
): AuthorityState {
  const player = state.players[playerId]
  return { ...state, players: { ...state.players, [playerId]: playerWithModes(player, modes) } }
}

/** Every mode kept on, with its preview and hold dropped: a new planet starts the clock again. */
export function playerOnNewPlanet(player: PlayerState): PlayerState {
  if (player.autoModes === undefined) return player
  return playerWithModes(
    player,
    player.autoModes.map((mode) => switchedOnMode(mode.itemId)),
  )
}

export function isAnyAutoModeOn(state: AuthorityState): boolean {
  return Object.values(state.players).some((player) => player.autoModes !== undefined)
}

function playerWithModes(player: PlayerState, modes: readonly AutoMode[]): PlayerState {
  const { autoModes: _dropped, ...rest } = player
  return modes.length === 0 ? rest : { ...rest, autoModes: modes }
}

export function portableAutoModesOf(modes: readonly AutoMode[]): AutoMode[] {
  return modes.map((mode) => ({
    ...mode,
    preview: mode.preview === null ? null : { ...mode.preview },
  }))
}

export function portableAutoModesProblems(modes: unknown, path: string): string[] {
  if (modes === undefined) return []
  if (!Array.isArray(modes) || modes.length === 0) return [`${path} must be a non-empty list`]
  return [
    ...modes
      .map((mode, index) => ({ mode, index }))
      .filter(({ mode }) => !isAutoMode(mode))
      .map(({ index }) => `${path}[${index}] is malformed`),
    ...(isInItemOrder(modes) ? [] : [`${path} must list each item once, in item id order`]),
  ]
}

function isAutoMode(mode: unknown): boolean {
  return (
    isJsonObject(mode) &&
    typeof mode.itemId === 'string' &&
    (mode.hold === null || (AUTO_HOLD_REASONS as readonly unknown[]).includes(mode.hold)) &&
    (mode.preview === null || isAutoPreview(mode.preview))
  )
}

function isAutoPreview(preview: unknown): boolean {
  return (
    isJsonObject(preview) &&
    [preview.aim, preview.lockedTick, preview.actTick].every(isWholeNumber) &&
    Number.isSafeInteger(preview.tx) &&
    Number.isSafeInteger(preview.ty)
  )
}

function isInItemOrder(modes: readonly unknown[]): boolean {
  const ids = modes.map((mode) => (isJsonObject(mode) ? mode.itemId : null))
  return ids.every((id, index) => index === 0 || String(ids[index - 1]) < String(id))
}
