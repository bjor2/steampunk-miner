/**
 * The economy trace's labels (ticket 907): a rescue's cause sorted the way the P3-P5 finding sorts
 * its owners (HS on the GD lock of 25 Oct: deaths tagged by hazard cause), and what a purchase
 * event bought.
 *
 * - `hazard.<kind>`: a hazard contact took the hull to 0 (`hazards/hazardHits.ts` passes its kind);
 * - `collapse`: a collapse crushed the rig (#43);
 * - `fuel`: the rig stranded with no energy, `fuel.<kind>` when a hazard pocket drained it on the
 *   trip (ticket 848);
 * - `hull.<cause>`: any other hull loss the kernel names (`enemy`, `heat`, `lava`, `blast`,
 *   `electrified`).
 */
import type { DomainEvent } from '../systems/authority/domainEvent'

/** The causes `destroyIfHullGone`'s kernel callers pass; a hazard contact passes its kind. */
const KERNEL_HULL_CAUSES: readonly string[] = ['enemy', 'heat', 'lava', 'blast', 'electrified']

/**
 * A rescue's cause: a strand's from the hazard that drained it, a wreck's from what destroyed it
 * (`hull.unknown` when the trace never saw the wreck).
 */
export function deathCauseOf(
  rescueCause: string,
  destroyedBy: string | null,
  drainedBy: string | null,
): string {
  if (rescueCause !== 'destroyed') return strandCauseOf(drainedBy)
  if (destroyedBy === null) return 'hull.unknown'
  if (destroyedBy === 'collapse') return 'collapse'
  if (KERNEL_HULL_CAUSES.includes(destroyedBy)) return `hull.${destroyedBy}`
  return `hazard.${destroyedBy}`
}

function strandCauseOf(drainedBy: string | null): string {
  return drainedBy === null ? 'fuel' : `fuel.${drainedBy}`
}

/** What a kernel purchase event bought, by track or purchase; null for any other event. */
export function purchaseLabelOf(event: DomainEvent): string | null {
  switch (event.type) {
    case 'UpgradePurchased':
      return event.upgradeId
    case 'CasingUpgraded':
      return 'casing'
    case 'GunMounted':
    case 'GunUpgraded':
      return 'gun'
    case 'ChargeRackUpgraded':
      return 'charge_rack'
    case 'LiningTypeUnlocked':
      return 'lining'
    case 'RefinerySlotBought':
      return 'refinery_slot'
    case 'VehicleItemPurchased':
      return `item.${event.itemId}`
    default:
      return null
  }
}
