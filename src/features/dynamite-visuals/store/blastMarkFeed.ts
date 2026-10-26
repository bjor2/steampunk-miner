/**
 * The marks the layer draws, as the authority replica holds them (D7, ticket 866): the craters
 * heard through `listenForDomainEvents`, each blast answered with the ground it clears on this
 * planet and the planter's casing grade and lining at the blast (what D3's `casingLaid` lines
 * it in, #862); and every live charge's rings, read without React each frame. Module state,
 * presentation only: nothing here reaches the authority, the store or the log.
 */
import { casingLookGradeOf } from '../../../systems/render/casingGradeLook'
import { PLANTED_CHARGE_SLOTS } from '../../../constants/scene'
import { readAuthorityState } from '../../../store/authorityLink'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { vehicleOf } from '../../../systems/authority/authorityState'
import { groundRadiusMmOf } from '../../../systems/authority/charges/blastDisc'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { chargeRadiusMm, chargeTypeOf } from '../../../systems/economy/chargeSizes'
import { blastRadiusLevelOf } from '../../../systems/vehicle/vehicleCharges'
import type { LaidCasing } from '../systems/render/chargeTypeLook'
import {
  cratersAfter,
  writeRingMark,
  type CraterMark,
  type RingMark,
} from '../systems/render/blastMarks'

let craters: CraterMark[] = []

/** A `listenForDomainEvents` listener: the blasts of `playerId`, answered from its vehicle. */
export function hearBlastMarks(events: readonly DomainEvent[], playerId: string): void {
  const state = readAuthorityState()
  craters = cratersAfter(craters, events, {
    groundRadiusMmOf: (blast) => groundRadiusOn(state, blast),
    casingOf: () => laidCasingOf(state, playerId),
  })
}

export function readCraterMarks(): readonly CraterMark[] {
  return craters
}

/** Forgets every crater: a new scene, or a spec's fresh start. */
export function clearCraterMarks(): void {
  craters = []
}

/** One ring record per planted slot, reused every frame. */
export function createRingMarks(): RingMark[] {
  return Array.from({ length: PLANTED_CHARGE_SLOTS }, () => ({
    x: 0,
    y: 0,
    turn: 0,
    baseRadiusM: 0,
    groundRadiusM: 0,
    look: { colour: '#000000', strokeM: 0, casingTint: null },
  }))
}

/**
 * Fills `into` with every vehicle's live charge's rings, in slot order; the count written. The
 * ground ring is at the level its planter owns (D9 #869), the level its blast will read; no casing
 * tint until D3.
 */
export function readRingMarksInto(into: RingMark[]): number {
  const state = readAuthorityState()
  let written = 0
  for (const playerId in state.players) {
    const charges = state.players[playerId].vehicle.charges
    const planted = charges.planted
    if (planted === null || written === into.length) continue
    const radiusLevel = blastRadiusLevelOf(charges)
    const groundMm = groundRadiusOn(state, { size: planted.size, radiusLevel })
    if (groundMm === null) continue
    const baseMm = chargeRadiusMm(planted.size)
    const type = chargeTypeOf(planted.size)
    writeRingMark(planted, type, baseMm, groundMm, radiusLevel, null, into[written++])
  }
  return written
}

/** The planet's radius in metres (a tile a metre), where the ground rings stop; 0 off a planet. */
export function readPlanetRadiusM(): number {
  return planetParamsOf(readAuthorityState().planet)?.radiusTiles ?? 0
}

function groundRadiusOn(
  state: AuthorityState,
  blast: { size: number; radiusLevel: number },
): number | null {
  const params = planetParamsOf(state.planet)
  if (params === null) return null
  return groundRadiusMmOf(
    { radiusMm: chargeRadiusMm(blast.size), radiusLevel: blast.radiusLevel },
    params,
  )
}

/** The grade and lining the planter lays now: what a cased crater is drawn in. */
function laidCasingOf(state: AuthorityState, playerId: string): LaidCasing | null {
  const vehicle = state.players[playerId]?.vehicle ?? null
  if (vehicle === null) return null
  const grade = casingLookGradeOf(vehicleOf(state, playerId).casingGrade)
  return { grade, liningType: vehicle.lining.active }
}
