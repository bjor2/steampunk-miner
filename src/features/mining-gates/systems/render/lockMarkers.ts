/**
 * #142's `lockMarkerOf`: the lock marker an ore cell wears before contact (ticket 238), so the
 * player sees that it is locked before trying to dig it (#151 "Gated ores show why").
 *
 * | gate                       | marker                                                        |
 * | -------------------------- | ------------------------------------------------------------- |
 * | dense or drill signature   | `hard_rim`, `hard_rim_open` once the last major's tip cuts it |
 * | ordinary, from P7          | `hard_rim` only while the tip cannot scratch it               |
 * | extractor                  | `motion`: the extractor's slow surface signature              |
 * | dynamite                   | `cracked_shell`                                               |
 *
 * The drill markers ask `canMine` itself, so a rim opens exactly where the gate does. A signature
 * cell's marker carries its act's rim tint (#151 per-theme palette), else no tint. Render-only: it
 * reads the authority state and writes nothing.
 */
import type { AuthorityState } from '../../../../systems/authority/authorityState'
import { resourceTierOf } from '../../../../systems/authority/minedOre'
import { planetParamsOf } from '../../../../systems/authority/planetOfState'
import { oreTypeOf, type OreType } from '../../../../systems/registries/oreTypes'
import type { PlanetParams } from '../../../../systems/world/planetParams'
import type { TilePoint } from '../../../../systems/world/tileGrid'
import { CELL_KIND, familyOfCell, kindOfCell } from '../../../../systems/world/worldCell'
import { materialCellAt } from '../../../../systems/world/worldState'
import LOCK_MARKERS_FILE from '../../lockMarkers.json'
import { canMine } from '../canMine'
import { cellGateOf } from '../cellGates'
import type { CellGate } from '../gateTable'
import { signatureTintOf } from './markerTints'

export type LockMarkerKind = 'none' | 'hard_rim' | 'hard_rim_open' | 'cracked_shell' | 'motion'

export interface LockMarker {
  kind: LockMarkerKind
  /** The extractor's surface motion (#142's table); set exactly when `kind` is `motion`. */
  motion: string | null
  /** The act's rim tint, `#rrggbb`, on a signature cell's marker; else null. */
  tint: string | null
}

/** A drill gate's ask: the cell, the ore it holds, and who asks. */
interface DrillAsk {
  state: AuthorityState
  playerId: string
  params: PlanetParams
  tile: TilePoint
  cell: number
  ore: OreType
}

const NO_MARKER: LockMarker = { kind: 'none', motion: null, tint: null }

const MOTION_SIGNATURES: Readonly<Record<string, string>> = LOCK_MARKERS_FILE.motionSignatures

/** The marker the ore at `tile` wears for this player; `none` for rock, air or an open cell. */
export function lockMarkerOf(state: AuthorityState, playerId: string, tile: TilePoint): LockMarker {
  const ask = drillAskOf(state, playerId, tile)
  if (ask === null) return NO_MARKER
  return markerOfGate(cellGateOf(ask.params, tile, ask.ore), ask)
}

/** The surface motion of an extractor's cells, or null for an id with none. */
export function motionSignatureOf(rigId: string): string | null {
  return MOTION_SIGNATURES[rigId] ?? null
}

function drillAskOf(state: AuthorityState, playerId: string, tile: TilePoint): DrillAsk | null {
  const params = planetParamsOf(state.planet)
  if (params === null) return null
  const cell = materialCellAt(state.world, params, tile)
  if (kindOfCell(cell) !== CELL_KIND.ore) return null
  const ore = oreTypeOf({ tier: resourceTierOf(params, cell), cellFamily: familyOfCell(cell) })
  return { state, playerId, params, tile, cell, ore }
}

function markerKindOf(gate: CellGate, ask: DrillAsk): LockMarkerKind {
  if (gate.kind === 'rig') return 'motion'
  if (gate.kind === 'dynamite') return 'cracked_shell'
  const isCut = isCutByDrill(ask)
  if (gate.kind === 'none') return isCut ? 'none' : 'hard_rim'
  return isCut ? 'hard_rim_open' : 'hard_rim'
}

function markerOfGate(gate: CellGate, ask: DrillAsk): LockMarker {
  const kind = markerKindOf(gate, ask)
  if (kind === 'none') return NO_MARKER
  return {
    kind,
    motion: gate.kind === 'rig' ? motionSignatureOf(gate.rig.id) : null,
    tint:
      ask.ore.signature === true ? signatureTintOf(ask.params.planetIndex, ask.ore.family) : null,
  }
}

/** Whether the drill cuts the cell now: no gate opinion, or a `cut`. */
function isCutByDrill({ state, playerId, tile, cell, ore }: DrillAsk): boolean {
  const verdict = canMine({ state, playerId, tile, cell, ore, blast: null })
  return verdict === null || verdict.outcome === 'cut'
}
