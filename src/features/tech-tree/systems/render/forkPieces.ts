/**
 * The vehicle part each lane's P16 fork branch hangs on the rig (GD lock on #255, G&V's feel
 * rule; ticket 270): picking a branch changes at least one visible part, so another player can
 * read the build. A branch's piece is #166 gear from `techGear.json`, read from `forkPieces.json`,
 * hung through the rig's vehicle piece (#235) at the fixed point its gear row carries. Only the
 * active branch of a lane shows. Render-only: nothing here reaches the authority, a snapshot or a
 * digest.
 */
import type { PartMount } from '../../../../systems/render/mountedPartLook'
import FORK_PIECES_FILE from '../../forkPieces.json'
import { forkBranchOfNode, forkNodeIdOf, isTechLane } from '../forkIds'
import { activeBranchOf, type ForkChoices } from '../forkNode'
import { TECH_LANES, type TechLane } from '../techNode'
import { mountedGearOf, MOUNTED_GEAR, type MountedGear } from './techGear'
import type { MountedItem } from './techGearQuads'

/** One branch's look: the gear it hangs and the turntable's turn that faces it to the camera. */
export interface ForkPiece {
  lane: TechLane
  branch: string
  /** Item ids of `techGear.json` rows; each draws as that item's gear does. */
  gear: readonly string[]
  faceTurnRadians: number
}

/** Drill sockets hold one item each; a piece may use one only where no other row competes. */
const SOCKET_KINDS = ['head', 'collar', 'flank']

export const FORK_PIECES: readonly ForkPiece[] = FORK_PIECES_FILE.branches as readonly ForkPiece[]

/** The branch's piece, or null for a branch the table does not dress. */
export function forkPieceOf(
  lane: TechLane,
  branch: string,
  pieces: readonly ForkPiece[] = FORK_PIECES,
): ForkPiece | null {
  return pieces.find((piece) => piece.lane === lane && piece.branch === branch) ?? null
}

/** Every asset the branch hangs, at its point: the #235 mounts it resolves to. */
export function forkMountsOf(
  lane: TechLane,
  branch: string,
  pieces: readonly ForkPiece[] = FORK_PIECES,
): PartMount[] {
  const gear = forkPieceOf(lane, branch, pieces)?.gear ?? []
  return gear.flatMap((itemId) => fixedMountOf(mountedGearOf(itemId)))
}

/** The gear of each lane's active branch, as the rig mounts items: at its own point, no slot. */
export function forkPieceItemsOf(
  choices: ForkChoices,
  pieces: readonly ForkPiece[] = FORK_PIECES,
): MountedItem[] {
  return TECH_LANES.flatMap((lane) => activePieceGearOf(choices, lane, pieces)).map((itemId) => ({
    itemId,
    slot: null,
  }))
}

/** Why the table cannot dress every branch as the header says; empty when it can. */
export function forkPieceProblemsOf(pieces: readonly ForkPiece[] = FORK_PIECES): string[] {
  return [...pieces.flatMap(pieceProblemsOf), ...lanePairProblemsOf(pieces)]
}

function activePieceGearOf(
  choices: ForkChoices,
  lane: TechLane,
  pieces: readonly ForkPiece[],
): readonly string[] {
  const branch = activeBranchOf(choices, lane)
  return branch === null ? [] : (forkPieceOf(lane, branch, pieces)?.gear ?? [])
}

function fixedMountOf(gear: MountedGear | null): PartMount[] {
  if (gear === null || gear.attach === 'slot') return []
  return [{ assetId: gear.assetId, attachId: gear.attach }]
}

function pieceProblemsOf(piece: ForkPiece): string[] {
  const id = `${piece.lane}/${piece.branch}`
  if (!isTechLane(piece.lane)) return [`${id}: "${piece.lane}" is no tech lane`]
  if (!isBranchId(piece)) return [`${id}: "${piece.branch}" is not one word`]
  if (piece.gear.length === 0) return [`${id}: hangs no gear`]
  return piece.gear.flatMap((itemId) => gearProblemsOf(id, itemId))
}

function isBranchId(piece: ForkPiece): boolean {
  const id = forkNodeIdOf(piece.lane, piece.branch)
  return forkBranchOfNode({ id, lane: piece.lane })?.branch === piece.branch
}

function gearProblemsOf(id: string, itemId: string): string[] {
  const gear = mountedGearOf(itemId)
  if (gear === null) return [`${id}: ${itemId} has no techGear.json row`]
  if (gear.attach === 'slot') return [`${id}: ${itemId} draws only in a power-up slot`]
  if (isSharedSocket(gear)) return [`${id}: ${itemId} shares its drill socket with other gear`]
  return []
}

function isSharedSocket(gear: MountedGear): boolean {
  if (!SOCKET_KINDS.includes(gear.kind)) return false
  return MOUNTED_GEAR.some((other) => other.attach === gear.attach && other.itemId !== gear.itemId)
}

/** Every lane has both branches dressed once, in different gear. */
function lanePairProblemsOf(pieces: readonly ForkPiece[]): string[] {
  return TECH_LANES.flatMap((lane) => {
    const dressed = pieces.filter((piece) => piece.lane === lane)
    if (dressed.length !== 2) return [`${lane}: ${dressed.length} branches dressed, not 2`]
    const [first, second] = dressed
    const isSameLook = first.gear.some((itemId) => second.gear.includes(itemId))
    return isSameLook ? [`${lane}: both branches hang the same gear`] : []
  })
}
