/**
 * The extraction slice's registration (#201; data half in ticket 239): no side effects at import;
 * the loader calls `register`.
 *
 * The mineral drain ships: its `vehicle-item` row and `power-up` entry, its item card, the
 * `extraction` section holding the trip counter every income item shares, the dock reset of that
 * counter, the `drain_yield` line, the income row of the reports and the drain's sale at the
 * Upgrade bay; with it the lane's tree nodes, the five extractors' and the drain's, and the trip
 * cap as the kernel's income-cap clamp (ticket 384). The slurry siphon and its node stay held (see
 * `systems/extractionContent.ts`). The lane's P16 fork (ticket 269) registers its Prospector
 * branch; the Hauler, an income mover, stays unregistered until the 15% income-cap check (#385)
 * merges (`systems/extractionFork.ts`).
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { extractionDebugActions } from './debug'
import { incomeReportRows } from './incomeReportRows'
import { EXTRACTION_PROJECTIONS, EXTRACTION_RUN_EVENTS } from './logging'
import {
  EXTRACTION_ITEM_CARDS,
  EXTRACTION_POWER_UPS,
  EXTRACTION_VEHICLE_ITEMS,
  extractionTechNodes,
} from './systems/extractionContent'
import { SHIPPED_EXTRACTION_FORK_NODES } from './systems/extractionFork'
import { EXTRACTION_SELLER } from './systems/extractionSales'
import { EXTRACTION_TRIP_SECTION } from './systems/incomeTrip'
import { EXTRACTION_TRIP_CAP_SOURCE } from './systems/tripCap'
import { TRIP_RESET } from './systems/tripReset'

export const slice: SliceDefinition = {
  id: 'extraction',
  register(r) {
    r.content('vehicle-item', EXTRACTION_VEHICLE_ITEMS)
    r.content('power-up', EXTRACTION_POWER_UPS)
    r.content('tech-node', extractionTechNodes())
    r.content('tech-node', SHIPPED_EXTRACTION_FORK_NODES)
    r.itemDescriptionEntries(EXTRACTION_ITEM_CARDS)
    r.vehicleItemSeller(EXTRACTION_SELLER)
    r.saveSection(EXTRACTION_TRIP_SECTION)
    r.authorityReaction(TRIP_RESET)
    r.eventProjections(EXTRACTION_PROJECTIONS)
    r.runEvents(EXTRACTION_RUN_EVENTS)
    r.reportRows(incomeReportRows)
    r.tripCapSource(EXTRACTION_TRIP_CAP_SOURCE)
    // steampunkDebug.features.extraction.getTrip() / .statPreview(itemId, mark, planet)
    r.debugActions(extractionDebugActions)
  },
}
