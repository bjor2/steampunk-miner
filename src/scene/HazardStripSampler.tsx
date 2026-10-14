/**
 * Runs the hazard strip's look-ahead sampler once a frame (ticket 341); draws nothing in the scene,
 * the HUD shows the pips. The sampler and its scratch are made once, so a frame allocates only the
 * stretches it newly scans.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { createHazardStrip } from '../systems/render/hazardStrip/hazardStripSampler'
import { createStripReads, sampleStripFrame } from './hazardStripFrame'

export function HazardStripSampler() {
  const strip = useMemo(createHazardStrip, [])
  const reads = useMemo(createStripReads, [])
  useFrame((_, delta) => sampleStripFrame(strip, reads, delta))
  return null
}
