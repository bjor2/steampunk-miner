import { useEffect } from 'react'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import type { DomainEvent } from '../../../systems/authority/domainEvent'

/**
 * Hands every batch of authority events to one of the popup store's observers while the panel is
 * drawn (feature-slices.md 3.14); each panel feeds only its own board, so no batch is seen twice.
 */
export function usePopupFeed(
  observe: (events: readonly DomainEvent[], playerId: string) => void,
): void {
  useEffect(() => listenForDomainEvents(observe), [observe])
}
