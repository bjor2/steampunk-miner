/**
 * Read-only, so no command and no log line (docs/standards/feature-slices.md 3.14): the TD's
 * `steampunkDebug.features.workshop.chainPreview(track)` on #180, the steps a held chain on that
 * track could buy now, the majors it would cross and the service reserve it keeps, with money as
 * canonical strings so a browser spec reads it as it crosses JSON.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { toCanonical } from '../../systems/money'
import { isUpgradeId } from '../../systems/vehicle/vehicleStats'
import { chainPreviewOf } from './systems/chainPreview'

export const workshopDebugActions: Readonly<Record<string, DebugAction>> = {
  chainPreview: (track) => {
    if (!isUpgradeId(track)) return { ok: false, problems: [`${String(track)} is not a track`] }
    const preview = chainPreviewOf(readAuthorityState(), useGameStore.getState().playerId, track)
    return {
      ok: true,
      ...preview,
      spent: toCanonical(preview.spent),
      reserve: toCanonical(preview.reserve),
    }
  },
}
