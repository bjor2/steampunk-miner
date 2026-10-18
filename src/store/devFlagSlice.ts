/**
 * The game store's dev flag slice (ticket 548, the TD ruling on #547 and its #548 ruling): the one
 * writer of the client loop's flags and of the browser's remembered overrides.
 *
 * - `setDevFlags` is the command path the debug API's `ui.setDevFlags` and the panel (#549) share:
 *   the authority's flags go out as one logged `debug.setFlags`, sent even when the choice names
 *   only client flags so the run and its save carry the taint; the client's change here, logged
 *   as `debug_command_applied`, a `drill.sweptCut` flip pending until the drill is idle.
 * - The overrides are read only through an installed `DevFlagStorage`, which the shell installs
 *   in a debug session alone. Bots, specs, lanes, goldens and the Playwright setups install none,
 *   so they run on the shipped defaults whatever a browser remembers.
 * - Each session start (a resume, a load, New Game) runs the client loop on the shipped flags
 *   overlaid with the overrides, and sends the overrides as the session's first `debug.setFlags`.
 *   A loaded world keeps its own recorded delta for every flag the overrides do not name; the
 *   flags an override changed on it are kept for the panel and the badge to say so (#549).
 */
import { getRunLog } from '../logging/runLog'
import type { RunEventPlace } from '../logging/runEvent'
import { DEV_FLAGS, type DevFlags } from '../constants/devFlags'
import {
  chosenClientFlagsOf,
  settledClientFlags,
  SHIPPED_CLIENT_DEV_FLAGS,
  withChosenClientFlags,
  type ClientDevFlags,
} from '../systems/devFlags/clientDevFlags'
import type { DevFlagDelta } from '../systems/authority/devFlagState'
import {
  clientPartOf,
  devFlagChoiceProblems,
  resetChoiceOf,
  runFlagDeltaOf,
  changesClientFlags,
  setFlagsCommandOf,
  setFlagsDeltaOf,
} from '../systems/devFlags/devFlagChoice'
import {
  choiceOfOverrides,
  devFlagOverridesText,
  NO_DEV_FLAG_OVERRIDES,
  readDevFlagOverrides,
  withChosenDevFlags,
  type DevFlagChoice,
  type DevFlagId,
  type DevFlagOverrides,
} from '../systems/devFlags/devFlagOverrides'
import {
  readAuthorityState,
  refuseProblems,
  submitCommand,
  submitUnlessRefused,
} from './authorityLink'

/** The shell's `sm.devFlagOverrides.v1` item and the tab's debug session marker; specs pass a memory copy. */
export interface DevFlagStorage {
  read(): string | null
  /** Replaces the item; null removes it. */
  write(text: string | null): void
  /** Ends the tab's gesture-entered debug session (`?noflags`, the reset button). */
  forgetDebugSession(): void
}

let storage: DevFlagStorage | null = null

/** Only a debug session installs one; null (the default) keeps every override unread. */
export function installDevFlagStorage(next: DevFlagStorage | null): void {
  storage = next
}

export interface DevFlagValues {
  /** The client loop's flags, and the `drill.sweptCut` flip waiting for an idle drill. */
  clientDevFlags: ClientDevFlags
  /** What this browser remembers, read in a debug session; empty outside one. */
  devFlagOverrides: DevFlagOverrides
  /** Flags whose shipped default flipped since an override was set; that override was dropped. */
  changedDevFlagDefaults: readonly DevFlagId[]
  /** A debug session reads the overrides: `?debug`, the tab's marker, or the hidden gesture. */
  isDevFlagSessionOn: boolean
  /** Authority flags the overrides changed on the loaded save as it ran; empty on a new world. */
  overriddenSaveFlags: readonly DevFlagId[]
}

export interface DevFlagActions {
  /** Sets the flags `choice` names, live, through `debug.setFlags`; refused whole on a problem. */
  setDevFlags(choice: DevFlagChoice): void
  /** `setDevFlags`, and the choice remembered by this browser where a debug session reads it. */
  chooseDevFlags(choice: DevFlagChoice): void
  /** Forgets the overrides and the debug session marker, and runs on exactly the shipped flags. */
  resetDevFlags(): void
  /** Reads the installed storage: entries dropped on read are written back cleaned. */
  loadDevFlagOverrides(): void
  /** A fresh session started (a launch with no save, New Game): the overrides at its first tick. */
  startSessionDevFlags(): void
  /** A saved world resumed or loaded: the overrides on top of its own flags at its first tick. */
  startLoadedSessionDevFlags(): void
  /** A scenario's fresh session: the client loop back on the shipped flags, no override read. */
  restoreShippedClientFlags(): void
  /** The fixed step's read: the pending flips land once the drill is idle. */
  settleClientDevFlags(isDrillIdle: boolean): void
}

type SliceHost = DevFlagValues &
  DevFlagActions & { playerId: string; planetTier: number; depthTiles: number }

type SetSlice = (partial: Partial<DevFlagValues>) => void

export const STARTING_DEV_FLAGS: DevFlagValues = {
  clientDevFlags: SHIPPED_CLIENT_DEV_FLAGS,
  devFlagOverrides: NO_DEV_FLAG_OVERRIDES.overrides,
  changedDevFlagDefaults: NO_DEV_FLAG_OVERRIDES.changedDefaults,
  isDevFlagSessionOn: false,
  overriddenSaveFlags: [],
}

export function devFlagActionsOf(set: SetSlice, get: () => SliceHost): DevFlagActions {
  return {
    setDevFlags: (choice) => {
      refuseProblems(devFlagChoiceProblems(choice))
      const client = chosenClientFlagsOf(get().clientDevFlags)
      sendSetFlags(get().playerId, setFlagsDeltaOf(choice, readAuthorityState(), client))
      chooseClientFlags(set, get, choice)
    },
    chooseDevFlags: (choice) => {
      get().setDevFlags(choice)
      rememberOverrides(set, withChosenDevFlags(get().devFlagOverrides, choice))
    },
    resetDevFlags: () => {
      forgetOverrides(set)
      if (isOffShippedFlags(get().clientDevFlags))
        get().setDevFlags(resetChoiceOf(readAuthorityState()))
    },
    loadDevFlagOverrides: () => loadOverrides(set),
    startSessionDevFlags: () => {
      startSessionWithOverrides(set, get)
      set({ overriddenSaveFlags: STARTING_DEV_FLAGS.overriddenSaveFlags })
    },
    startLoadedSessionDevFlags: () => {
      const sent = startSessionWithOverrides(set, get)
      set({ overriddenSaveFlags: flagIdsOf(sent) })
    },
    restoreShippedClientFlags: () =>
      set({ clientDevFlags: withChosenClientFlags(get().clientDevFlags, DEV_FLAGS) }),
    settleClientDevFlags: (isDrillIdle) => {
      const client = get().clientDevFlags
      const settled = settledClientFlags(client, isDrillIdle)
      if (settled !== client) set({ clientDevFlags: settled })
    },
  }
}

/**
 * The authority's flags are refused whole before anything changes (an unknown id, a guest asking
 * for the host's rules); the taint's empty delta goes out as is, a refusal logged like any other,
 * since the client loop's flags stay this machine's own.
 */
function sendSetFlags(playerId: string, delta: DevFlagDelta | null): void {
  if (delta === null) return
  if (Object.keys(delta).length === 0) submitCommand(playerId, setFlagsCommandOf(delta))
  else submitUnlessRefused(playerId, setFlagsCommandOf(delta))
}

function chooseClientFlags(set: SetSlice, get: () => SliceHost, choice: DevFlagChoice): void {
  const client = get().clientDevFlags
  if (!changesClientFlags(choice, chosenClientFlagsOf(client))) return
  const part = clientPartOf(choice)
  set({ clientDevFlags: withChosenClientFlags(client, part) })
  recordClientFlagsSet(get(), part)
}

/**
 * The client's flags are no authority state, so their change is logged here, stamped with the
 * authority's tick and no `cmd`, as the client-owned depth is (`gameStore.recordDebugCommand`).
 */
function recordClientFlagsSet(state: SliceHost, flags: Partial<DevFlags>): void {
  const place: RunEventPlace = {
    playerId: state.playerId,
    planet: state.planetTier,
    depthTiles: state.depthTiles,
  }
  const pending = state.clientDevFlags.pending
  getRunLog().record({ ...place, tick: readAuthorityState().tick }, 'debug_command_applied', {
    command: 'setClientDevFlags',
    args: { flags, pending },
  })
}

function rememberOverrides(set: SetSlice, overrides: DevFlagOverrides): void {
  storage?.write(devFlagOverridesText(overrides))
  set({ devFlagOverrides: overrides })
}

function forgetOverrides(set: SetSlice): void {
  storage?.write(null)
  storage?.forgetDebugSession()
  set({
    devFlagOverrides: STARTING_DEV_FLAGS.devFlagOverrides,
    changedDevFlagDefaults: STARTING_DEV_FLAGS.changedDevFlagDefaults,
    overriddenSaveFlags: STARTING_DEV_FLAGS.overriddenSaveFlags,
  })
}

/** Anything to undo: an authority flag off its default in the session, or a client flag chosen. */
function isOffShippedFlags(client: ClientDevFlags): boolean {
  const delta = runFlagDeltaOf(readAuthorityState(), chosenClientFlagsOf(client))
  return Object.keys(delta).length > 0
}

function loadOverrides(set: SetSlice): void {
  const text = storage?.read() ?? null
  const reading = readDevFlagOverrides(text)
  const cleaned = devFlagOverridesText(reading.overrides)
  if (cleaned !== text) storage?.write(cleaned)
  set({
    devFlagOverrides: reading.overrides,
    changedDevFlagDefaults: reading.changedDefaults,
    isDevFlagSessionOn: storage !== null,
  })
}

/** The authority flags it sent, changed from how the world ran; null when nothing was sent. */
function startSessionWithOverrides(set: SetSlice, get: () => SliceHost): DevFlagDelta | null {
  const overrides = choiceOfOverrides(get().devFlagOverrides)
  const client = { ...DEV_FLAGS, ...clientPartOf(overrides) }
  set({ clientDevFlags: withChosenClientFlags(get().clientDevFlags, client) })
  const delta = setFlagsDeltaOf(overrides, readAuthorityState(), DEV_FLAGS)
  sendSetFlags(get().playerId, delta)
  return delta
}

function flagIdsOf(delta: DevFlagDelta | null): DevFlagId[] {
  return delta === null ? [] : (Object.keys(delta) as DevFlagId[])
}
