/**
 * The game store's debug flag panel slice (ticket 549, the TD ruling on #547 and its #548 ruling):
 * whether the panel is open, and the hidden gesture's way into a debug session.
 *
 * - Players never see the panel: it opens in a debug session (`?debug`, the tab's marker) and from
 *   the hidden gesture, a long press on the version label, which works on the title screen too, so
 *   a phone with no URL bar can open it before it starts or loads a world.
 * - The gesture marks the tab and installs the overrides' storage through the entry the shell
 *   hands over; the overrides are read at that point. With a world in play they go out at once as
 *   the session start would have sent them; on the title screen the game it starts sends them.
 * - Entering is logged as `debug_command_applied`, so the session reads as a debug one. Opening
 *   and closing the panel change nothing in the world and log nothing.
 */
import { getRunLog } from '../logging/runLog'
import { readAuthorityState } from './authorityLink'
import { installDevFlagStorage, type DevFlagStorage } from './devFlagSlice'

/** Marks the tab as a debug session and hands over the overrides' storage. */
export type DebugSessionEntry = () => DevFlagStorage

let entry: DebugSessionEntry | null = null

/**
 * The shell's entry, installed for a player's launch; a scenario launch, bots and specs install
 * none, so the gesture there opens the panel without reading any override.
 */
export function installDebugSessionEntry(next: DebugSessionEntry | null): void {
  entry = next
}

export interface DevFlagPanelValues {
  isDevFlagPanelOpen: boolean
}

export interface DevFlagPanelActions {
  openDevFlagPanel(): void
  closeDevFlagPanel(): void
  /** The long press on the version label: a debug session entered if none is, then the panel. */
  enterDebugSessionByGesture(): void
}

type SliceHost = DevFlagPanelValues &
  DevFlagPanelActions & {
    playerId: string
    planetTier: number
    depthTiles: number
    isDevFlagSessionOn: boolean
    titleMenu: unknown
    loadDevFlagOverrides(): void
    startSessionDevFlags(): void
  }

type SetSlice = (partial: Partial<DevFlagPanelValues>) => void

export const STARTING_DEV_FLAG_PANEL: DevFlagPanelValues = { isDevFlagPanelOpen: false }

export function devFlagPanelActionsOf(set: SetSlice, get: () => SliceHost): DevFlagPanelActions {
  return {
    openDevFlagPanel: () => set({ isDevFlagPanelOpen: true }),
    closeDevFlagPanel: () => set({ isDevFlagPanelOpen: false }),
    enterDebugSessionByGesture: () => {
      if (!get().isDevFlagSessionOn) enterDebugSession(get)
      get().openDevFlagPanel()
    },
  }
}

function enterDebugSession(get: () => SliceHost): void {
  if (entry === null) return
  installDevFlagStorage(entry())
  get().loadDevFlagOverrides()
  recordDebugSessionEntered(get())
  if (get().titleMenu === null) get().startSessionDevFlags()
}

function recordDebugSessionEntered(host: SliceHost): void {
  const place = { playerId: host.playerId, planet: host.planetTier, depthTiles: host.depthTiles }
  getRunLog().record({ ...place, tick: readAuthorityState().tick }, 'debug_command_applied', {
    command: 'enterDebugSession',
    args: { via: 'versionLabelHold' },
  })
}
