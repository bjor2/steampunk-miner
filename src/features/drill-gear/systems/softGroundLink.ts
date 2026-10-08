/**
 * The vibratory bit's Mark 3 sibling-link (#256, an always-on item's one milestone), re-keyed by
 * the GD ruling and the TD pin on #276: a drill command whose cut took at least one cell of the
 * bit's soft ground (`isSoftGroundCell`) fires the slotted sampling corer at half reach from the
 * bit, on the corer's own charge (power-up-core's `fireSiblingLinkAt`).
 *
 * It fires at most once per drill command, whatever the cells it crossed, so it never scales with
 * speed, cells or substeps. The link starts the corer's own cooldown at its current Mark, in
 * authority ticks, and a corer still cooling never fires; every Mark of the corer cools for at
 * least a tick, so a second drill command in the same tick fires nothing.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import { tileOfPose } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { fireSiblingLinkAt, type LinkMoment } from '../../power-up-core'
import {
  isSoftGroundCell,
  VIBRATORY_BIT_ID,
  workingBitOf,
  type WorkingBit,
} from './vibratoryCrumble'

export const SOFT_GROUND_LINK_REACTION: AuthorityReaction = {
  id: 'drill-gear.soft-ground-link',
  react: fireLinkOnSoftCut,
}

function fireLinkOnSoftCut(
  before: AuthorityState,
  after: AuthorityState,
  heard: readonly DomainEvent[],
): RuleEffect {
  const bit = workingBitOf(after, heard)
  if (bit === null || !hasCutSoftGround(before, bit, heard)) return unchanged(after)
  return fireSiblingLinkAt(after, linkMomentOf(bit))
}

/** Whether the drill cut a cell that was the bit's soft ground before the command. */
function hasCutSoftGround(
  before: AuthorityState,
  bit: WorkingBit,
  heard: readonly DomainEvent[],
): boolean {
  return drilledGroundOf(heard).some((tile) => isSoftGroundCell(before, bit, tile))
}

/** The plain ground cells the drill itself yielded: not a blast's or a bore gun's. */
function drilledGroundOf(heard: readonly DomainEvent[]): TilePoint[] {
  return heard.flatMap((event) =>
    event.type === 'TileDestroyed' && event.kind === 'ground' && event.cause === undefined
      ? [{ tx: event.tx, ty: event.ty }]
      : [],
  )
}

function linkMomentOf(bit: WorkingBit): LinkMoment {
  return {
    playerId: bit.playerId,
    itemId: VIBRATORY_BIT_ID,
    tick: bit.tick,
    origin: tileOfPose(bit.pose),
  }
}
