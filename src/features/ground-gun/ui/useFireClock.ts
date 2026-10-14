import { useEffect } from 'react'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { onFrame } from '../../../ui/projection/worldToScreen'
import { advanceFire, cancelFireTile, hearFireRefusals } from '../store/fireInput'
import { readCursorAim } from './cursorAim'

/**
 * While the fire tile is up, every rendered frame hands the fire input the authority's tick (a
 * due shot goes out then) and the authority's refusals come back to it. Taking the tile away lets
 * a held gun go.
 */
export function useFireClock(): void {
  useEffect(() => {
    const stopFrames = onFrame(() => advanceFire(readCursorAim()))
    const stopHearing = listenForDomainEvents(hearFireRefusals)
    return () => {
      stopFrames()
      stopHearing()
      cancelFireTile()
    }
  }, [])
}
