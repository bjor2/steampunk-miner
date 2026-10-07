import { useEffect } from 'react'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { useGateHintStore } from '../store/gateHintStore'

/**
 * Hands every batch of authority events to the gate hint store while the chip panel is drawn
 * (feature-slices.md 3.14), so its stops show the chip and sound once.
 */
export function useGateHintFeed(): void {
  const observe = useGateHintStore((state) => state.observeGateEvents)
  useEffect(() => listenForDomainEvents(observe), [observe])
}
