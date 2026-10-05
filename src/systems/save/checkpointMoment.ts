/**
 * When the checkpoint is written (#2 done item 7, #12, #26): at every dock and on travel. A visit
 * to the dock includes what the player does there, so selling, repairs, recharges and upgrades
 * write it again, and quitting at the dock keeps them; a tow ends at the dock too. Out on a trip
 * nothing is written, so a resume always starts docked.
 */
import type { DomainEvent, DomainEventType } from '../authority/domainEvent'

const CHECKPOINT_EVENTS: readonly DomainEventType[] = [
  'DockEntered',
  'TravelStarted',
  'RescueTriggered',
  'ResourceSold',
  'RepairPurchased',
  'EnergyRecharged',
  'UpgradePurchased',
]

export function isCheckpointMoment(events: readonly DomainEvent[]): boolean {
  return events.some((event) => CHECKPOINT_EVENTS.includes(event.type))
}
