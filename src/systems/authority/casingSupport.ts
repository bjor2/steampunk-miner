/**
 * The casing grade telegraph (decision #41 Log events and casing feel): when an accepted pose puts
 * the vehicle's centre in a band its casing grade does not hold (or the core below grade 5),
 * `CasingGradeInsufficient`; back where the grade holds, `CasingGradeSufficient`. Edge-triggered on
 * the pose report, so the HUD's amber badge and the log follow within one report (12 ticks). The
 * core is reported as band 6, the core material's band in #6.
 */
import { requiredCasingGrade } from '../economy/casingGrades'
import { tileOfPose, type VehiclePose } from '../vehicle/vehiclePose'
import { casingBandOfTile } from '../world/casingBand'
import type { PlanetParams } from '../world/planetParams'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import { unchanged, type RuleEffect } from './commandRule'
import type { DomainEventBody } from './domainEvent'
import { planetParamsOf } from './planetOfState'

export function followCasingSupport(state: AuthorityState, playerId: string): RuleEffect {
  const params = planetParamsOf(state.planet)
  const vehicle = vehicleOf(state, playerId)
  if (params === null || vehicle.pose === null) return unchanged(state)
  const band = supportBandOfPose(params, vehicle.pose)
  const shortBand = shortBandOf(vehicle.casingGrade, band)
  if (shortBand === vehicle.casingShortBand) return unchanged(state)
  return {
    state: withVehicle(state, playerId, { ...vehicle, casingShortBand: shortBand }),
    events: [supportEventOf(vehicle.casingGrade, band, shortBand)],
  }
}

/** The band whose casing the pose needs: its tile's band, or the core's band 6. */
function supportBandOfPose(params: PlanetParams, pose: VehiclePose): number {
  const { tx, ty } = tileOfPose(pose)
  return casingBandOfTile(params, tx, ty)
}

function shortBandOf(grade: number, band: number): number | null {
  return grade >= requiredCasingGrade(band) ? null : band
}

function supportEventOf(grade: number, band: number, shortBand: number | null): DomainEventBody {
  if (shortBand === null) return { type: 'CasingGradeSufficient', band, grade }
  return { type: 'CasingGradeInsufficient', band, grade, required: requiredCasingGrade(band) }
}
