/**
 * Every live blasting charge on its wall (#109 "Visibility", art #110): the planted charge stood
 * on the planet's radial up, its `fuse-lamp` blinking, faster in the last second. A fixed pool of
 * slots placed each frame from the authority replica, never through React; a slot with no charge
 * is hidden. Presentation only, on the render clock.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group } from 'three'
import { PLANTED_CHARGE_SLOTS } from '../constants/scene'
import { readLiveChargesInto } from '../store/chargeReads'
import {
  fuseLampQuadsOf,
  isFuseLampLit,
  plantedChargeBodyQuadsOf,
  plantedChargeMaps,
  writeChargePlacement,
  type ChargePlacement,
} from '../systems/render/chargeLook'
import type { PlantedCharge } from '../systems/vehicle/vehicleCharges'
import { PartQuadMesh } from './PartQuadMesh'
import { SHIPPED_ART } from './shippedArt'

/** On the ground's face, under the collapse cracks (0.27). */
const CHARGE_Z = 0.26
const maps = plantedChargeMaps(SHIPPED_ART)
const bodyQuads = plantedChargeBodyQuadsOf(SHIPPED_ART)
const lampQuads = fuseLampQuadsOf(SHIPPED_ART)
const SLOT_INDICES = Array.from({ length: PLANTED_CHARGE_SLOTS }, (_, at) => at)

interface ChargeSlot {
  group: Group | null
  lamp: Group | null
  /** Scratch for this slot's placement each frame. */
  placement: ChargePlacement
}

export function PlantedCharges() {
  const slots = useMemo(createSlots, [])
  const live = useMemo<PlantedCharge[]>(() => [], [])
  const clock = useRef(0)
  useFrame((_, delta) => {
    clock.current += delta
    const tick = readLiveChargesInto(live)
    placeCharges(slots, live, tick, clock.current)
  })
  return (
    <>
      {SLOT_INDICES.map((at) => (
        <group key={at} ref={(group) => (slots[at].group = group)} visible={false}>
          {bodyQuads.map((quad) => (
            <PartQuadMesh key={quad.partId} quad={quad} maps={maps} baseZ={CHARGE_Z} />
          ))}
          <group ref={(lamp) => (slots[at].lamp = lamp)}>
            {lampQuads.map((quad) => (
              <PartQuadMesh key={quad.partId} quad={quad} maps={maps} baseZ={CHARGE_Z} />
            ))}
          </group>
        </group>
      ))}
    </>
  )
}

function createSlots(): ChargeSlot[] {
  return SLOT_INDICES.map(() => ({ group: null, lamp: null, placement: { x: 0, y: 0, turn: 0 } }))
}

function placeCharges(
  slots: readonly ChargeSlot[],
  charges: readonly PlantedCharge[],
  tick: number,
  seconds: number,
): void {
  for (let at = 0; at < slots.length; at++) placeCharge(slots[at], charges[at], tick, seconds)
}

function placeCharge(
  slot: ChargeSlot,
  charge: PlantedCharge | undefined,
  tick: number,
  seconds: number,
): void {
  if (slot.group === null) return
  slot.group.visible = charge !== undefined
  if (charge === undefined) return
  const { x, y, turn } = writeChargePlacement(charge, slot.placement)
  slot.group.position.set(x, y, 0)
  slot.group.rotation.set(0, 0, turn)
  if (slot.lamp !== null) slot.lamp.visible = isFuseLampLit(seconds, charge.detonateTick - tick)
}
