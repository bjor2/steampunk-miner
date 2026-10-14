/**
 * Stabiliser foam (#162 row; the GD default ruling and the HS and VS pins on #381, ticket 381): a
 * consumable sprayed in a forward cone that sets on the cells it lands on and holds the collapse
 * blocks holding them for 600 ticks. It changes no cell, so a foamed cell keeps its hardness and
 * its band's price.
 *
 * - **The cone.** Radius 2 cells at Mark 1, its Mark capped at +2 (`foamCone.ts`). Every cell in
 *   it is set but a gated cell (dynamite, rig or any gate that stands against a tool), the core
 *   and lava, each checked per cell. A cone with none left is refused and costs nothing; so is a
 *   spray by a player who does not own foam (ownership is checked on the spray).
 * - **The brace.** One timed `collapseBraces` provider beside the lode clamp's (#331): each set
 *   cell's block (ring 0), until its foam lapses, while its player owns foam. The kernel folds
 *   foam and clamp claims on one block to the later end, never a sum, and gives the block a fresh
 *   60-tick warning when the last one ends.
 * - **On its planet.** Each cell names the planet it was sprayed on and braces nothing elsewhere,
 *   as block ids repeat from planet to planet.
 * - **Refresh, never stack.** Spraying a cell already set moves its end to 600 ticks from the new
 *   spray; its brace start (for the frozen countdown) stays at the first spray.
 * - **The lapse.** A clock step drops each cell on the tick it lapses, so the brace sync sees the
 *   end on that tick and the section goes back to initial once nothing holds. When a player's last
 *   cell lapses their cooldown counts from that tick (VS pin; a consumable has none today).
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import { entryOfBlock } from '../../../systems/authority/collapse/collapseState'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import type { ClockStep } from '../../../systems/registries/clockSteps'
import type {
  CollapseBraceClaim,
  CollapseBraceProvider,
} from '../../../systems/registries/collapseBraces'
import { tileOfPose, type VehiclePose } from '../../../systems/vehicle/vehiclePose'
import { blockIdOf, blocksTouchingTile } from '../../../systems/world/collapseBlock'
import { isLavaAt } from '../../../systems/world/lavaFlow'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { startCooldownAt, type PowerUpOutcome, type PowerUpUse } from '../../power-up-core'
import { facingStepOf } from './editGeometry'
import { tilesInForwardCone } from './foamCone'
import { fixedBlockOf, openGroundView, type GroundView } from './groundView'
import { magnitudeAt, terrainItemNamed } from './itemMagnitude'
import { frozenTicksLeftOf } from './lodeClamp'
import { foamSetOf, TERRAIN_REFUSAL } from './terrainEvents'
import { balanceOf } from './terrainItems'
import { editSourceOf } from './terrainOutcome'
import { terrainToolsOf, withFoamedCells, type FoamedCell } from './terrainSection'

export const STABILISER_FOAM_ID = 'consumable.stabiliser_foam'

/** The block holding a set cell, and no other (ring 0): the cone itself is foam's reach. */
const BRACE_RING = 0

export const STABILISER_FOAM_BRACES: CollapseBraceProvider = {
  id: 'terrain-tools.stabiliser-foam',
  bracesAt: foamBracesAt,
  frozenTicksLeftAt: foamFrozenTicksLeftAt,
}

export const LAPSE_FOAM_STEP: ClockStep = {
  id: 'terrain-tools.lapse-foam',
  nextTick: nextLapseTickOf,
  run: lapseFoamAt,
}

/** The spray: refused unowned, else foam sets on the cone's cells the miner faces. */
export function sprayFoam(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  if (!ownsItem(state, use.playerId, STABILISER_FOAM_ID))
    return { kind: 'refused', reason: TERRAIN_REFUSAL.notOwned }
  return sprayFromPose(state, use)
}

/** The blocks every owner's foam holds at `tick`, each until its latest cell there lapses. */
export function foamBracesAt(state: AuthorityState, tick: number): CollapseBraceClaim[] {
  const ends = new Map<string, number>()
  for (const cell of ownersCellsOf(state).filter((held) => isHeldHere(state, held, tick))) {
    const block = blockOfCell(cell)
    ends.set(block, Math.max(ends.get(block) ?? cell.untilTick, cell.untilTick))
  }
  return [...ends.keys()].sort().map((block) => ({ block, untilTick: ends.get(block) as number }))
}

/** The braced block's countdown, frozen at the earliest catch of any foam holding it now. */
export function foamFrozenTicksLeftAt(state: AuthorityState, block: string): number | null {
  const entry = entryOfBlock(state.collapse, block)
  if (entry?.isBraced !== true) return null
  const frozen = ownersCellsOf(state)
    .filter((cell) => isHeldHere(state, cell, state.tick) && blockOfCell(cell) === block)
    .map((cell) => frozenTicksLeftOf(entry, { startTick: cell.setTick }))
  return frozen.length === 0 ? null : Math.max(...frozen)
}

/** The cells the player's foam holds now; none without owning foam. */
export function foamedCellsOf(state: AuthorityState, playerId: string): readonly FoamedCell[] {
  if (!ownsItem(state, playerId, STABILISER_FOAM_ID)) return []
  return terrainToolsOf(state, playerId).foam ?? []
}

/** The cells of the cone foam may set on: no gate, core or lava. */
export function foamableCellsOf(view: GroundView, tiles: readonly TilePoint[]): TilePoint[] {
  return tiles.filter(
    (tile) => fixedBlockOf(view, tile) === null && !isLavaAt(view.state.world, view.params, tile),
  )
}

/** The cone's tiles for a spray at `radius` from the pose. */
export function foamConeOf(pose: VehiclePose, radius: number): TilePoint[] {
  return tilesInForwardCone(tileOfPose(pose), facingStepOf(pose), radius)
}

function sprayFromPose(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  const { pose } = vehicleOf(state, use.playerId)
  const view = openGroundView(state, use.playerId, editSourceOf(STABILISER_FOAM_ID))
  if (pose === null || view === null) return { kind: 'refused', reason: TERRAIN_REFUSAL.outOfPlay }
  const cells = foamableCellsOf(view, foamConeOf(pose, coneRadiusOf(use)))
  if (cells.length === 0) return { kind: 'refused', reason: TERRAIN_REFUSAL.nothingToFoam }
  return { kind: 'acted', effect: setFoamOn(state, use, cells) }
}

/** The cone's radius at the use's Mark: Mark 0 sprays as bought. */
function coneRadiusOf(use: PowerUpUse): number {
  return magnitudeAt(terrainItemNamed(STABILISER_FOAM_ID), use.mark)
}

function setFoamOn(state: AuthorityState, use: PowerUpUse, cells: readonly TilePoint[]) {
  const untilTick = use.tick + braceTicksOf()
  const held = terrainToolsOf(state, use.playerId).foam ?? []
  const spray = { planetIndex: state.planet.index, tick: use.tick, untilTick }
  const foam = mergedFoam(held, cells, spray)
  const set = foamSetOf({
    playerId: use.playerId,
    mark: use.mark,
    originTx: use.origin.tx,
    originTy: use.origin.ty,
    cellsSet: cells.length,
    untilTick,
  })
  return { state: withFoamedCells(state, use.playerId, foam), events: [set] }
}

/** One spray: the planet it lands on, its tick, and the tick its foam lapses. */
interface FoamSpray {
  planetIndex: number
  tick: number
  untilTick: number
}

/** The new cells joined to those still holding: one entry per cell, its end moved on. */
function mergedFoam(
  held: readonly FoamedCell[],
  cells: readonly TilePoint[],
  spray: FoamSpray,
): FoamedCell[] {
  const byTile = new Map(held.map((cell) => [keyOf(cell), cell]))
  for (const tile of cells) {
    const known = byTile.get(keyOf(tile))
    const setTick = isRunOn(known, spray) ? (known as FoamedCell).setTick : spray.tick
    const { planetIndex, untilTick } = spray
    byTile.set(keyOf(tile), { tx: tile.tx, ty: tile.ty, planetIndex, setTick, untilTick })
  }
  return [...byTile.values()].sort(compareTiles)
}

/** A cell this spray refreshes keeps its first spray's start: same planet, still holding. */
function isRunOn(known: FoamedCell | undefined, spray: FoamSpray): boolean {
  return known?.planetIndex === spray.planetIndex && isHeldAt(known, spray.tick)
}

/** The next tick any player's foam lapses, or none with none set. */
function nextLapseTickOf(state: AuthorityState): number | null {
  const ends = playerIdsOf(state).flatMap((playerId) =>
    (terrainToolsOf(state, playerId).foam ?? []).map((cell) => cell.untilTick),
  )
  return ends.length === 0 ? null : Math.min(...ends)
}

function lapseFoamAt(state: AuthorityState, tick: number): RuleEffect {
  return chainEffects(
    state,
    playerIdsOf(state).map(
      (playerId) => (current: AuthorityState) => lapsePlayerFoam(current, playerId, tick),
    ),
  )
}

/** The player's lapsed cells go; once none is left their cooldown counts from this tick. */
function lapsePlayerFoam(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const held = terrainToolsOf(state, playerId).foam ?? []
  const left = held.filter((cell) => isHeldAt(cell, tick))
  if (left.length === held.length) return unchanged(state)
  const lapsed = withFoamedCells(state, playerId, left)
  if (left.length > 0) return unchanged(lapsed)
  return unchanged(startCooldownAt(lapsed, playerId, STABILISER_FOAM_ID, tick))
}

function ownersCellsOf(state: AuthorityState): FoamedCell[] {
  return playerIdsOf(state).flatMap((playerId) => [...foamedCellsOf(state, playerId)])
}

/** Holding at `tick` on the planet the state is on: foam left on another planet holds nothing. */
function isHeldHere(state: AuthorityState, cell: FoamedCell, tick: number): boolean {
  return cell.planetIndex === state.planet.index && isHeldAt(cell, tick)
}

function isHeldAt(cell: FoamedCell, tick: number): boolean {
  return cell.setTick <= tick && tick < cell.untilTick
}

function blockOfCell(cell: TilePoint): string {
  return blockIdOf(blocksTouchingTile({ tx: cell.tx, ty: cell.ty }, BRACE_RING)[0])
}

function braceTicksOf(): number {
  const ticks = balanceOf(terrainItemNamed(STABILISER_FOAM_ID)).braceTicks
  if (ticks === undefined) throw new RangeError(`no braceTicks for ${STABILISER_FOAM_ID}`)
  return ticks
}

/** Sorted, so two players' foam resolves in the same order on every machine. */
function playerIdsOf(state: AuthorityState): string[] {
  return Object.keys(state.players).sort()
}

function compareTiles(a: TilePoint, b: TilePoint): number {
  return a.tx - b.tx || a.ty - b.ty
}

function keyOf({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}
