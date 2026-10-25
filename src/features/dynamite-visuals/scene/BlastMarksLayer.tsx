/**
 * The marks a charge leaves and wears (D7, ticket 866): the crater decals of the planet's last
 * blasts, cut from `prop-blast-crater` and tinted in the type's soot or the laid casing's plate and
 * trim; the two rings round every live charge, the danger zone dashed inside the ground ring, in
 * the type's colour; and the fuse sparks a burning charge throws from its lamp, a pool per type in
 * its spark colour. Fixed pools placed in `useFrame`, never through React; it never writes the
 * authority, the camera or the sound. The decals wait for the atlas under a `Suspense`, so the
 * rings and sparks draw while it loads.
 */
import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo } from 'react'
import { useAtlasAlbedo } from '../../../scene/atlasTextures'
import { useDisposeEachOnRelease } from '../../../scene/disposeOnRelease'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { readLiveChargesInto } from '../../../store/chargeReads'
import { readCollapse } from '../../../store/collapseReads'
import type { AtlasMaps } from '../../../systems/art/assetLook'
import type { PlantedCharge } from '../../../systems/vehicle/vehicleCharges'
import { createRingMarks, hearBlastMarks, readRingMarksInto } from '../store/blastMarkFeed'
import { blastMarksBudgetOf } from '../systems/render/blastMarks'
import { chargeTypes } from '../systems/render/chargeTypeLook'
import { craterAtlasOf } from '../systems/render/craterAtlas'
import { PLANTED_DYNAMITE_BUDGET } from './PlantedDynamiteLayer'
import { createDecalPool, drawDecals, type DecalPool } from './blastDecalPool'
import { createRingPool, drawRings, type RingPool } from './blastRingPool'
import {
  createFuseSparkPools,
  drawFuseSparks,
  stepFuseSparks,
  throwFuseSparks,
  type FuseSparkPools,
} from './fuseSparkPools'
import { blastMarksPresence } from './blastMarksPresence'

export const BLAST_MARKS_LAYER_ID = 'dynamite-visuals.marks'

/** A ring per planted slot, the decals, a spark pool per type (#213). */
export const BLAST_MARKS_BUDGET = blastMarksBudgetOf(
  PLANTED_DYNAMITE_BUDGET.drawCalls / 2,
  chargeTypes().length,
)

/** The decals over the kernel scorch (0.2) and under the planted charges (0.26). */
export const DECAL_Z = 0.21
/** The rings over the collapse cracks (0.27) and the sensing reveals (0.28). */
export const RING_Z = 0.29
/** The sparks beside the front's fire (0.31). */
export const SPARK_Z = 0.31

export function BlastMarksLayer() {
  const atlas = useMemo(() => craterAtlasOf(SHIPPED_ART), [])
  const rings = useMemo(createRingPool, [])
  const sparks = useMemo(createFuseSparkPools, [])
  const marks = useMemo(createRingMarks, [])
  const live = useMemo<PlantedCharge[]>(() => [], [])
  useDisposeEachOnRelease(useMemo(() => [...rings.resources, ...sparks.resources], [rings, sparks]))
  useEffect(() => listenForDomainEvents(hearBlastMarks), [])
  useFrame((_, delta) => {
    const ringCount = readRingMarksInto(marks)
    drawRings(rings, marks, ringCount)
    const tick = readLiveChargesInto(live)
    stepFuseSparks(sparks, delta)
    throwFuseSparks(sparks, live, tick, delta)
    drawFuseSparks(sparks)
    recordFrameDraw(ringCount, sparks)
  })
  return (
    <>
      <primitive object={rings.pool.mesh} />
      {sparks.points.map((points) => (
        <primitive key={points.id} object={points} />
      ))}
      {atlas !== null && (
        <Suspense fallback={null}>
          <CraterDecals maps={atlas.maps} />
        </Suspense>
      )}
    </>
  )
}

function CraterDecals({ maps }: { maps: AtlasMaps }) {
  const map = useAtlasAlbedo(maps)
  const decals = useMemo(() => createDecalPool(map), [map])
  useDisposeEachOnRelease(useMemo(() => decals.resources, [decals]))
  // A cased rim glows on the authority's clock (D8 ticket 868): the tick, read without React.
  useFrame(() => recordDecalDraw(drawDecals(decals, readCollapse().tick)))
  return <primitive object={decals.pool.mesh} />
}

function recordFrameDraw(ringCount: number, sparks: FuseSparkPools): void {
  const presence = blastMarksPresence
  presence.rings = ringCount
  presence.sparks = sparks.pools.reduce((alive, pool) => alive + pool.count, 0)
  const drawCalls = (ringCount > 0 ? 1 : 0) + sparks.pools.filter((pool) => pool.count > 0).length
  raiseMarksPeak(
    drawCalls + (presence.decals > 0 ? 1 : 0),
    ringCount + presence.sparks + presence.decals,
  )
}

function recordDecalDraw({ craters, decals }: { craters: number; decals: number }): void {
  blastMarksPresence.craters = craters
  blastMarksPresence.decals = decals
}

function raiseMarksPeak(drawCalls: number, instances: number): void {
  const { peak } = blastMarksPresence
  peak.drawCalls = Math.max(peak.drawCalls, drawCalls)
  peak.instances = Math.max(peak.instances, instances)
}

export type { DecalPool, RingPool }
