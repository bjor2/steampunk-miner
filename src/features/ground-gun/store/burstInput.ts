/**
 * The local player's press on Overpressure's toggle (ticket 388): the one writer of it. It reads
 * the replica's toggle and submits the kernel's `turret.burst` the other way; nothing while the
 * turret has no burst to switch.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { burstToggleIntentOf, burstToggleOf, type BurstToggleModel } from '../systems/burstToggle'

export function readBurstToggle(): BurstToggleModel | null {
  return burstToggleOf(readAuthorityState(), useGameStore.getState().playerId)
}

export function toggleOverpressure(): void {
  const toggle = readBurstToggle()
  if (toggle !== null) useGameStore.getState().submitPlayerIntent(burstToggleIntentOf(toggle))
}
