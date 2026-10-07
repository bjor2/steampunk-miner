/**
 * The `dynamite-size` content kind (#143 section 1, #149 scope): one entry per rung of the kernel's
 * size ladder, each with its icon, so the codex, the cards and the HUD name a size the same way.
 * The numbers stay in the kernel's `blastingCharges.sizes` (GD and TD locks on #149): an entry
 * carries only its size, read through `chargeSpec(size, planet)`, never a copy of a number.
 *
 * Labels (#143 Systems): the size ladder is vertical; sizes 2 to 10 extend `blasting_charges` and
 * stay `both`, with no Schedule C rows of their own (#153 amendment 2). The remote detonator is
 * horizontal and is the one row this slice ships: the first size that only the plunger fires
 * (size 7) claims `remote_detonator`, whose row opens the plunger three planets earlier, at P22.
 */
import { chargeSizeCount, chargeSizesUpTo } from '../../../systems/economy/chargeSizes'
import type { ContentEntry } from '../../../systems/registries/content'

export interface DynamiteSize extends ContentEntry {
  /** The rung of `blastingCharges.sizes`, 1 to 10. */
  size: number
}

declare module '../../../systems/registries/content' {
  interface ContentKinds {
    'dynamite-size': DynamiteSize
  }
}

export const REMOTE_DETONATOR_ROW_ID = 'remote_detonator'

/** The size whose entry ships the plunger's row: the first with no fuse (#153). */
const PLUNGER_ROW_SIZE = 7

export function dynamiteSizeIdOf(size: number): string {
  return `dynamite.size_${size}`
}

export function dynamiteSizeIconIdOf(size: number): string {
  return `dynamite-size-${size}`
}

/** Every size of the ladder, smallest first. */
export function dynamiteSizes(): DynamiteSize[] {
  return chargeSizesUpTo(chargeSizeCount()).map(dynamiteSizeOf)
}

function dynamiteSizeOf(size: number): DynamiteSize {
  return {
    id: dynamiteSizeIdOf(size),
    iconId: dynamiteSizeIconIdOf(size),
    size,
    ...(size === PLUNGER_ROW_SIZE && { scheduleRowId: REMOTE_DETONATOR_ROW_ID }),
  }
}
