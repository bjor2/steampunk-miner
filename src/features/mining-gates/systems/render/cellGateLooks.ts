/**
 * The mining gates in the ground (tickets 298 and 299): the slice's `cellGateLook`, the gate each
 * ore cell shows to the kernel's terrain gate channel, as #238's lock-marker model draws it. A cell
 * carries the kernel pattern of its marker (`gatePatterns.ts`):
 *
 * | gate                       | pattern                                  | opens at              |
 * | -------------------------- | ---------------------------------------- | --------------------- |
 * | dense or drill signature   | `hard_rim`, glinting once open           | its minimum tip major |
 * | ordinary, from P7          | `bare_rim`, gone once open               | its minimum tip major |
 * | extractor                  | the extractor's own surface motion       | never by the tip      |
 * | dynamite                   | `cracked_shell`                          | never by the tip      |
 *
 * The opening major is the one `canMine` asks for (`minTipMajorOfCell`), and the shader compares
 * it with the local player's major, so a rim opens in the ground exactly where the gate does and
 * a tip buy rebuilds no chunk. It reads the planet and the cell only, never a player, so every
 * miner sees a gate before owning its tool (Horizontal's guard: the pattern names a look, never an
 * extractor's name or icon). Each gated cell is `locked`: the extractors' work (tuned, etched)
 * lives in the slice's per-player state, which the cell's look does not read.
 *
 * The planet's tint is its act's marker tint (#151), carried by one uniform, never by the cell.
 */
import type { CellGateLookProvider } from '../../../../systems/registries/cellGateLook'
import { resourceTierOf } from '../../../../systems/authority/minedOre'
import { oreTypeOf, type OreType } from '../../../../systems/registries/oreTypes'
import { GATE_STATE, type CellGateLook } from '../../../../systems/render/cellGateBits'
import {
  gateKindOfPattern,
  GATE_PATTERNS,
  type GatePattern,
} from '../../../../systems/render/gatePatterns'
import { rgbOfHex, type Rgb } from '../../../../systems/render/colour'
import { bandOfTile } from '../../../../systems/world/planetGeometry'
import type { PlanetParams } from '../../../../systems/world/planetParams'
import type { TilePoint } from '../../../../systems/world/tileGrid'
import { CELL_KIND, familyOfCell, kindOfCell } from '../../../../systems/world/worldCell'
import { hasGateContent, minTipMajorOfCell } from '../canMine'
import { cellGateOf } from '../cellGates'
import type { CellGate } from '../gateTable'
import { motionSignatureOf } from './lockMarkers'
import { actMarkerTintOf } from './markerTints'

export const CELL_GATE_LOOK_ID = 'mining-gates.cell-gate-look'

/** Above the highest band, so a cell and its band make one key. */
const BAND_SLOTS = 8

/**
 * The looks the last planet asked has answered, by cell and band: a gate is a pure function of
 * the two (#142), and a chunk repeats a handful of ore cells, so a rebuild asks the gate table
 * once per kind of cell, not once per tile, and allocates nothing for the rest.
 */
const kept: { params: PlanetParams | null; looks: Map<number, CellGateLook | null> } = {
  params: null,
  looks: new Map(),
}

/** The gate the ore at `tile` shows in the ground, or null for rock, air or an ungated cell. */
export function cellGateLookOf(
  params: PlanetParams,
  cell: number,
  tile: TilePoint,
): CellGateLook | null {
  if (kindOfCell(cell) !== CELL_KIND.ore) return null
  const key = cell * BAND_SLOTS + bandOfTile(params, tile.tx, tile.ty)
  const looks = keptLooksOf(params)
  const known = looks.get(key)
  if (known !== undefined) return known
  const look = lookOfOreCell(params, cell, tile)
  looks.set(key, look)
  return look
}

/** The planet's marker tint, or null for an act the palette does not name. */
export function markerTintOf(params: PlanetParams): Rgb | null {
  const tint = actMarkerTintOf(params.planetIndex)
  return tint === null ? null : rgbOfHex(tint)
}

export const CELL_GATE_LOOK: CellGateLookProvider = {
  id: CELL_GATE_LOOK_ID,
  cellGateLookOf,
  markerTintOf,
}

/** The kernel pattern of a gate's marker; an extractor motion the kernel does not draw is refused. */
export function gatePatternOf(gate: CellGate): GatePattern {
  if (gate.kind === 'dynamite') return 'cracked_shell'
  if (gate.kind === 'rig') return motionPatternOf(gate.rig.id)
  return gate.kind === 'none' ? 'bare_rim' : 'hard_rim'
}

function motionPatternOf(rigId: string): GatePattern {
  const motion = motionSignatureOf(rigId)
  const pattern = GATE_PATTERNS.find((known) => known === motion)
  if (pattern === undefined)
    throw new Error(`the terrain draws no pattern "${motion}" for ${rigId}`)
  return pattern
}

function keptLooksOf(params: PlanetParams): Map<number, CellGateLook | null> {
  if (kept.params === params) return kept.looks
  kept.params = params
  kept.looks = new Map()
  return kept.looks
}

function lookOfOreCell(params: PlanetParams, cell: number, tile: TilePoint): CellGateLook | null {
  const gate = cellGateOf(params, tile, oreOfCell(params, cell))
  if (gate.kind === 'none') return ordinaryRimOf(params, cell, tile)
  const look = { kind: gateKindOfPattern(gatePatternOf(gate)), state: GATE_STATE.locked }
  if (!isDrillGate(gate)) return look
  return { ...look, opensAtTipMajor: minTipMajorOfCell(params, tile, cell) }
}

function isDrillGate(gate: CellGate): boolean {
  return gate.kind === 'dense' || gate.kind === 'drillSignature'
}

/** From P7 an ordinary ore cell wears a bare rim until the tip scratches it; open at once, none. */
function ordinaryRimOf(params: PlanetParams, cell: number, tile: TilePoint): CellGateLook | null {
  if (!hasGateContent(params)) return null
  const opensAtTipMajor = minTipMajorOfCell(params, tile, cell)
  if (opensAtTipMajor === 0) return null
  return { kind: gateKindOfPattern('bare_rim'), state: GATE_STATE.locked, opensAtTipMajor }
}

function oreOfCell(params: PlanetParams, cell: number): OreType {
  return oreTypeOf({ tier: resourceTierOf(params, cell), cellFamily: familyOfCell(cell) })
}
