/**
 * The workshop's debug actions (TD on #180), exposed as `steampunkDebug.features.workshop`:
 * - `chainPreview(track)`: read-only, the steps a held chain on that track could buy now, the
 *   majors it would cross and the reserve it keeps, money as canonical strings.
 * - `holdBuy(track, steps)`: presses the track's plaque and lets go once `steps` have landed,
 *   driving the real controller on the real curve, so the frames send each step as the player's
 *   hold would. It adds no authority command and no log line of its own: the steps are the
 *   ordinary `buyUpgrade` commands a hold sends.
 * - `getChain()`: read-only, the selected track, the latest hold and its tally.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { toCanonical } from '../../systems/money'
import { isUpgradeId } from '../../systems/vehicle/vehicleStats'
import { useWorkshopStore } from './store/workshopStore'
import { chainPreviewOf } from './systems/chainPreview'

export const workshopDebugActions: Readonly<Record<string, DebugAction>> = {
  chainPreview: (track) => {
    if (!isUpgradeId(track)) return notATrack(track)
    const preview = chainPreviewOf(readAuthorityState(), useGameStore.getState().playerId, track)
    return {
      ok: true,
      ...preview,
      spent: toCanonical(preview.spent),
      reserve: toCanonical(preview.reserve),
    }
  },
  holdBuy: (track, steps) => {
    if (!isUpgradeId(track)) return notATrack(track)
    if (!isWholeStepCount(steps))
      return { ok: false, problems: [`${String(steps)} is no step count`] }
    useWorkshopStore.getState().pressTrack(track, readAuthorityState().tick, steps)
    return { ok: true, chainId: useWorkshopStore.getState().hold?.chainId ?? null }
  },
  getChain: () => {
    const { selected, hold, tally } = useWorkshopStore.getState()
    const chain =
      hold === null ? null : { upgradeId: hold.upgradeId, chainId: hold.chainId, ...hold.chain }
    const shownTally = tally === null ? null : { ...tally, spent: toCanonical(tally.spent) }
    return { ok: true, selected, hold: chain, tally: shownTally }
  },
}

function notATrack(track: unknown): { ok: false; problems: string[] } {
  return { ok: false, problems: [`${String(track)} is not a track`] }
}

function isWholeStepCount(steps: unknown): steps is number {
  return Number.isInteger(steps) && (steps as number) >= 1
}
