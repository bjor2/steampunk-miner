/**
 * Which unlock pan to play and when it stages the camera (#170 amendment "Look", TD lock on #197
 * Q4): an add-on's `FeatureUnlocked` names the building to pan onto, the pan is placed on the
 * planet the session stands on, and it stages only on that planet, so a new game or a restored
 * session on another planet never picks up a pan it did not earn.
 */
import type { AuthorityState } from '../../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import { dockSiteOfPlanet } from '../../../../systems/authority/planetOfState'
import type { VehicleStaging } from '../../../../systems/registries/vehicleStaging'
import { DOCK_ADD_ONS, type DockAddOn } from '../dockAddOns'
import { dockAddOnLookPointOf } from './dockAddOnPlacement'
import { unlockPanStagingOf, type UnlockPan } from './unlockPan'

/** A pan started on one planet onto the add-on of `rowId`. */
export interface DockUnlockPan {
  rowId: string
  planetIndex: number
  pan: UnlockPan
}

/** The add-on whose facility row these events unlock, the first in unlock order, or null. */
export function dockAddOnUnlockedBy(events: readonly DomainEvent[]): DockAddOn | null {
  const unlockedIds = new Set(events.flatMap(featureIdsOf))
  return DOCK_ADD_ONS.find((addOn) => unlockedIds.has(addOn.rowId)) ?? null
}

/** The pan onto `addOn` from the session's tick, on its planet; null with no planet. */
export function dockUnlockPanOf(addOn: DockAddOn, state: AuthorityState): DockUnlockPan | null {
  const site = dockSiteOfPlanet(state.planet)
  if (site === null) return null
  return {
    rowId: addOn.rowId,
    planetIndex: state.planet.index,
    pan: { startTick: state.tick, lookAt: dockAddOnLookPointOf(site, addOn) },
  }
}

/** The camera the pan stages now: none off its planet, before it starts or once it is over. */
export function dockUnlockPanStagingOf(
  state: AuthorityState,
  shown: DockUnlockPan | null,
): VehicleStaging | null {
  if (shown === null || shown.planetIndex !== state.planet.index) return null
  return unlockPanStagingOf(state.tick, shown.pan)
}

function featureIdsOf(event: DomainEvent): string[] {
  return event.type === 'FeatureUnlocked' ? [event.featureId] : []
}
