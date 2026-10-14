/**
 * The magnet fields to draw now (GD lock on #246 build 5, the GD and TD rulings on #286), read from
 * the authority state and from what the layer heard:
 *
 * - **attract**: a lodestone beacon planted on this planet draws faint while it waits for its
 *   owner's dock; the gather it queues there draws bright (`heardMagnetFields.ts`) and goes once
 *   its swaps have landed. A spent beacon draws nothing.
 * - **repel**: each repulsor wave the layer heard, a ring opening from the coil (heard).
 * - **anchor**: a held lode clamp field, while its owner owns the clamp: a lattice over each pinned
 *   cell and a strut on each collapse block it braces now (`clampLatticeOf`).
 *
 * Only an owned item that is planted or acting draws, so a player who owns no magnet draws none,
 * on a magnetic planet too. The local player's fields come first, then every other player's,
 * nearest the view first, as the layer's fixed cap takes them. Presentation only: nothing here
 * writes the authority state.
 */
import type { AuthorityState } from '../../../../systems/authority/authorityState'
import { ownsItem } from '../../../../systems/authority/loadoutRules'
import { planetParamsOf } from '../../../../systems/authority/planetOfState'
import type { MetrePoint } from '../../../../systems/render/gunLook'
import { blockOfId, type CollapseBlock } from '../../../../systems/world/collapseBlock'
import type { TilePoint } from '../../../../systems/world/tileGrid'
import { clampLatticeOf } from '../clampLattice'
import { magnitudeAt, terrainItemNamed } from '../itemMagnitude'
import { LODE_CLAMP_ID } from '../lodeClamp'
import { LODESTONE_BEACON_ID } from '../lodestoneBeacon'
import { terrainToolsOf, type LodestoneBeacon } from '../terrainSection'
import { MAGNET_FIELD_LOOK, type MagnetFieldLook } from './magnetFieldLook'

/** A field that has not brightened or will not end yet. */
export const NEVER_TICK = Number.MAX_SAFE_INTEGER

export type MagnetFieldKind = 'attract' | 'repel' | 'anchor'

/** When a field shows, in authority ticks. */
export interface MagnetFieldTiming {
  startTick: number
  /** It opens from its centre over this many ticks; 0 draws it whole at once. */
  growTicks: number
  /** It ramps from its faint to its bright light from this tick, over the look's `rampTicks`. */
  brightFromTick: number
  /** It has faded out by this tick. */
  endTick: number
}

interface FieldOfPlayer {
  playerId: string
  timing: MagnetFieldTiming
}

/** A beacon's converging arcs or a coil's ring and flares, round a centre in planet metres. */
export interface RoundField extends FieldOfPlayer {
  kind: 'attract' | 'repel'
  centre: MetrePoint
  radiusM: number
}

/** A held clamp: the cells it pins and the collapse blocks it braces now. */
export interface AnchorField extends FieldOfPlayer {
  kind: 'anchor'
  cells: readonly TilePoint[]
  blocks: readonly CollapseBlock[]
}

export type MagnetField = RoundField | AnchorField

/** Every field to draw, the local player's first, then the others nearest `view` first. */
export function magnetFieldsOf(
  state: AuthorityState,
  heard: readonly MagnetField[],
  localPlayerId: string,
  view: MetrePoint,
): MagnetField[] {
  const fields = [...standingMagnetFieldsOf(state), ...heard]
  return orderedForDrawing(fields, localPlayerId, view)
}

/** The fields the authority state holds: waiting beacons on this planet and held clamps. */
export function standingMagnetFieldsOf(state: AuthorityState): MagnetField[] {
  return Object.keys(state.players)
    .sort()
    .flatMap((playerId) => [waitingBeaconOf(state, playerId), heldClampOf(state, playerId)])
    .filter((field): field is MagnetField => field !== null)
}

/** How many pieces the field draws: arcs, ring and flares, lattices and struts. */
export function piecesOfField(field: MagnetField, look: MagnetFieldLook = MAGNET_FIELD_LOOK) {
  if (field.kind === 'anchor') return field.cells.length + field.blocks.length
  return field.kind === 'attract' ? look.attract.arcs : 1 + look.repel.flares
}

/** Where a field sits, for the nearest-first order: its centre, or a clamp's first pinned cell. */
export function centreOfField(field: MagnetField): MetrePoint {
  if (field.kind !== 'anchor') return field.centre
  const first = field.cells[0] ?? { tx: 0, ty: 0 }
  return tileCentreOf(first)
}

export function tileCentreOf(tile: TilePoint): MetrePoint {
  return { x: tile.tx + 0.5, y: tile.ty + 0.5 }
}

/** The beacon's gather radius at its Mark, metres (a tile is a metre). */
export function gatherRadiusAt(mark: number): number {
  return magnitudeAt(terrainItemNamed(LODESTONE_BEACON_ID), mark)
}

function waitingBeaconOf(state: AuthorityState, playerId: string): RoundField | null {
  const { beacon } = terrainToolsOf(state, playerId)
  if (beacon === null || !isOnThisPlanet(state, beacon)) return null
  return {
    kind: 'attract',
    playerId,
    centre: tileCentreOf(beacon),
    radiusM: gatherRadiusAt(beacon.mark),
    timing: {
      startTick: beacon.plantedTick,
      growTicks: 0,
      brightFromTick: NEVER_TICK,
      endTick: NEVER_TICK,
    },
  }
}

function isOnThisPlanet(state: AuthorityState, beacon: LodestoneBeacon): boolean {
  return planetParamsOf(state.planet)?.planetIndex === beacon.planetIndex
}

function heldClampOf(state: AuthorityState, playerId: string): AnchorField | null {
  const { clamp } = terrainToolsOf(state, playerId)
  if (clamp === undefined || !ownsItem(state, playerId, LODE_CLAMP_ID)) return null
  return {
    kind: 'anchor',
    playerId,
    cells: clamp.cells,
    blocks: bracedBlocksNowOf(state, playerId),
    timing: {
      startTick: clamp.startTick,
      growTicks: 0,
      brightFromTick: clamp.startTick,
      endTick: clamp.finishTick,
    },
  }
}

function bracedBlocksNowOf(state: AuthorityState, playerId: string): CollapseBlock[] {
  return clampLatticeOf(state, playerId)
    .map((entry) => blockOfId(entry.block))
    .filter((block): block is CollapseBlock => block !== null)
}

function orderedForDrawing(
  fields: readonly MagnetField[],
  localPlayerId: string,
  view: MetrePoint,
): MagnetField[] {
  const own = fields.filter((field) => field.playerId === localPlayerId)
  const others = fields.filter((field) => field.playerId !== localPlayerId)
  return [...own, ...others.sort((a, b) => compareNearest(a, b, view))]
}

function compareNearest(a: MagnetField, b: MagnetField, view: MetrePoint): number {
  const nearer = distanceSqOf(centreOfField(a), view) - distanceSqOf(centreOfField(b), view)
  return nearer !== 0 ? nearer : a.playerId.localeCompare(b.playerId)
}

function distanceSqOf(a: MetrePoint, b: MetrePoint): number {
  return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)
}
