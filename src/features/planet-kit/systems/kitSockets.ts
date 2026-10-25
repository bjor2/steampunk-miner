/**
 * Where the kit items show on the rig (`kitSockets.json`, G&V on ticket 823; the Blender art of
 * ticket 825): one vehicle-attach point per tool and per held consumable, each a `vehicle-item-<id>`
 * asset of its own (the kernel's slot-item rule, `slotItemAssetIdOf`) with the parts the art names.
 * A moving part carries its resting and acting poses, which #850 drives while the tool acts.
 * Render-only, like the attach registry (feature-slices.md 3.11): nothing here reaches the
 * authority state, a snapshot or a digest. Read once and refused whole when broken.
 */
import { isKebabId, slotItemAssetIdOf } from '../../../systems/art/artIds'
import type { Pair } from '../../../systems/art/partsSidecar'
import type { ArtAsset } from '../../../systems/registries/artAssets'
import { isAttachId, type AttachId } from '../../../systems/registries/vehicleAttach'
import socketsFile from '../kitSockets.json'
import { isPlainMap, isText, isWholeFrom } from './planetKitRowShape'

/** A turn in radians about the part's pivot, counter-clockwise on screen, and a shift in metres. */
export interface KitSocketPose {
  turn: number
  shift: Pair
}

export interface KitSocketPart {
  id: string
  /** The part's draw order over the rig's parts. */
  z: number
  /** Both poses on a part that moves; neither on a part that stands. */
  resting?: KitSocketPose
  acting?: KitSocketPose
  /** A flask part shows once this many flasks are held (G&V: one per held flask, up to 3). */
  shownFromHeld?: number
  /** The lifted shard: drawn only while the tongs act. */
  shownWhileActing?: boolean
}

export interface KitSocket {
  itemId: string
  attach: AttachId
  assetId: string
  /** What the part shows, in G&V's words. */
  shows: string
  parts: readonly KitSocketPart[]
}

/** The art category every kit socket part ships under (#52: it is drawn on the vehicle). */
const SOCKET_ART_CATEGORY = 'vehicle'

const PART_FIELDS: readonly string[] = [
  'id',
  'z',
  'resting',
  'acting',
  'shownFromHeld',
  'shownWhileActing',
]

/** Why the file is not the kit sockets; empty when it is. */
export function kitSocketsProblems(file: unknown): string[] {
  if (!isPlainMap(file) || !Array.isArray(file.sockets)) return ['kitSockets.json needs sockets']
  return file.sockets.flatMap((row: unknown, at: number) => socketProblems(row, `sockets[${at}]`))
}

export function loadKitSockets(file: unknown): readonly KitSocket[] {
  const problems = kitSocketsProblems(file)
  if (problems.length > 0) throw new Error(`kit sockets refused:\n${problems.join('\n')}`)
  return (file as { sockets: KitSocket[] }).sockets
}

export const KIT_SOCKETS: readonly KitSocket[] = loadKitSockets(socketsFile)

/** The socket of a kit item; null for an item with none (the Cache Crate). */
export function kitSocketOf(sockets: readonly KitSocket[], itemId: string): KitSocket | null {
  return sockets.find((socket) => socket.itemId === itemId) ?? null
}

/** What the slice registers for the sockets: one vehicle asset per socket with its parts (#214). */
export function kitSocketArtAssets(sockets: readonly KitSocket[]): ArtAsset[] {
  return sockets.map((socket) => ({
    id: socket.assetId,
    category: SOCKET_ART_CATEGORY,
    parts: socket.parts.map((part) => part.id),
  }))
}

/** The pose a part takes now: acting while the tool acts, else resting; a standing part never moves. */
export function kitSocketPoseOf(part: KitSocketPart, isActing: boolean): KitSocketPose {
  const pose = isActing ? part.acting : part.resting
  return pose ?? STILL
}

const STILL: KitSocketPose = { turn: 0, shift: [0, 0] }

function socketProblems(row: unknown, where: string): string[] {
  if (!isPlainMap(row)) return [`${where} must be a socket row`]
  return [
    ...(isText(row.itemId) ? [] : [`${where}.itemId must be a kit item id`]),
    ...(isText(row.attach) && isAttachId(row.attach)
      ? []
      : [`${where}.attach must be a vehicle attach id`]),
    ...assetIdProblems(row, where),
    ...(isText(row.shows) ? [] : [`${where}.shows must say what the part shows`]),
    ...partsProblems(row.parts, where),
  ]
}

/** The asset is the kernel's slot-item id for the item, so the art cannot drift from the code (#52). */
function assetIdProblems(row: Record<string, unknown>, where: string): string[] {
  if (!isText(row.itemId)) return []
  const wanted = slotItemAssetIdOf(row.itemId)
  return row.assetId === wanted ? [] : [`${where}.assetId must be "${wanted}"`]
}

function partsProblems(parts: unknown, where: string): string[] {
  if (!Array.isArray(parts) || parts.length === 0) return [`${where}.parts must list the parts`]
  return parts.flatMap((part: unknown, at: number) => partProblems(part, `${where}.parts[${at}]`))
}

function partProblems(part: unknown, where: string): string[] {
  if (!isPlainMap(part)) return [`${where} must be a part row`]
  return [
    ...Object.keys(part)
      .filter((field) => !PART_FIELDS.includes(field))
      .map((field) => `${where}.${field} is not a part field`),
    ...(isText(part.id) && isKebabId(part.id) ? [] : [`${where}.id must be a kebab-case part id`]),
    ...(isWholeFrom(part.z, 0) ? [] : [`${where}.z must be a whole draw order`]),
    ...poseProblems(part, where),
    ...(part.shownFromHeld === undefined || isWholeFrom(part.shownFromHeld, 1)
      ? []
      : [`${where}.shownFromHeld must be a held count from 1`]),
    ...(part.shownWhileActing === undefined || part.shownWhileActing === true
      ? []
      : [`${where}.shownWhileActing is true or absent`]),
  ]
}

/** A part either stands (no pose) or moves (both poses). */
function poseProblems(part: Record<string, unknown>, where: string): string[] {
  const hasResting = part.resting !== undefined
  const hasActing = part.acting !== undefined
  if (hasResting !== hasActing) return [`${where} needs both poses, resting and acting, or neither`]
  if (!hasResting) return []
  return [
    ...(isPose(part.resting) ? [] : [`${where}.resting must be { turn, shift: [x, y] }`]),
    ...(isPose(part.acting) ? [] : [`${where}.acting must be { turn, shift: [x, y] }`]),
  ]
}

function isPose(pose: unknown): pose is KitSocketPose {
  return (
    isPlainMap(pose) &&
    typeof pose.turn === 'number' &&
    Number.isFinite(pose.turn) &&
    Array.isArray(pose.shift) &&
    pose.shift.length === 2 &&
    pose.shift.every((side: unknown) => typeof side === 'number' && Number.isFinite(side))
  )
}
