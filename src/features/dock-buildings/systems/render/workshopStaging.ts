/**
 * The Workshop auto-roll (#170, G&V docking flow and TD "Auto-roll"): docked at the Engineering
 * Works, the car is drawn rolling from where it stopped onto the turntable (`workshop.platform`)
 * within 30 ticks while the camera moves to `workshop.showcase_cam` over 24; leaving rolls it back
 * off over 30 ticks, with input ignored until it is done. Presentation only: a pure function of
 * the authority state's tick and the vehicle's mode, pose and `modeSinceTick`, so it is the same
 * at any frame rate and the authority pose, the body and every digest are untouched.
 */
import { dockedBayOf } from '../../../../systems/authority/dockRules'
import type { AuthorityState } from '../../../../systems/authority/authorityState'
import { dockSiteOfPlanet } from '../../../../systems/authority/planetOfState'
import type { VehicleStaging } from '../../../../systems/registries/vehicleStaging'
import { bayOfPose, type VehiclePose } from '../../../../systems/vehicle/vehiclePose'
import type { VehicleState } from '../../../../systems/vehicle/vehicleState'
import { bayCentreColumnOf } from '../../../../systems/world/dockBays'
import type { DockSite } from '../../../../systems/world/dockSite'

/** #170: the car is on the turntable within 30 ticks; leaving hands control back within 30. */
export const ROLL_TICKS = 30
/** #170: the camera reaches the showcase framing over 24 ticks. */
export const SHOWCASE_CAMERA_TICKS = 24

const MM_PER_METRE = 1000

/** The two Works attach points the roll reads, in metres from the building's origin. */
export interface WorkshopRollPoints {
  platformAtM: readonly [number, number]
  showcaseCamAtM: readonly [number, number]
}

type RollPhase = { kind: 'on'; elapsed: number } | { kind: 'off'; elapsed: number }

export function workshopStagingOf(
  state: AuthorityState,
  playerId: string,
  points: WorkshopRollPoints,
): VehicleStaging | null {
  const vehicle = state.players[playerId]?.vehicle
  const site = dockSiteOfPlanet(state.planet)
  if (vehicle === undefined || vehicle.pose === null || site === null) return null
  const phase = rollPhaseOf(state, playerId, vehicle, site)
  return phase === null ? null : stagingAt(phase, vehicle.pose, worksOriginOf(site), points)
}

/** Docked at the Works: rolling on. Just undocked there: rolling off. Otherwise none. */
function rollPhaseOf(
  state: AuthorityState,
  playerId: string,
  vehicle: VehicleState,
  site: DockSite,
): RollPhase | null {
  const elapsed = state.tick - vehicle.modeSinceTick
  if (dockedBayOf(state, playerId) === 'upgrade') return { kind: 'on', elapsed }
  if (isRollingOff(vehicle, site, elapsed)) return { kind: 'off', elapsed }
  return null
}

function isRollingOff(vehicle: VehicleState, site: DockSite, elapsed: number): boolean {
  if (vehicle.mode !== 'active' || elapsed >= ROLL_TICKS || vehicle.pose === null) return false
  return bayOfPose(site, vehicle.pose) === 'upgrade'
}

/** The building's origin: its zone's centre column on the pad top, as the art is placed (#174). */
export function worksOriginOf(site: DockSite): { x: number; y: number } {
  return { x: bayCentreColumnOf(site, 'upgrade'), y: site.padRow + 1 }
}

function stagingAt(
  phase: RollPhase,
  pose: VehiclePose,
  origin: { x: number; y: number },
  points: WorkshopRollPoints,
): VehicleStaging {
  const roll = rollShareOf(phase)
  const toPlatformX = origin.x + points.platformAtM[0] - pose.x / MM_PER_METRE
  return {
    drawOffsetX: toPlatformX * roll,
    drawOffsetY: 0,
    cameraX: origin.x + points.showcaseCamAtM[0],
    cameraY: origin.y + points.showcaseCamAtM[1],
    cameraWeight: cameraShareOf(phase),
    isHoldingInput: phase.kind === 'on' || phase.elapsed < ROLL_TICKS,
    canLeaveByDriveHold: phase.kind === 'on',
  }
}

/** How far onto the turntable the car is drawn: 0 where it stopped, 1 on the platform. */
function rollShareOf(phase: RollPhase): number {
  const done = easeInOut(shareOf(phase.elapsed, ROLL_TICKS))
  return phase.kind === 'on' ? done : 1 - done
}

function cameraShareOf(phase: RollPhase): number {
  const ticks = phase.kind === 'on' ? SHOWCASE_CAMERA_TICKS : ROLL_TICKS
  const done = easeInOut(shareOf(phase.elapsed, ticks))
  return phase.kind === 'on' ? done : 1 - done
}

function shareOf(elapsed: number, ticks: number): number {
  return Math.min(Math.max(elapsed / ticks, 0), 1)
}

/** Smoothstep: starts and ends at rest, exactly 0 and 1 at the ends. */
function easeInOut(share: number): number {
  return share * share * (3 - 2 * share)
}
