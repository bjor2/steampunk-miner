/**
 * The Works' idle motion this frame (ticket 395): render seconds, the turntable's spin, the gantry's
 * sway and the live steam. Per-frame state, so it stays out of React and zustand: `WorksIdle`
 * writes it once a frame and the slice's debug read reports it.
 */
import { createTurntableSpin, type TurntableSpin } from '../systems/render/turntableSpin'

export interface WorksIdleNow {
  seconds: number
  spin: TurntableSpin
  gantryRadians: number
  steamParticles: number
}

export const worksIdleNow: WorksIdleNow = {
  seconds: 0,
  spin: createTurntableSpin(),
  gantryRadians: 0,
  steamParticles: 0,
}
