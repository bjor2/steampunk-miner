/**
 * What the bore gun auto specs share (ticket 317): a fake slice answering the #309 L1 gun, the
 * steam sear's #322 numbers and its research, and a rig tile in planet 1's band-1 rock on the
 * east edge of its collapse block, so a level shot east never bores the rig's own block: two ore
 * cells two and three east of it (`ORE_RIG`'s row, one tile on).
 */
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { BoreAutoShootStats, BoreGunStats } from '../../registries/boreGun'
import type { TilePoint } from '../../world/tileGrid'
import type { CommandIntent } from '../authorityCommand'
import { BORE_STATS } from './boreFixtures'
import { STEAM_SEAR_ITEM_ID } from './boreFire'

/** #322's `autoShoot`: a 10-tick preview, 60 ticks after a manual shot, 10 points over rescue. */
export const SEAR_STATS: BoreAutoShootStats = {
  previewTicks: 10,
  manualWaitTicks: 60,
  reserveAboveRescueBp: 1000,
  isIncomeCapUsed: false,
}

/** The last column of its block: ground east of it, then ore two and three cells east. */
export const AUTO_RIG: TilePoint = { tx: -21, ty: 280 }

export const AUTO_ON: CommandIntent<'ground_gun.set_auto'> = {
  type: 'ground_gun.set_auto',
  payload: { on: true },
}

export const AUTO_OFF: CommandIntent<'ground_gun.set_auto'> = {
  type: 'ground_gun.set_auto',
  payload: { on: false },
}

export interface SearProbe {
  /** The sear's numbers; null answers that the gun has no auto mode. */
  sear?: BoreAutoShootStats | null
  stats?: BoreGunStats
  /** Whether the sear's node is researched; it is unless a spec says not. */
  isResearched?: boolean
  extra?: (r: Parameters<SliceDefinition['register']>[0]) => void
}

/** A fake slice with the gun, the sear's numbers, and the sear researched for every player. */
export function searSlice(probe: SearProbe = {}): SliceDefinition {
  const { sear = SEAR_STATS, stats = BORE_STATS, isResearched = true, extra = () => {} } = probe
  return {
    id: 'probe',
    register(r) {
      r.boreGun({ id: 'probe.bore-gun', boreGunOf: () => stats, autoShootOf: () => sear })
      r.vehicleItemResearch({
        id: 'probe.research',
        isResearched: (_state, _playerId, itemId) => isResearched && itemId === STEAM_SEAR_ITEM_ID,
      })
      extra(r)
    },
  }
}
