import { useEffect } from 'react'
import { turnStagedVehicle } from '../../../scene/vehicleStage'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { readAuthorityTick } from '../../../store/gameStore'
import { onFrame } from '../../../ui/projection/worldToScreen'
import { turnRadiansAt } from '../systems/render/showcaseReactions'
import { useWorkshopStore } from '../store/workshopStore'

/**
 * While the showcase is up, every rendered frame hands the hold the authority tick (a due step is
 * sent then) and eases the turntable toward the selected part; the store hears the local
 * purchases for the reactions and sounds. Closing the screen lets a hold go and rests the car.
 */
export function useShowcaseClock(): void {
  useEffect(() => {
    const stopFrames = onFrame(advanceShowcase)
    const stopHearing = listenForDomainEvents(useWorkshopStore.getState().hearPurchases)
    return () => {
      stopFrames()
      stopHearing()
      leaveShowcase()
    }
  }, [])
}

function advanceShowcase(): void {
  const tick = readAuthorityTick()
  useWorkshopStore.getState().advanceHoldTo(tick)
  turnStagedVehicle(turnRadiansAt(useWorkshopStore.getState().turn, tick))
}

function leaveShowcase(): void {
  useWorkshopStore.getState().leaveShowcase()
  turnStagedVehicle(0)
}
