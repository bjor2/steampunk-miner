import { useEffect } from 'react'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { onFrame } from '../../../ui/projection/worldToScreen'
import { throwBoreTracer } from '../scene/boreTracer'
import { advanceFire, cancelFireTile, hearFireRefusals } from '../store/fireInput'
import { advanceFireLamp, releaseFireLamp } from '../store/lampInput'
import { readCursorAim } from './cursorAim'

/**
 * The gun's client clock, mounted with the HUD whatever device plays (ticket 314, the TD lock on
 * #314 section 2): every rendered frame hands the fire input the authority's tick and the cursor's
 * aim (a due shot goes out then) and runs the lamp's long press; the authority's events come back
 * as refusals and as the tracer. Taking the HUD away lets a held gun and a pressed lamp go.
 */
export function useFireClock(): void {
  useEffect(() => {
    const stopFrames = onFrame(advanceFireFrame)
    const stopHearing = listenForDomainEvents(hearBoreEvents)
    return () => {
      stopFrames()
      stopHearing()
      cancelFireTile()
      releaseFireLamp()
    }
  }, [])
}

function advanceFireFrame(): void {
  advanceFire(readCursorAim())
  advanceFireLamp()
}

function hearBoreEvents(events: readonly DomainEvent[], playerId: string): void {
  hearFireRefusals(events, playerId)
  throwBoreTracer(events, playerId)
}
