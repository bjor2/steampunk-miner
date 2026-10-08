/**
 * The `bore-gun` content kind (ticket 314): the mount and the three brass tracks as the store,
 * the cards and the spend guard name them. Every entry carries the family id `armoury` and nothing
 * more: the one `armoury` row of the #212 spend guard, renamed from `ground_weapon` by the #310
 * decision, reads the tag; this slice adds no guard table (Systems, 8 Oct, the #282 split).
 *
 * The mount ships the `bore_gun` row of the horizontal schedule (P1, Upgrade lane; #309, placed
 * by ticket 313), so the row's one home is here.
 */
import type { ContentEntry } from '../../../systems/registries/content'
import { GUN_TRACK_IDS, type GunTrackId } from './groundGunEconomy'

/** The #212 spend-guard family every armoury buy is filed under (#310 renamed `ground_weapon`). */
export const ARMOURY_FAMILY = 'armoury'

/** The schedule row the mount ships (#309; the kernel's `ground_gun.fire` opens on it too). */
export const BORE_GUN_SCHEDULE_ROW = 'bore_gun'

export interface BoreGunPart extends ContentEntry {
  /** The track this entry sells a level of; null for the mount. */
  track: GunTrackId | null
  familyId: typeof ARMOURY_FAMILY
}

declare module '../../../systems/registries/content' {
  interface ContentKinds {
    'bore-gun': BoreGunPart
  }
}

export const BORE_GUN_KIND = 'bore-gun'

export const MOUNT_PART_ID = 'ground-gun.mount'

export function trackPartIdOf(trackId: GunTrackId): string {
  return `ground-gun.${trackId}`
}

/** The mount first, then each track's entry. */
export function boreGunParts(): BoreGunPart[] {
  return [mountPart(), ...GUN_TRACK_IDS.map(trackPartOf)]
}

function mountPart(): BoreGunPart {
  return {
    id: MOUNT_PART_ID,
    iconId: 'bore-gun-mount',
    track: null,
    familyId: ARMOURY_FAMILY,
    scheduleRowId: BORE_GUN_SCHEDULE_ROW,
  }
}

function trackPartOf(trackId: GunTrackId): BoreGunPart {
  return {
    id: trackPartIdOf(trackId),
    iconId: `bore-gun-${trackId}`,
    track: trackId,
    familyId: ARMOURY_FAMILY,
  }
}
