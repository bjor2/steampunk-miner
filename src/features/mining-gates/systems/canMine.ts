/**
 * #142's `canMine`: the verdict of a cell's gate on the means asking (the drill, a blast, or a
 * power-up's terrain edit), registered as the slice's gate check (feature-slices.md 3.6).
 *
 * | gate            | drill                                   | blast                   | tool    |
 * | --------------- | --------------------------------------- | ----------------------- | ------- |
 * | none (from P7)  | refused below the ordinary floor        | none                    | none    |
 * | dense           | refused below its floor                 | refused (an anchor)     | refused |
 * | drill signature | blocked below its floor (scratch-only)  | refused (an anchor)     | refused |
 * | rig             | its extractor's verb, else its rule     | refused (an anchor)     | refused |
 * | dynamite        | refused (blast-only rock); cut slowly   | cut by a type breaking  | refused |
 * |                 | with the blast bit                      | its tier (`breaksGate`) |         |
 *
 * An extractor's verb (tune, capture, mark, pull, tow) is `extractorVerdicts.ts`; the coil's own
 * pull is the one tool an extractor cell lets through.
 *
 * Drill gates read the tip of the last completed major (#180 amendment 2) through the kernel's
 * floors, so a gate opens exactly where `canScratch` does. The drill-tier gates (dense, drill
 * signature) stand against every blast, as the blast's band-5 hardness cap kept them before D4
 * #863 deleted it. `required` and `have` are the words of `gate_hit` and the HUD chip: `tip:<major>`,
 * an extractor id or `none`; for blast-only rock `type:<t>`, the first charge type that breaks its
 * tier, against `owned` when the rack carries a charge that does, else `price:<money>`, that
 * type's smallest size at this planet's dock (D4: never "locked", price is the only gate), and
 * against the blast's own `type:<t>` when a charge asks. Once the player owns the blast bit (D5
 * #864) the drill cuts blast-only rock its tip scratches at `blastBitSpeedBp` of its speed, against
 * `have: blast_bit`, so no `gate_hit` or hint is raised; a charge and a tool are answered as before.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { hardnessOfTile } from '../../../systems/authority/groundDrill'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { scratchFloorOfCell } from '../../../systems/authority/signatureCells'
import {
  chargePrice,
  chargeTypeBreaking,
  chargeTypeOf,
  doesSizeBreakGate,
  smallestSizeBreaking,
} from '../../../systems/economy/chargeSizes'
import { majorOf } from '../../../systems/economy/upgradeSteps'
import { drillTip } from '../../../systems/economy/vehicleStats'
import { toCanonical, type BigStat } from '../../../systems/money'
import type { GateQuery, GateVerdict } from '../../../systems/registries/gateChecks'
import { carriedSizesOf } from '../../../systems/vehicle/vehicleCharges'
import { canScratch } from '../../../systems/vehicle/drillRule'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { ownsBlastBit } from '../../dynamite'
import { cellGateOf } from './cellGates'
import {
  extractorDrillVerdictOf,
  extractorStandingVerdictOf,
  isCoilPull,
} from './extractorVerdicts'
import { GATE_ROWS } from './gateRows'
import type { CellGate } from './gateTable'

/** The deepest major `minTipLevelOf` looks at: far past any campaign or endless tier. */
const HIGHEST_MAJOR = 4096
/** A shell's `have` while the rack carries a charge that opens it. */
const OWNED = 'owned'
/** A shell's `have` while the blast bit grinds it. */
const BLAST_BIT = 'blast_bit'
const ONE_CHARGE = 1

export function canMine(query: GateQuery): GateVerdict | null {
  const params = planetParamsOf(query.state.planet)
  if (params === null) return null
  const gate = cellGateOf(params, query.tile, query.ore)
  if (query.tool !== undefined) return toolVerdictOf(gate, params, query)
  if (query.blast !== null) return blastVerdictOf(gate, params, query, query.blast.size)
  return drillVerdictOf(gate, params, query)
}

function drillVerdictOf(gate: CellGate, params: PlanetParams, query: GateQuery) {
  if (gate.kind === 'rig') return extractorDrillVerdictOf(gate.rig, query)
  if (gate.kind === 'dynamite') return shellDrillVerdictOf(gate.tier, params, query)
  if (isScratchable(params, query)) return null
  if (gate.kind === 'none' && !hasGateContent(params)) return null
  return tipVerdictOf(gate.kind === 'drillSignature' ? 'blocked' : 'refused', params, query)
}

function blastVerdictOf(gate: CellGate, params: PlanetParams, query: GateQuery, size: number) {
  if (gate.kind === 'rig') return extractorStandingVerdictOf(gate.rig, query)
  if (isDrillTierGate(gate)) return tipVerdictOf('refused', params, query)
  if (gate.kind !== 'dynamite') return null
  const verdict = shellVerdictOf(gate.tier, `type:${chargeTypeOf(size)}`)
  return doesSizeBreakGate(size, gate.tier) ? { ...verdict, outcome: 'cut' as const } : verdict
}

/** Blast-only rock: a charge's, or the blast bit's slow cut where the tip scratches the cell. */
function shellDrillVerdictOf(tier: number, params: PlanetParams, query: GateQuery): GateVerdict {
  if (!ownsBlastBit(query.state, query.playerId))
    return shellVerdictOf(tier, standingOf(query, tier))
  if (!isScratchable(params, query)) return tipVerdictOf('refused', params, query)
  return blastBitVerdictOf(tier)
}

function blastBitVerdictOf(tier: number): GateVerdict {
  const slowCut = { outcome: 'cut' as const, drillSpeedBp: GATE_ROWS.blastBitSpeedBp }
  return { ...shellVerdictOf(tier, BLAST_BIT), ...slowCut }
}

/** #142 "Constraints on other systems": a power-up never takes a gated cell, whatever is owned. */
function toolVerdictOf(gate: CellGate, params: PlanetParams, query: GateQuery) {
  if (gate.kind === 'none') return null
  if (gate.kind === 'rig' && isCoilPull(gate.rig, query)) return null
  if (gate.kind === 'rig') return extractorStandingVerdictOf(gate.rig, query)
  if (gate.kind === 'dynamite') return shellVerdictOf(gate.tier, standingOf(query, gate.tier))
  return tipVerdictOf('refused', params, query)
}

function shellVerdictOf(tier: number, have: string): GateVerdict {
  return {
    outcome: 'refused',
    gateKind: 'dynamite',
    required: `type:${chargeTypeBreaking(tier)}`,
    have,
  }
}

/** Dense cells and drill-gated signatures: gates the tip keys, never a blast. */
function isDrillTierGate(gate: CellGate): boolean {
  return gate.kind === 'dense' || gate.kind === 'drillSignature'
}

/** `owned` when the rack carries a charge that breaks `tier`, else that charge's dock price here. */
function standingOf(query: GateQuery, tier: number): string {
  return isBreakerCarried(query, tier) ? OWNED : dockPriceWordOf(query.state, tier)
}

function isBreakerCarried({ state, playerId }: GateQuery, tier: number): boolean {
  const carried = carriedSizesOf(vehicleOf(state, playerId).charges)
  return carried.some((size) => doesSizeBreakGate(size, tier))
}

/** `price:<money>`: one charge of the smallest size whose type breaks `tier`, bought here. */
function dockPriceWordOf(state: AuthorityState, tier: number): string {
  const size = smallestSizeBreaking(tier)
  return `price:${toCanonical(chargePrice(size, ONE_CHARGE, state.planet.index))}`
}

function tipVerdictOf(outcome: 'refused' | 'blocked', params: PlanetParams, query: GateQuery) {
  const needed = minTipMajorOfCell(params, query.tile, query.cell)
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

/** The smallest major whose tip scratches the cell at `tile`: where its drill gate opens. */
export function minTipMajorOfCell(params: PlanetParams, tile: TilePoint, cell: number): number {
  return minTipLevelOf(hardnessOfTile(params, tile, cell), scratchFloorOfCell(params, tile, cell))
}

/** From `gateContentFromPlanet` (P7) an ordinary ore cell the tip cannot scratch is refused too. */
export function hasGateContent(params: PlanetParams): boolean {
  return params.planetIndex >= GATE_ROWS.gateContentFromPlanet
}

function tipMajorOf(state: AuthorityState, playerId: string): number {
  return majorOf(vehicleOf(state, playerId).levels.drill_tip)
}

function hardnessOf(params: PlanetParams, { tile, cell }: GateQuery): BigStat {
  return hardnessOfTile(params, tile, cell)
}

function scratchFloorOf(params: PlanetParams, { tile, cell }: GateQuery): BigStat {
  return scratchFloorOfCell(params, tile, cell)
}
