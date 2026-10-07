/**
 * The mining gates in the ground (ticket 298): the slice's `cellGateLook`, the gate each ore cell
 * shows to the kernel's terrain shader, built on #238's lock-marker model. A cell carries the kind
 * of its marker pattern (`terrainKinds` in lockMarkers.json): the hard rim for the drill gates, the
 * cracked shell for dynamite, each extractor's surface motion for its own. It reads the planet and
 * the cell only, never a player, so every miner sees a gate before owning its tool (Horizontal's
 * guard: the kind names a pattern, never an extractor's name or icon) and a chunk is rebuilt only
 * when its cells change. Each gated cell is `locked` for now; the rim opening with the tip waits on
 * a tip uniform, and the final patterns on #299.
 *
 * The planet's tint is its act's marker tint (#151), carried by one uniform, never by the cell.
 */
import type { CellGateLookProvider } from '../../../../systems/registries/cellGateLook'
import { resourceTierOf } from '../../../../systems/authority/minedOre'
import { oreTypeOf, type OreType } from '../../../../systems/registries/oreTypes'
import { GATE_STATE, type CellGateLook } from '../../../../systems/render/cellGateBits'
import { rgbOfHex, type Rgb } from '../../../../systems/render/colour'
import { bandOfTile } from '../../../../systems/world/planetGeometry'
import type { PlanetParams } from '../../../../systems/world/planetParams'
import type { TilePoint } from '../../../../systems/world/tileGrid'
import { CELL_KIND, familyOfCell, kindOfCell } from '../../../../systems/world/worldCell'
import LOCK_MARKERS_FILE from '../../lockMarkers.json'
import { cellGateOf } from '../cellGates'
import type { CellGate } from '../gateTable'
import { motionSignatureOf } from './lockMarkers'
import { actMarkerTintOf } from './markerTints'

/** The number of each marker pattern in the cell's kind bits. */
export const TERRAIN_KINDS: Readonly<Record<string, number>> = LOCK_MARKERS_FILE.terrainKinds

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

/** The pattern number of a gate's marker; a pattern lockMarkers.json does not number is refused. */
export function terrainKindOf(gate: CellGate): number {
  const pattern = patternOf(gate)
  const kind = TERRAIN_KINDS[pattern]
  if (kind === undefined) throw new Error(`lockMarkers.json numbers no terrain kind "${pattern}"`)
  return kind
}

function patternOf(gate: CellGate): string {
  if (gate.kind === 'dynamite') return 'cracked_shell'
  if (gate.kind === 'rig') return motionSignatureOf(gate.rig.id) ?? gate.rig.id
  return 'hard_rim'
}

function keptLooksOf(params: PlanetParams): Map<number, CellGateLook | null> {
  if (kept.params === params) return kept.looks
  kept.params = params
  kept.looks = new Map()
  return kept.looks
}

function lookOfOreCell(params: PlanetParams, cell: number, tile: TilePoint): CellGateLook | null {
  const gate = cellGateOf(params, tile, oreOfCell(params, cell))
  if (gate.kind === 'none') return null
  return { kind: terrainKindOf(gate), state: GATE_STATE.locked }
}

function oreOfCell(params: PlanetParams, cell: number): OreType {
  return oreTypeOf({ tier: resourceTierOf(params, cell), cellFamily: familyOfCell(cell) })
}
