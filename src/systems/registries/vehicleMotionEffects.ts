/**
 * Slice effects on the vehicle's motion (ticket 233, the GD lock on #204 Q1 a): a grapple's reel,
 * a steam boost or escape thruster's burst, ballast, a grav anchor's cling and buoyancy's hover.
 * Each source reads its own section of the authority state; the fixed step asks once per step on
 * the local replica (`scene/vehicleLoop.ts`) and the physics motor applies the fold
 * (`motionEffects.ts`), with the boosts capped at `itemEffectCaps.motionBoostCapBp`. With
 * nothing registered the answer is `PLAIN_MOTION` and the vehicle drives as it did.
 */
import type { AuthorityState } from '../authority/authorityState'
import { ECONOMY } from '../economy/economy'
import {
  foldMotionEffects,
  PLAIN_MOTION,
  type VehicleMotion,
  type VehicleMotionEffect,
} from '../vehicle/motionEffects'
import { defineRegistry, entriesOf } from './seal'

export type { MotionBurst, VehicleMotion, VehicleMotionEffect } from '../vehicle/motionEffects'

export interface VehicleMotionEffectSource {
  id: string
  /** The effect on `playerId`'s vehicle at `tick`, or null when none runs. */
  effectOf(state: AuthorityState, playerId: string, tick: number): VehicleMotionEffect | null
}

export const VEHICLE_MOTION_EFFECT_REGISTRY =
  defineRegistry<VehicleMotionEffectSource>('vehicleMotionEffects')

/** Every registered effect on the player's vehicle at `tick`, folded under the caps. */
export function vehicleMotionAt(
  state: AuthorityState,
  playerId: string,
  tick: number,
): VehicleMotion {
  const sources = entriesOf(VEHICLE_MOTION_EFFECT_REGISTRY)
  if (sources.length === 0) return PLAIN_MOTION
  const effects = sources
    .map((source) => source.effectOf(state, playerId, tick))
    .filter((effect): effect is VehicleMotionEffect => effect !== null)
  return foldMotionEffects(effects, tick, ECONOMY.itemEffectCaps.motionBoostCapBp)
}
