/**
 * The mining-gates slice's registration (#142, ticket 236): no side effects at import; the loader
 * calls `register`.
 *
 * It registers #142's `canMine` as the gate check the drill, the blast and power-up terrain edits
 * ask, names each ore cell's drill class (dense, drill-gated signature, ordinary) so the kernel's
 * scratch floor reads it, and adds the five extractors as `vehicle-item` rows, so the kernel's
 * loadout can own them (a store buy or a grant). Gate content starts on planet 7 (GD lock on #148).
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { canMine } from './systems/canMine'
import { miningGatesDrillClass } from './systems/drillClass'
import { GATE_ROWS } from './systems/gateRows'
import { vehicleItemOfRig } from './systems/rigs'

export const MINING_GATES_GATE_CHECK_ID = 'mining-gates.can-mine'

export const slice: SliceDefinition = {
  id: 'mining-gates',
  register(r) {
    r.gateCheck({ id: MINING_GATES_GATE_CHECK_ID, check: canMine })
    r.oreDrillClass(miningGatesDrillClass)
    r.content('vehicle-item', GATE_ROWS.rigs.map(vehicleItemOfRig))
  },
}
