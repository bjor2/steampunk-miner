/**
 * How one use of a terrain tool acts (the GD lock on #256): plain, or as the Mark milestone it
 * follows with (a second tap or a hold), and at its own Mark's size or, fired by a sibling-link, at
 * the link's reduced size. Every tool here is an income item, so a second tap and a hold change
 * only where or how it works, never its size, cap, cooldown or charges; the link is its one yield
 * step (`terrainMilestones.ts`). A verb that works on one side of the miner works on the side it
 * steers toward, the kernel's one faced side (`facedSideOf`, the TD lock on #276): it reads the
 * side cutters' latch, never writes it, and with no latch the facing the use started on.
 */
import type { BoreSide } from '../../../systems/economy/drillGearCaps'
import { NO_DRIVE } from '../../../systems/vehicle/driveSigns'
import { facedSideOf, sideSeedOf, type FacedSideMemory } from '../../../systems/vehicle/facedSide'
import type { VehiclePose } from '../../../systems/vehicle/vehiclePose'
import type { FollowUpPattern, PowerUpUse } from '../../power-up-core'
import type { EditKey } from './editSeed'
import { magnitudeAt } from './itemMagnitude'
import type { TerrainItem } from './terrainItems'

export interface ToolVerb {
  /** The follow-up this use is; null for a plain use. */
  milestone: FollowUpPattern | null
  /** The size a sibling-link fired the tool at (power-up-core halves it); null for its own. */
  linkedSize: number | null
  /** The side of the bore the miner steers toward, for a verb that works on one side. */
  facedSide: BoreSide
}

export const PLAIN_VERB: ToolVerb = { milestone: null, linkedSize: null, facedSide: 'right' }

/** What the verb reads of the miner: its pose and the faced side the drill cut latched. */
export interface UsingMiner extends FacedSideMemory {
  pose: VehiclePose | null
}

export function toolVerbOf(use: PowerUpUse, miner: UsingMiner): ToolVerb {
  return {
    milestone: use.milestone ?? null,
    linkedSize: use.linkedFrom === undefined ? null : (use.magnitude ?? 0),
    facedSide: facedSideOfMiner(miner),
  }
}

/** A use carries no drive, so the seed is the facing it started on. */
function facedSideOfMiner(miner: UsingMiner): BoreSide {
  if (miner.pose === null) return PLAIN_VERB.facedSide
  return facedSideOf(miner, miner.pose, NO_DRIVE, sideSeedOf(miner.pose))
}

export function isSecondTap(verb: ToolVerb): boolean {
  return verb.milestone === 'second-tap'
}

export function isHold(verb: ToolVerb): boolean {
  return verb.milestone === 'hold'
}

/** The size the tool works at: its Mark's, or the link's. */
export function sizeOf(item: TerrainItem, key: EditKey, verb: ToolVerb): number {
  return verb.linkedSize ?? magnitudeAt(item, key.mark)
}
