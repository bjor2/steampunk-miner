/**
 * The side cutters' Mark 3 hold (the GD ruling and TD lock on #276): held after switching them on,
 * the cutters cut only the side the player steers toward. The kernel's drill gear read takes the
 * ask with `sideAim: 'drive'` and latches the faced side per cell (`facedSide.ts`); this module
 * keeps what the slice must remember between drill commands: that the hold is on, and its seed,
 * the facing the hold started on when it pointed left or right (the `drill-gear` player section
 * v1, absent until the first hold, so the digest is unchanged until then).
 *
 * A plain press that switches them on again cuts both sides; a press that switches them off leaves
 * the hold remembered but unread, since the ask is made only while they are on. The hold answers
 * only at the hold's Mark, so any other press asks both sides as before. No planet gates it: the
 * `side_drills` row (P13) is the cutters' price anchor only (GD lock on #308, ticket 624).
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged } from '../../../systems/authority/commandRule'
import { isJsonObject } from '../../../systems/authority/payloadFields'
import {
  readSection,
  withSection,
  type SaveSection,
} from '../../../systems/registries/saveSections'
import { isDriveSigns, NO_DRIVE, type DriveSigns } from '../../../systems/vehicle/driveSigns'
import { sideSeedOf } from '../../../systems/vehicle/facedSide'
import type { PowerUpOutcome, PowerUpUse } from '../../power-up-core'
import { markLadderOfItem, researchedMarkOf } from '../../tech-tree'

/** The hold, while it is on: the push the faced side starts from before any drive names one. */
export interface FacedHold {
  seed: DriveSigns
}

export interface DrillGearMemory {
  facedHold?: FacedHold
}

export const DRILL_GEAR_SECTION: SaveSection<DrillGearMemory> = {
  id: 'drill-gear',
  version: 1,
  scope: 'player',
  initial: {},
  problems: drillGearMemoryProblems,
  toPortable: (value) => value,
  ofPortable: (body) => body as DrillGearMemory,
}

/** The cutters' act: a hold turns the faced side on with its seed; any other use turns it off. */
export function actSideCutters(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  const memory = use.milestone === 'hold' ? heldFrom(state, use.playerId) : {}
  return { kind: 'acted', effect: unchanged(withDrillGearMemory(state, use.playerId, memory)) }
}

/** The hold the cutters ask with now: on and at its Mark; else null. */
export function facedHoldOf(
  state: AuthorityState,
  playerId: string,
  itemId: string,
): FacedHold | null {
  const hold = readSection(state, playerId, DRILL_GEAR_SECTION).facedHold
  return hold !== undefined && isHoldReached(state, playerId, itemId) ? hold : null
}

function heldFrom(state: AuthorityState, playerId: string): DrillGearMemory {
  const pose = vehicleOf(state, playerId).pose
  return { facedHold: { seed: pose === null ? NO_DRIVE : sideSeedOf(pose) } }
}

function isHoldReached(state: AuthorityState, playerId: string, itemId: string): boolean {
  const hold = markLadderOfItem(itemId)?.milestones?.find(({ pattern }) => pattern === 'hold')
  return hold !== undefined && researchedMarkOf(state, playerId, itemId) >= hold.mark
}

function withDrillGearMemory(
  state: AuthorityState,
  playerId: string,
  memory: DrillGearMemory,
): AuthorityState {
  return withSection(state, playerId, DRILL_GEAR_SECTION, memory)
}

function drillGearMemoryProblems(body: unknown): string[] {
  if (!isJsonObject(body)) return ['drill-gear must be an object']
  const hold = body.facedHold
  if (hold === undefined) return []
  return isJsonObject(hold) && isDriveSigns(hold.seed)
    ? []
    : ['drill-gear.facedHold must hold a seed of drive signs, or be left out']
}
