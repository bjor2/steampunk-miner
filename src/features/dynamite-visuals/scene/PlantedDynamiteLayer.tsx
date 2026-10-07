/**
 * Every live charge on its wall (#153 "every size is a visible new model", #145a models; took
 * over from the kernel's `PlantedCharges` in #215): the planted size's body stood on the planet's
 * radial up, its lamp blinking, faster in the fuse's last second. A fixed pool of slots, each
 * holding every size's model hidden, placed each frame from the authority replica, never through
 * React: a slot shows only its charge's size, and a slot with no charge is hidden. Presentation
 * only, on the render clock.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group } from 'three'
import { PLANTED_CHARGE_SLOTS } from '../../../constants/scene'
import { PartQuadMesh } from '../../../scene/PartQuadMesh'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { readLiveChargesInto } from '../../../store/chargeReads'
import { writeChargePlacement, type ChargePlacement } from '../../../systems/render/chargePlacement'
import type { PlantedCharge } from '../../../systems/vehicle/vehicleCharges'
import { dynamiteSizes } from '../systems/render/dynamiteArt'
import {
  fuseTicksLeftOf,
  isFuseLampLit,
  plantedBodyQuadsOf,
  plantedDynamiteMaps,
  plantedLampQuadsOf,
} from '../systems/render/plantedDynamiteLook'

export const PLANTED_DYNAMITE_LAYER_ID = 'dynamite-visuals.planted'

/** A shown charge draws its body and its lamp: two quads a slot. */
export const PLANTED_DYNAMITE_BUDGET = {
  drawCalls: PLANTED_CHARGE_SLOTS * 2,
  instances: PLANTED_CHARGE_SLOTS * 2,
}

/** On the ground's face, under the collapse cracks (0.27), as the kernel's charge stood. */
const CHARGE_Z = 0.26
const maps = plantedDynamiteMaps(SHIPPED_ART)
const SLOT_INDICES = Array.from({ length: PLANTED_CHARGE_SLOTS }, (_, at) => at)

interface SizeModel {
  body: Group | null
  lamp: Group | null
}

interface ChargeSlot {
  group: Group | null
  /** Every size's model, by size − 1. */
  sizes: SizeModel[]
  /** Scratch for this slot's placement each frame. */
  placement: ChargePlacement
}

export function PlantedDynamiteLayer() {
  const sizes = useMemo(dynamiteSizes, [])
  const slots = useMemo(() => createSlots(sizes.length), [sizes])
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
          {sizes.map((size) => (
            <PlantedSizeModel key={size} size={size} model={slots[at].sizes[size - 1]} />
          ))}
        </group>
      ))}
    </>
  )
}

function PlantedSizeModel({ size, model }: { size: number; model: SizeModel }) {
  const bodyQuads = useMemo(() => plantedBodyQuadsOf(SHIPPED_ART, size), [size])
  const lampQuads = useMemo(() => plantedLampQuadsOf(SHIPPED_ART, size), [size])
  return (
    <group ref={(body) => (model.body = body)} visible={false}>
      {bodyQuads.map((quad) => (
        <PartQuadMesh key={quad.partId} quad={quad} maps={maps} baseZ={CHARGE_Z} />
      ))}
      <group ref={(lamp) => (model.lamp = lamp)}>
        {lampQuads.map((quad) => (
          <PartQuadMesh key={quad.partId} quad={quad} maps={maps} baseZ={CHARGE_Z} />
        ))}
      </group>
    </group>
  )
}

function createSlots(sizeCount: number): ChargeSlot[] {
  return SLOT_INDICES.map(() => ({
    group: null,
    sizes: Array.from({ length: sizeCount }, () => ({ body: null, lamp: null })),
    placement: { x: 0, y: 0, turn: 0 },
  }))
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
  showOnlySize(slot.sizes, charge.size, isFuseLampLit(seconds, fuseTicksLeftOf(charge, tick)))
}

function showOnlySize(models: readonly SizeModel[], size: number, isLampLit: boolean): void {
  for (let at = 0; at < models.length; at++) showSizeModel(models[at], at + 1 === size, isLampLit)
}

function showSizeModel(model: SizeModel, isShown: boolean, isLampLit: boolean): void {
  if (model.body !== null) model.body.visible = isShown
  if (model.lamp !== null) model.lamp.visible = isLampLit
}
