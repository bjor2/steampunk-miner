/**
 * The Ore Lure twist on the ore-shifter (spec #162, "Artefact twists"; ticket 329 as 206c): held,
 * the shifter drags toward a magnet plate you leave on the tunnel wall, not toward the hull, so ore
 * gathers along your way home while you dig elsewhere (G&V: the twist changes *where* the shifter
 * drags to, not how much).
 *
 * - **Leaving the plate.** A use with no plate on this planet, or within the shifter's reach of the
 *   plate, leaves (or moves) the one plate at the miner's tile, for the use's charge. It changes no
 *   cell, so no gate ever blocks it.
 * - **Luring.** A use farther off drags the loose ore in reach of the hull toward the plate: the
 *   same count, the same 32-cell / 64-swap activation cap, the same swaps onto plain ground, and
 *   the same fixed gated, core and anchor cells (`planOreDragTo`); a push (the Mark 3 second tap)
 *   still pushes away from the hull.
 * - **Lifetime.** The plate is for one trip: the owner's dock takes it back, and a plate on another
 *   planet lures nothing.
 *
 * The lane asks the kernel `twist` point (base 0, ceiling 1), so it never imports the artefact
 * slice; the plate's yield counts under the ore-shifter's own income cap.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import { scalarHookValueOf } from '../../../systems/registries/itemHooks'
import type { TilePoint } from '../../../systems/world/tileGrid'
import type { PowerUpOutcome, PowerUpUse } from '../../power-up-core'
import { editWith, type Activate, type Planner } from './editActivation'
import { distanceSqOf } from './editGeometry'
import { ORE_SHIFTER_ID, planOreDrag, planOreDragTo, shifterReachTiles } from './oreShifter'
import { TERRAIN_REFUSAL } from './terrainEvents'
import { terrainToolsOf, withLurePlate, type LurePlate } from './terrainSection'

const DRAG_TO_HULL: Activate = editWith(planOreDrag)

/** The shifter's act: its plain drag, or with the Ore Lure held, leave the plate or drag to it. */
export const dragOrLureOre: Activate = (state, use) =>
  isShifterTwisted(state, use) ? lureOre(state, use) : DRAG_TO_HULL(state, use)

/** The owner's dock takes back the plate: it is for one trip. */
export const ORE_LURE_DOCK_REACTION: AuthorityReaction = {
  id: 'terrain-tools.ore-lure-dock',
  react: (_before, after, heard) =>
    dockedPlayerIdsOf(heard).reduce(
      (effect, playerId) => withPlateTakenBack(effect, playerId),
      unchanged(after),
    ),
}

/** Whether the user holds the shifter's twist: the kernel hook answers 1, or nothing. */
export function isShifterTwisted(state: AuthorityState, use: PowerUpUse): boolean {
  const twist = scalarHookValueOf(state, use.playerId, {
    point: 'twist',
    parentItemId: ORE_SHIFTER_ID,
    ctx: {
      tick: use.tick,
      mark: use.mark,
      magnitude: shifterReachTiles(),
      origin: use.origin,
      candidates: [],
    },
    base: 0,
    ceiling: 1,
  })
  return twist > 0
}

/** The plate on this planet beyond the shifter's reach of the user's tile; null otherwise. */
export function farPlateOf(state: AuthorityState, use: PowerUpUse): TilePoint | null {
  const plate = terrainToolsOf(state, use.playerId).plate
  if (plate?.planetIndex !== state.planet.index) return null
  const reach = shifterReachTiles()
  return distanceSqOf(plate, use.origin) > reach * reach ? { tx: plate.tx, ty: plate.ty } : null
}

function lureOre(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  const plate = farPlateOf(state, use)
  return plate === null ? leavePlate(state, use) : editWith(dragToward(plate))(state, use)
}

function dragToward(plate: TilePoint): Planner {
  return (view, key, pose, verb) => planOreDragTo(view, key, pose, verb, plate)
}

/** The one plate left at the user's tile, moved there if one was left before. */
function leavePlate(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  if (vehicleOf(state, use.playerId).pose === null) {
    return { kind: 'refused', reason: TERRAIN_REFUSAL.outOfPlay }
  }
  const plate: LurePlate = { ...use.origin, planetIndex: state.planet.index }
  return { kind: 'acted', effect: unchanged(withLurePlate(state, use.playerId, plate)) }
}

function dockedPlayerIdsOf(heard: readonly DomainEvent[]): string[] {
  return heard.flatMap((event) =>
    event.type === 'DockEntered' && event.playerId !== undefined ? [event.playerId] : [],
  )
}

function withPlateTakenBack(effect: RuleEffect, playerId: string): RuleEffect {
  if (terrainToolsOf(effect.state, playerId).plate === undefined) return effect
  return { ...effect, state: withLurePlate(effect.state, playerId, null) }
}
