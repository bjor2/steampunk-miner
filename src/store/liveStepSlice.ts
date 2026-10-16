/**
 * The game store's live-step slice (#11 section 5, the TD's ruling on ticket 301): whether the
 * live game's fixed step runs. A scenario or a restored snapshot leaves the session exactly at its
 * end tick, so the step holds there until the player's first input or a debug call that moves
 * time; otherwise every frame the page draws before the next debug call would add a tick, and the
 * `?scenario=` and `applyScenario` paths would end on different ticks and digests. The debug
 * `pause()` holds it until `resume()`. A page sent to the background holds it until the player is
 * back and taps or presses (#470 P1-1, ticket 472), so they never return into a live enemy.
 * Rendering goes on while held; only the step stops.
 *
 * None of it is authority state, a command or part of the digest; only the debug `step(ticks)`
 * logs `debug_command_applied`, because it moves the authority's clock as no play did.
 */
import { getRunLog } from '../logging/runLog'
import type { TitleMenu } from '../systems/views/titleMenuModel'
import { readAuthorityState } from './authorityLink'

/**
 * `awaitingPlay`: set up by a scenario or a restore, waiting for play to start it. `pageHidden`:
 * the page went to the background while the step ran, waiting for a tap or play to resume it.
 */
export type LiveStepHold = 'running' | 'awaitingPlay' | 'pageHidden' | 'paused'

export interface LiveStepValues {
  liveStepHold: LiveStepHold
}

export interface LiveStepActions {
  /** The session stands at a scenario's or a snapshot's tick until play starts it. */
  holdLiveStepUntilPlay(): void
  /** The player's input or a debug time call: a hold until play ends, a debug pause stays. */
  releaseHoldUntilPlay(): void
  /** The page is hidden: a running step holds until the player is back (ticket 472). */
  holdLiveStepWhilePageHidden(): void
  /** A finger on the page: a step held while the page was hidden runs again (ticket 472). */
  resumeLiveStepOnTap(): void
  /** Debug `pause()`: no live step until `resume()`. */
  pauseLiveStep(): void
  /** Debug `resume()`: the live step runs again, whatever held it. */
  resumeLiveStep(): void
  /** Debug `step(ticks)`, before its steps run: ends a hold until play, logs the call. */
  prepareDebugSteps(ticks: number): void
}

type SliceHost = LiveStepValues &
  LiveStepActions & {
    playerId: string
    planetTier: number
    depthTiles: number
  }

type SetSlice = (partial: Partial<LiveStepValues>) => void

export const STARTING_LIVE_STEP: LiveStepValues = { liveStepHold: 'running' }

export function liveStepActionsOf(set: SetSlice, get: () => SliceHost): LiveStepActions {
  return {
    holdLiveStepUntilPlay: () => set({ liveStepHold: 'awaitingPlay' }),
    releaseHoldUntilPlay: () => {
      if (isHeldForPlay(get().liveStepHold)) set({ liveStepHold: 'running' })
    },
    holdLiveStepWhilePageHidden: () => {
      if (get().liveStepHold === 'running') set({ liveStepHold: 'pageHidden' })
    },
    resumeLiveStepOnTap: () => {
      if (get().liveStepHold === 'pageHidden') set({ liveStepHold: 'running' })
    },
    pauseLiveStep: () => set({ liveStepHold: 'paused' }),
    resumeLiveStep: () => set({ liveStepHold: 'running' }),
    prepareDebugSteps: (ticks) => {
      get().releaseHoldUntilPlay()
      recordDebugSteps(get(), ticks)
    },
  }
}

/**
 * The fixed step stands still: held here, paused by the settings overlay (#33 section 1) or the
 * pause menu (ticket 404), or behind the title menu until the player picks a game (ticket 403).
 */
export function isLiveStepHeld(state: LiveStepValues & HoldingMenus): boolean {
  return isMenuHoldingPlay(state) || state.liveStepHold !== 'running'
}

/** The overlays that stand the fixed step still while open. */
interface HoldingMenus {
  isSettingsOpen: boolean
  pauseMenu: object | null
  titleMenu: TitleMenu | null
}

function isMenuHoldingPlay(state: HoldingMenus): boolean {
  return state.isSettingsOpen || state.pauseMenu !== null || state.titleMenu !== null
}

/** Holds the player's next input ends; a debug pause is not one of them. */
function isHeldForPlay(hold: LiveStepHold): boolean {
  return hold === 'awaitingPlay' || hold === 'pageHidden'
}

/** Stamped with the tick the steps start from, like `fastForward`. */
function recordDebugSteps(host: SliceHost, ticks: number): void {
  const stamp = {
    playerId: host.playerId,
    planet: host.planetTier,
    depthTiles: host.depthTiles,
    tick: readAuthorityState().tick,
  }
  getRunLog().record(stamp, 'debug_command_applied', { command: 'step', args: { ticks } })
}
