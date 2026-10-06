/**
 * The vehicle's `loadout` save section, v1 (#162 TD lock, K4): the kernel's loadout travels in the
 * snapshot and the save's profile as `{version, body}`, the portable shape of every section
 * (docs/standards/feature-slices.md 3.13). Restored by exact version match: refused, never migrated.
 *
 * It is kernel state on the vehicle, not a slice section, so it is not registered: adding it bumped
 * `SNAPSHOT_VERSION` (feature-slices.md 5.4). A later change to its shape bumps `version` here.
 */
import { isLoadoutSlotId, LOADOUT_SLOT_IDS } from '../registries/vehicleLoadout'
import type { SaveSection } from '../registries/saveSections'
import { EMPTY_LOADOUT, type LoadoutSlots, type VehicleLoadout } from '../vehicle/loadoutState'
import { isJsonObject } from './payloadFields'

export interface PortableSection {
  version: number
  body: unknown
}

export const LOADOUT_SECTION: SaveSection<VehicleLoadout> = {
  id: 'loadout',
  version: 1,
  scope: 'player',
  initial: EMPTY_LOADOUT,
  problems: loadoutBodyProblems,
  toPortable: (loadout) => ({ slots: { ...loadout.slots }, owned: [...loadout.owned] }),
  ofPortable: (body) => {
    const { slots, owned } = body as VehicleLoadout
    return { slots: { ...slots }, owned: [...owned] }
  },
}

export function portableLoadoutOf(loadout: VehicleLoadout): PortableSection {
  return { version: LOADOUT_SECTION.version, body: LOADOUT_SECTION.toPortable(loadout) }
}

export function loadoutOfPortable(section: PortableSection): VehicleLoadout {
  return LOADOUT_SECTION.ofPortable(section.body)
}

export function portableLoadoutProblems(section: unknown, path: string): string[] {
  if (!isJsonObject(section)) return [`${path} must be a {version, body} section`]
  if (section.version !== LOADOUT_SECTION.version) {
    return [
      `${path}.version is ${JSON.stringify(section.version)}, this build reads ${LOADOUT_SECTION.version}`,
    ]
  }
  return LOADOUT_SECTION.problems(section.body).map((problem) => `${path}.${problem}`)
}

function loadoutBodyProblems(body: unknown): string[] {
  if (!isJsonObject(body)) return ['body must be an object']
  return [
    ...(isPortableSlots(body.slots)
      ? []
      : ['body.slots must hold every loadout slot, each an item id or null']),
    ...(isSortedIdList(body.owned) ? [] : ['body.owned must be item ids, sorted, each once']),
  ]
}

function isPortableSlots(slots: unknown): slots is LoadoutSlots {
  if (!isJsonObject(slots)) return false
  const names = Object.keys(slots)
  return (
    names.length === LOADOUT_SLOT_IDS.length &&
    names.every(isLoadoutSlotId) &&
    Object.values(slots).every((itemId) => itemId === null || typeof itemId === 'string')
  )
}

function isSortedIdList(owned: unknown): boolean {
  if (!Array.isArray(owned)) return false
  const ids: unknown[] = owned
  return (
    ids.every((id) => typeof id === 'string') &&
    ids.every((id, index) => index === 0 || (ids[index - 1] as string) < (id as string))
  )
}
