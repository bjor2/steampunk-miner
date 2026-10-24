/**
 * Where the kit items show on the rig (`kitSockets.json`, G&V on ticket 823): one vehicle-attach
 * point per tool and per held consumable, each drawn as a flat placeholder part until its Blender
 * art lands. Render-only, like the attach registry (feature-slices.md 3.11): nothing here reaches
 * the authority state, a snapshot or a digest. Read once and refused whole when broken.
 */
import { isAttachId, type AttachId } from '../../../systems/registries/vehicleAttach'
import socketsFile from '../kitSockets.json'
import { isPlainMap, isText } from './planetKitRowShape'

export interface KitSocket {
  itemId: string
  attach: AttachId
  /** What the final part shows, in G&V's words. */
  shows: string
  placeholder: { sizeM: readonly [number, number]; colour: string }
}

const HEX_COLOUR = /^#[0-9a-f]{6}$/

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

function socketProblems(row: unknown, where: string): string[] {
  if (!isPlainMap(row)) return [`${where} must be a socket row`]
  return [
    ...(isText(row.itemId) ? [] : [`${where}.itemId must be a kit item id`]),
    ...(isText(row.attach) && isAttachId(row.attach)
      ? []
      : [`${where}.attach must be a vehicle attach id`]),
    ...(isText(row.shows) ? [] : [`${where}.shows must say what the part shows`]),
    ...placeholderProblems(row.placeholder, `${where}.placeholder`),
  ]
}

function placeholderProblems(placeholder: unknown, where: string): string[] {
  if (!isPlainMap(placeholder)) return [`${where} must be { sizeM, colour }`]
  return [
    ...(isSize(placeholder.sizeM) ? [] : [`${where}.sizeM must be two sizes above 0 m`]),
    ...(isText(placeholder.colour) && HEX_COLOUR.test(placeholder.colour)
      ? []
      : [`${where}.colour must be #rrggbb`]),
  ]
}

function isSize(size: unknown): boolean {
  return (
    Array.isArray(size) &&
    size.length === 2 &&
    size.every((side: unknown) => typeof side === 'number' && side > 0)
  )
}
