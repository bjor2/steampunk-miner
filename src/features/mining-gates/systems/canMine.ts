/**
 * #142's `canMine`: the verdict of a cell's gate on the means asking (the drill, a blast, or a
 * power-up's terrain edit), registered as the slice's gate check (feature-slices.md 3.6).
 *
 * | gate            | drill                                   | blast                  | tool    |
 * | --------------- | --------------------------------------- | ---------------------- | ------- |
 * | none (from P7)  | refused below the ordinary floor        | none                   | none    |
 * | dense           | refused below its floor                 | refused (an anchor)    | refused |
 * | drill signature | blocked below its floor (scratch-only)  | none (the kernel cap)  | refused |
 * | rig             | cut with the extractor, else its rule   | refused (an anchor)    | refused |
 * | dynamite        | refused (a sealed shell)                | cut from `minCharge`   | refused |
 *
 * Drill gates read the tip of the last completed major (#180 amendment 2) through the kernel's
 * floors, so a gate opens exactly where `canScratch` does. `required` and `have` are the words of
 * `gate_hit` and the HUD chip: `tip:<major>`, an extractor id or `none`, `size:<n>`.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { hardnessOfTile } from '../../../systems/authority/groundDrill'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { scratchFloorOfCell } from '../../../systems/authority/signatureCells'
import { majorOf } from '../../../systems/economy/upgradeSteps'
import { drillTip } from '../../../systems/economy/vehicleStats'
import type { BigStat } from '../../../systems/money'
import type { GateQuery, GateVerdict } from '../../../systems/registries/gateChecks'
import { carriedSizesOf } from '../../../systems/vehicle/vehicleCharges'
import { canScratch } from '../../../systems/vehicle/drillRule'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { cellGateOf } from './cellGates'
import { GATE_ROWS, type Rig } from './gateRows'
import type { CellGate } from './gateTable'
import { ownsRig } from './rigs'

/** The deepest major `minTipLevelOf` looks at: far past any campaign or endless tier. */
const HIGHEST_MAJOR = 4096

export function canMine(query: GateQuery): GateVerdict | null {
  const params = planetParamsOf(query.state.planet)
  if (params === null) return null
  const gate = cellGateOf(params, query.tile, query.ore)
  if (query.tool !== undefined) return toolVerdictOf(gate, params, query)
  if (query.blast !== null) return blastVerdictOf(gate, params, query, query.blast.size)
  return drillVerdictOf(gate, params, query)
}

function drillVerdictOf(gate: CellGate, params: PlanetParams, query: GateQuery) {
  if (gate.kind === 'rig') return rigVerdictOf(gate.rig, query)
  if (gate.kind === 'dynamite') return shellVerdictOf(gate.minCharge, carriedSizeOf(query))
  if (isScratchable(params, query)) return null
  if (gate.kind === 'none' && !hasGateContent(params)) return null
  return tipVerdictOf(gate.kind === 'drillSignature' ? 'blocked' : 'refused', params, query)
}

function blastVerdictOf(gate: CellGate, params: PlanetParams, query: GateQuery, size: number) {
  if (gate.kind === 'rig') return { ...rigVerdictOf(gate.rig, query), outcome: 'refused' as const }
  if (gate.kind === 'dense') return tipVerdictOf('refused', params, query)
  if (gate.kind !== 'dynamite') return null
  const verdict = shellVerdictOf(gate.minCharge, size)
  return size >= gate.minCharge ? { ...verdict, outcome: 'cut' as const } : verdict
}

/** #142 "Constraints on other systems": a power-up never takes a gated cell, whatever is owned. */
function toolVerdictOf(gate: CellGate, params: PlanetParams, query: GateQuery) {
  if (gate.kind === 'none') return null
  if (gate.kind === 'rig') return { ...rigVerdictOf(gate.rig, query), outcome: 'refused' as const }
  if (gate.kind === 'dynamite') return shellVerdictOf(gate.minCharge, carriedSizeOf(query))
  return tipVerdictOf('refused', params, query)
}

function rigVerdictOf(rig: Rig, { state, playerId }: GateQuery): GateVerdict {
  const isOwned = ownsRig(state, playerId, rig.id)
  return {
    outcome: isOwned ? 'cut' : rig.withoutRig,
    gateKind: 'rig',
    required: rig.id,
    have: isOwned ? rig.id : 'none',
  }
}

function shellVerdictOf(minCharge: number, size: number): GateVerdict {
  return {
    outcome: 'refused',
    gateKind: 'dynamite',
    required: `size:${minCharge}`,
    have: `size:${size}`,
  }
}

function tipVerdictOf(outcome: 'refused' | 'blocked', params: PlanetParams, query: GateQuery) {
  const needed = minTipLevelOf(hardnessOf(params, query), scratchFloorOf(params, query))
  return {
    outcome,
    gateKind: 'drill',
    required: `tip:${needed}`,
    have: `tip:${tipMajorOf(query.state, query.playerId)}`,
  }
}

/** The kernel's own check: the major's tip against the cell's hardness and floor. */
function isScratchable(params: PlanetParams, query: GateQuery): boolean {
  const gateTip = drillTip(tipMajorOf(query.state, query.playerId))
  return canScratch(gateTip, hardnessOf(params, query), scratchFloorOf(params, query))
}

/** The smallest major whose tip scratches the cell, by halving: the floor rises with the major. */
export function minTipLevelOf(hardness: BigStat, floor: BigStat): number {
  let low = 0
  let high = HIGHEST_MAJOR
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (canScratch(drillTip(middle), hardness, floor)) high = middle
    else low = middle + 1
  }
  return low
}

function hasGateContent(params: PlanetParams): boolean {
  return params.planetIndex >= GATE_ROWS.gateContentFromPlanet
}

function tipMajorOf(state: AuthorityState, playerId: string): number {
  return majorOf(vehicleOf(state, playerId).levels.drill_tip)
}

/** The largest charge size the vehicle carries, 0 with none. */
function carriedSizeOf({ state, playerId }: GateQuery): number {
  return Math.max(0, ...carriedSizesOf(vehicleOf(state, playerId).charges))
}

function hardnessOf(params: PlanetParams, { tile, cell }: GateQuery): BigStat {
  return hardnessOfTile(params, tile, cell)
}

function scratchFloorOf(params: PlanetParams, { tile, cell }: GateQuery): BigStat {
  return scratchFloorOfCell(params, tile, cell)
}
