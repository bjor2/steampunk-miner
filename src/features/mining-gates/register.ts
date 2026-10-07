/**
 * The mining-gates slice's registration (#142, ticket 236): no side effects at import; the loader
 * calls `register`.
 *
 * It registers #142's `canMine` as the gate check the drill, the blast and power-up terrain edits
 * ask, names each ore cell's drill class (dense, drill-gated signature, ordinary) so the kernel's
 * scratch floor reads it, and adds the five extractors as `vehicle-item` rows, so the kernel's
 * loadout can own them, sold at the Upgrade bay from each one's planet with its card once its node
 * is researched (ticket 248), or granted. Each owned extractor works its verb (ticket 237):
 * the reaction starts it from the drill's touch or a freed cell, the clock rings a tune and acts a
 * pull, the recharge refills canisters and marks, and the section keeps it across a save. Its
 * ledger logs every gated cell freed or lost, and the balance and session reports print each
 * planet's gate hits, clears and losses. A stopped cell sounds its gate kind and shows its ledger
 * line on the HUD chip once per dive (ticket 238).
 * Gate content starts on planet 7 (GD lock on #148).
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { miningGatesDebugActions } from './debug'
import { miningGatesReportRows } from './gateReportRows'
import { MINING_GATES_PROJECTIONS, MINING_GATES_RUN_EVENTS } from './logging'
import { REFILL_EXTRACTORS_SERVICE } from './systems/captureAndTow'
import { canMine } from './systems/canMine'
import { miningGatesDrillClass } from './systems/drillClass'
import { EXTRACTOR_CLOCK_STEP } from './systems/extractorClock'
import { extractorVerbs } from './systems/extractorReaction'
import { EXTRACTOR_SECTION } from './systems/extractorState'
import { GATE_ROWS } from './systems/gateRows'
import { gateLedger } from './systems/gateLedger'
import { GATE_SOUNDS } from './systems/render/gateSounds'
import { RIG_CARDS, RIG_SELLER } from './systems/rigSales'
import { vehicleItemOfRig } from './systems/rigs'
import { GateHintChip } from './ui/GateHintChip'

export const MINING_GATES_GATE_CHECK_ID = 'mining-gates.can-mine'

export const slice: SliceDefinition = {
  id: 'mining-gates',
  register(r) {
    r.gateCheck({ id: MINING_GATES_GATE_CHECK_ID, check: canMine })
    r.oreDrillClass(miningGatesDrillClass)
    r.content('vehicle-item', GATE_ROWS.rigs.map(vehicleItemOfRig))
    r.vehicleItemSeller(RIG_SELLER)
    r.itemDescriptionEntries(RIG_CARDS)
    r.saveSection(EXTRACTOR_SECTION)
    r.authorityReaction(gateLedger)
    r.authorityReaction(extractorVerbs)
    r.clockStep(EXTRACTOR_CLOCK_STEP)
    r.dockService(REFILL_EXTRACTORS_SERVICE)
    r.eventProjections(MINING_GATES_PROJECTIONS)
    r.runEvents(MINING_GATES_RUN_EVENTS)
    r.reportRows(miningGatesReportRows)
    // A sound per gate kind at contact, and the flourish of a freed cell (ticket 238).
    GATE_SOUNDS.cues.forEach((cue) => r.soundCue(cue))
    // The ledger line of a stopped cell, once per cell per dive (ticket 238).
    r.hudPanel({ id: 'mining-gates.hint-chip', slot: 'prompts', Panel: GateHintChip })
    // steampunkDebug.features['mining-gates'].describe(), .gateTableOf(p, seed),
    // .dynamiteCellsOf(p, seeds), .ownsRig(id), .grantRig(id), .lockMarkerAt(tx, ty), .hintChip()
    r.debugActions(miningGatesDebugActions)
  },
}
