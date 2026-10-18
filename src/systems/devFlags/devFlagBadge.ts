/**
 * The HUD badge "n debug flags" (ticket 549; VS 2 and the #548 ruling on #547): shown on every
 * screen while a debug session is active and any flag differs from its shipped default, in the
 * running session or in what this browser remembers (the title screen has no session yet, so the
 * remembered ones count there). It says when a remembered override changed how a loaded save ran.
 * A reset puts every flag back, so the badge goes; the run's sticky taint stays in the panel.
 */
import { deltaOfFlags } from '../authority/devFlagState'
import { chosenClientFlagsOf } from './clientDevFlags'
import { clientDeltaOf } from './devFlagChoice'
import type { DevFlagId } from './devFlagOverrides'
import type { DevFlagPanelSources } from './devFlagPanelModel'

export interface DevFlagBadge {
  count: number
  title: string
  /** The remembered override runs over the loaded save's own flags; empty otherwise. */
  note: string
}

export const OVER_SAVE_NOTE = "Your remembered flags override the save's own."

/** The badge, or null while it is hidden. */
export function devFlagBadgeOf(
  sources: DevFlagPanelSources,
  isDebugSession: boolean,
): DevFlagBadge | null {
  const count = flagsOffDefaultOf(sources).length
  if (!isDebugSession || count === 0) return null
  return {
    count,
    title: `${count} debug ${count === 1 ? 'flag' : 'flags'}`,
    note: sources.overriddenSaveFlags.length > 0 ? OVER_SAVE_NOTE : '',
  }
}

/** Each flag off its default, running or remembered, once. */
export function flagsOffDefaultOf(sources: DevFlagPanelSources): DevFlagId[] {
  const running = [
    ...Object.keys(deltaOfFlags(sources.authority)),
    ...Object.keys(clientDeltaOf(chosenClientFlagsOf(sources.client))),
  ]
  return [...new Set([...running, ...Object.keys(sources.overrides)])] as DevFlagId[]
}
