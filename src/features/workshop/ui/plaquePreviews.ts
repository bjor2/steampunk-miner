/**
 * What a hold on each track would buy now, for the plaques' tempting line, and the service
 * reserve a held step keeps. Walking the authority's rule is too dear to repeat on every screen
 * refresh, so the answer is kept until the wallet, levels, hull, energy, racks or planet move.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { serviceReserveOf } from '../../../systems/authority/serviceReserve'
import { UPGRADE_IDS, type UpgradeId } from '../../../systems/economy/economyDefinition'
import { toCanonical, type Money } from '../../../systems/money'
import { chainPreviewOf, type ChainPreview } from '../systems/chainPreview'

/** A plaque reads "×30+" past this many steps: G&V's 30-step spree. */
export const PLAQUE_PREVIEW_STEPS = 30

export interface PlaquePreviews {
  byTrack: Readonly<Record<UpgradeId, ChainPreview>>
  reserve: Money
}

const kept: { key: string; previews: PlaquePreviews | null } = { key: '', previews: null }

export function readPlaquePreviews(): PlaquePreviews {
  const state = readAuthorityState()
  const playerId = useGameStore.getState().playerId
  const key = previewKeyOf(state, playerId)
  if (kept.previews === null || kept.key !== key) {
    kept.key = key
    kept.previews = previewsOf(state, playerId)
  }
  return kept.previews
}

function previewKeyOf(state: AuthorityState, playerId: string): string {
  const { wallet, vehicle } = state.players[playerId]
  const { levels, hull, energy, charges, mode } = vehicle
  const parts = [toCanonical(wallet), JSON.stringify(levels), hull, energy, mode]
  return [...parts, JSON.stringify(charges), state.planet.index].join('|')
}

function previewsOf(state: AuthorityState, playerId: string): PlaquePreviews {
  const byTrack = Object.fromEntries(
    UPGRADE_IDS.map((track) => [
      track,
      chainPreviewOf(state, playerId, track, PLAQUE_PREVIEW_STEPS),
    ]),
  ) as Record<UpgradeId, ChainPreview>
  return { byTrack, reserve: serviceReserveOf(state, playerId) }
}
