import { useEffect } from 'react'
import { turnStagedVehicle } from '../../../scene/vehicleStage'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { readAuthorityTick } from '../../../store/gameStore'
import { onFrame } from '../../../ui/projection/worldToScreen'
import { showcaseTurnRadiansAt } from '../systems/render/turntableBeat'
import { useWorkshopStore } from '../store/workshopStore'

/**
 * While the showcase is up, every rendered frame hands the hold the authority tick (a due step is
 * sent then) and eases the turntable toward the selected part, or plays a fork re-choice's beat
 * (ticket 270); the store hears the local purchases for the reactions and sounds, and the local
 * re-choices for the beat. Closing the screen lets a hold go and rests the car.
 */
export function useShowcaseClock(): void {
  useEffect(() => {
    const stopFrames = onFrame(advanceShowcase)
    const stopHearing = listenForDomainEvents(useWorkshopStore.getState().hearPurchases)
    const stopBeats = listenForDomainEvents(useWorkshopStore.getState().hearForkRechoices)
    return () => {
      stopFrames()
      stopHearing()
      stopBeats()
      leaveShowcase()
    }
  }, [])
}

function advanceShowcase(): void {
  const tick = readAuthorityTick()
  useWorkshopStore.getState().advanceHoldTo(tick)
  turnStagedVehicle(showcaseTurnAt(tick))
}

function showcaseTurnAt(tick: number): number {
  const { turn, beat } = useWorkshopStore.getState()
  return showcaseTurnRadiansAt(turn, beat, tick)
}

function leaveShowcase(): void {
  useWorkshopStore.getState().leaveShowcase()
  turnStagedVehicle(0)
}
