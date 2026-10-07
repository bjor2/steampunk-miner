/**
 * The mining-gates slice's registration (#142, ticket 236): no side effects at import; the loader
 * calls `register`.
 *
 * It registers #142's `canMine` as the gate check the drill, the blast and power-up terrain edits
 * ask, names each ore cell's drill class (dense, drill-gated signature, ordinary) so the kernel's
 * scratch floor reads it, and adds the five extractors as `vehicle-item` rows, so the kernel's
 * loadout can own them, sold at the Upgrade bay from each one's planet with its card once its node
 * is researched (ticket 248), or granted. Its ledger logs every gated cell freed or lost,
 * and the balance and session reports print each planet's gate hits, clears and losses.
 * Gate content starts on planet 7 (GD lock on #148).
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { miningGatesDebugActions } from './debug'
import { miningGatesReportRows } from './gateReportRows'
import { MINING_GATES_PROJECTIONS, MINING_GATES_RUN_EVENTS } from './logging'
import { canMine } from './systems/canMine'
import { miningGatesDrillClass } from './systems/drillClass'
import { GATE_ROWS } from './systems/gateRows'
import { gateLedger } from './systems/gateLedger'
import { RIG_CARDS, RIG_SELLER } from './systems/rigSales'
import { vehicleItemOfRig } from './systems/rigs'

export const MINING_GATES_GATE_CHECK_ID = 'mining-gates.can-mine'

export const slice: SliceDefinition = {
  id: 'mining-gates',
  register(r) {
    r.gateCheck({ id: MINING_GATES_GATE_CHECK_ID, check: canMine })
    r.oreDrillClass(miningGatesDrillClass)
    r.content('vehicle-item', GATE_ROWS.rigs.map(vehicleItemOfRig))
    r.vehicleItemSeller(RIG_SELLER)
    r.itemDescriptionEntries(RIG_CARDS)
    r.authorityReaction(gateLedger)
    r.eventProjections(MINING_GATES_PROJECTIONS)
    r.runEvents(MINING_GATES_RUN_EVENTS)
    r.reportRows(miningGatesReportRows)
    // steampunkDebug.features['mining-gates'].describe(), .gateTableOf(p, seed), .ownsRig(id),
    // .grantRig(id)
    r.debugActions(miningGatesDebugActions)
  },
}
