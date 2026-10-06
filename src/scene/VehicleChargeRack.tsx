/**
 * The `blasting_charges` rack on the run vehicle (#109 "Visibility", #81 acceptance 3, art #110):
 * drawn in the vehicle's body frame, under its own parts, once the rack is bolted on, with one
 * charge on it for each charge carried. It changes only when a charge is planted or bought, so it
 * renders through React from the vehicle replica.
 */
import { useMemo } from 'react'
import { useGameStore } from '../store/gameStore'
import { chargeRackMaps, chargeRackQuadsOf } from '../systems/render/chargeLook'
import { PartQuadMesh } from './PartQuadMesh'
import { SHIPPED_ART } from './shippedArt'

/** Behind the body's parts (0.1): the rack hangs off the rear of the chassis. */
const RACK_Z = 0.06
const maps = chargeRackMaps(SHIPPED_ART)

export function VehicleChargeRack() {
  const rackCharges = useGameStore((state) => state.vehicle.rackCharges)
  const quads = useMemo(() => chargeRackQuadsOf(SHIPPED_ART, rackCharges), [rackCharges])
  return (
    <>
      {quads.map((quad) => (
        <PartQuadMesh key={quad.partId} quad={quad} maps={maps} baseZ={RACK_Z} />
      ))}
    </>
  )
}
