/**
 * The slice's unlock pan state (feature-slices.md 6.4: fed by `listenForDomainEvents`, never a
 * `GameState` field). An add-on's `FeatureUnlocked` arms the pan; it starts once the pad is on
 * screen, with the travel card gone and the vehicle undocked (docked, the bay screen covers the
 * pad, and the platform lands docked), so the player sees the new building. Read once
 * per fixed step by the staging provider, so it is a plain module record, not React state. It is
 * never saved: a reload starts with no pan and replays none (TD lock on #197 Q4).
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { useGameStore } from '../../../store/gameStore'
import { dockedBayOf } from '../../../systems/authority/dockRules'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { dockAddOnOfRow, type DockAddOn } from '../systems/dockAddOns'
import {
  dockAddOnUnlockedBy,
  dockUnlockPanOf,
  type DockUnlockPan,
} from '../systems/render/dockUnlockPan'

interface UnlockPanRecord {
  /** The row whose building waits for the landing to be on screen. */
  armedRowId: string | null
  /** The pan last started, kept after it ends for the debug read. */
  shown: DockUnlockPan | null
}

const record: UnlockPanRecord = { armedRowId: null, shown: null }

export function shownUnlockPan(): DockUnlockPan | null {
  return record.shown
}

export function armedUnlockPanRowId(): string | null {
  return record.armedRowId
}

/** Follows the session until the returned call; the world piece holds it while mounted. */
export function followUnlockPans(): () => void {
  const stopEvents = listenForDomainEvents(armAndStartUnlockPan)
  const stopCard = useGameStore.subscribe(startArmedPan)
  return () => {
    stopEvents()
    stopCard()
  }
}

export function resetDockBuildingsStore(): void {
  record.armedRowId = null
  record.shown = null
}

function armAndStartUnlockPan(events: readonly DomainEvent[]): void {
  armUnlockPanFrom(events)
  startArmedPan()
}

function armUnlockPanFrom(events: readonly DomainEvent[]): void {
  const addOn = dockAddOnUnlockedBy(events)
  if (addOn !== null) record.armedRowId = addOn.rowId
}

/** Starts the armed pan now unless the travel card or the bay screen still covers the pad. */
function startArmedPan(): void {
  if (!isLandingCovered()) startPanOnto(armedAddOn())
}

function startPanOnto(addOn: DockAddOn | null): void {
  if (addOn === null) return
  record.shown = dockUnlockPanOf(addOn, readAuthorityState())
  record.armedRowId = null
}

function armedAddOn(): DockAddOn | null {
  return record.armedRowId === null ? null : dockAddOnOfRow(record.armedRowId)
}

function isLandingCovered(): boolean {
  return isTravelCardShowing() || isVehicleDocked()
}

function isTravelCardShowing(): boolean {
  return useGameStore.getState().travelTransition !== null
}

/** Docked, the bay screen is drawn over the pad (#37). */
function isVehicleDocked(): boolean {
  return dockedBayOf(readAuthorityState(), useGameStore.getState().playerId) !== null
}
