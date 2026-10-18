/**
 * The debug flag panel's view model (ticket 549, the TD ruling on #547, its amendment and the
 * #548 ruling; VS 4 and 5): one row per row of the metadata table (`DEV_FLAG_ROWS`), grouped
 * Client and Authority, so a flag added later shows by itself.
 *
 * - A client row shows the value the loop will run once its pending flip lands, and says it is
 *   pending until the drill is idle.
 * - An authority row shows the session's value; in a shared session only the host may change it,
 *   so a guest's row reads the room's value, read-only.
 * - A flag that does nothing without another (`needsOn`) warns while it is on and that one is off.
 * - A remembered override set against a default that has flipped since says so, and is offered
 *   for dropping; one dropped on read because it now equals the new default says that instead.
 */
import { DEV_FLAG_ROWS, type DevFlagRow, type DevFlagScope } from '../../constants/devFlagRows'
import type { AuthorityDevFlags } from '../../constants/devFlags'
import { chosenClientFlagsOf, type ClientDevFlags } from './clientDevFlags'
import {
  isPinnedAgainstChangedDefault,
  SHIPPED_DEV_FLAGS,
  type DevFlagId,
  type DevFlagOverrides,
  type ShippedDevFlags,
} from './devFlagOverrides'

/** What the panel reads: the session's flags, the browser's overrides and who may change what. */
export interface DevFlagPanelSources {
  /** The authority's flags as the session runs them (`flagsOf(state)`). */
  authority: AuthorityDevFlags
  client: ClientDevFlags
  /** The sticky taint (ticket 547): a `debug.setFlags` was accepted in this session. */
  isEverSet: boolean
  /** Single player always; in a shared session only the host may send `debug.setFlags`. */
  isHost: boolean
  overrides: DevFlagOverrides
  changedDefaults: readonly DevFlagId[]
  /** Authority flags a remembered override changed on the loaded save as it ran. */
  overriddenSaveFlags: readonly DevFlagId[]
}

/** A default that flipped under a remembered override (VS 5 on #547). */
export interface StaleDefault {
  text: string
  /** The override still pins the flag against the new default and can be dropped. */
  isDroppable: boolean
}

export interface DevFlagPanelRow {
  id: DevFlagId
  name: string
  line: string
  isOn: boolean
  defaultText: string
  applyRule: string
  pairingRule: string
  taintLabel: string | null
  isExperimental: boolean
  /** A `drill.sweptCut` flip chosen and waiting for an idle drill. */
  isPending: boolean
  /** A guest's authority row: the room's value, which only the host changes. */
  isReadOnly: boolean
  /** This browser remembers the flag at its value. */
  isRemembered: boolean
  /** The remembered value runs over the loaded save's own. */
  isOverSave: boolean
  staleDefault: StaleDefault | null
  /** Each flag it does nothing without that is off now. */
  pairWarnings: string[]
}

export interface DevFlagPanelGroup {
  scope: DevFlagScope
  title: string
  rows: DevFlagPanelRow[]
}

export interface DevFlagPanelModel {
  groups: DevFlagPanelGroup[]
  /** The sticky taint, which a reset does not clear inside the session (ticket 547). */
  isRunMarked: boolean
}

const GROUP_TITLES: Readonly<Record<DevFlagScope, string>> = {
  client: 'Client',
  authority: 'Authority',
}

const GROUP_ORDER: readonly DevFlagScope[] = ['client', 'authority']

export function devFlagPanelModelOf(
  sources: DevFlagPanelSources,
  rows: readonly DevFlagRow[] = DEV_FLAG_ROWS,
  shipped: ShippedDevFlags = SHIPPED_DEV_FLAGS,
): DevFlagPanelModel {
  const flags = runningFlagsOf(sources)
  return {
    groups: GROUP_ORDER.map((scope) => panelGroupOf(scope, rows, sources, flags, shipped)),
    isRunMarked: sources.isEverSet,
  }
}

/** Every flag as the session will run it: the client's pending flips landed. */
export function runningFlagsOf(sources: DevFlagPanelSources): ShippedDevFlags {
  return { ...chosenClientFlagsOf(sources.client), ...sources.authority }
}

function panelGroupOf(
  scope: DevFlagScope,
  rows: readonly DevFlagRow[],
  sources: DevFlagPanelSources,
  flags: ShippedDevFlags,
  shipped: ShippedDevFlags,
): DevFlagPanelGroup {
  const ofScope = rows.filter((row) => row.scope === scope)
  return {
    scope,
    title: GROUP_TITLES[scope],
    rows: ofScope.map((row) => panelRowOf(row, sources, flags, shipped)),
  }
}

function panelRowOf(
  row: DevFlagRow,
  sources: DevFlagPanelSources,
  flags: ShippedDevFlags,
  shipped: ShippedDevFlags,
): DevFlagPanelRow {
  return {
    id: row.id,
    name: row.name,
    line: row.line,
    isOn: flags[row.id],
    defaultText: `Default ${onOffOf(shipped[row.id])}`,
    applyRule: row.applyRule,
    pairingRule: row.pairingRule,
    taintLabel: row.taintLabel,
    isExperimental: row.isExperimental,
    isPending: Object.hasOwn(sources.client.pending, row.id),
    isReadOnly: row.scope === 'authority' && !sources.isHost,
    isRemembered: sources.overrides[row.id] !== undefined,
    isOverSave: sources.overriddenSaveFlags.includes(row.id),
    staleDefault: staleDefaultOf(row.id, sources, shipped),
    pairWarnings: pairWarningsOf(row, flags),
  }
}

function staleDefaultOf(
  id: DevFlagId,
  sources: DevFlagPanelSources,
  shipped: ShippedDevFlags,
): StaleDefault | null {
  const override = sources.overrides[id]
  if (override !== undefined && isPinnedAgainstChangedDefault(override, id, shipped))
    return { text: defaultChangeText(override.defaultWhenSet, shipped[id]), isDroppable: true }
  if (!sources.changedDefaults.includes(id)) return null
  const text = `${defaultChangeText(!shipped[id], shipped[id])}; your override was dropped`
  return { text, isDroppable: false }
}

function defaultChangeText(from: boolean, to: boolean): string {
  return `Default changed from ${onOffOf(from)} to ${onOffOf(to)}`
}

function pairWarningsOf(row: DevFlagRow, flags: ShippedDevFlags): string[] {
  if (!flags[row.id]) return []
  return row.needsOn
    .filter((needed) => !flags[needed])
    .map((needed) => `Needs ${needed} on: does nothing while it is off.`)
}

function onOffOf(isOn: boolean): string {
  return isOn ? 'on' : 'off'
}
