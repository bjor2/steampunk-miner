/**
 * The marks a charge leaves and wears (D7, ticket 866): the crater decals the last blasts on the
 * planet left, each `BlastStarted` adding its type's decal (or the lined rim and trim once casing
 * is laid, #862) and arriving on a planet clearing them, as the kernel scorch keeps its centres
 * (`chargePlacement.ts`); and the two rings round a live charge, the danger zone at the rung's own
 * radius and the ground the blast clears, from the plant to the blast (#860's feel row, drawn at
 * the radii `chargeRings.ts` gives). Pure records the marks layer draws; nothing here reaches the
 * authority.
 */
import { MM_PER_METRE } from '../../../../constants/physics'
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import { chargePlacementOf, type ChargePlacement } from '../../../../systems/render/chargePlacement'
import {
  craterLookOf,
  placedRingLookOf,
  type CraterDecal,
  type LaidCasing,
  type PlacedRingLook,
} from './chargeTypeLook'
import { CRATER_MARKS, DECALS_PER_CRATER, FUSE_SPARKS_PER_TYPE } from './blastLookConstants'

export type { CraterDecal }

/** One blast's crater: where it stands, turned to the planet's radial up, and its decals. */
export interface CraterMark extends ChargePlacement {
  decals: CraterDecal[]
}

/** A live charge's rings, in metres from the charge tile's centre. */
export interface RingMark extends ChargePlacement {
  baseRadiusM: number
  groundRadiusM: number
  look: PlacedRingLook
}

/** What a `BlastStarted` is answered with: the ground it clears and the casing it laid, if any. */
export interface BlastAnswers {
  groundRadiusMmOf(blast: { size: number; radiusLevel: number }): number | null
  casingOf(): LaidCasing | null
}

/**
 * The craters after a batch of events, latest last: each `BlastStarted` adds its crater, the
 * oldest go past `CRATER_MARKS`, and arriving on a planet clears them.
 */
export function cratersAfter(
  craters: readonly CraterMark[],
  events: readonly DomainEvent[],
  answers: BlastAnswers,
): CraterMark[] {
  return events.reduce<CraterMark[]>(
    (kept, event) => cratersAfterEvent(kept, event, answers),
    [...craters],
  )
}

/** The decal quads the craters draw, oldest first: at most `CRATER_MARKS × DECALS_PER_CRATER`. */
export function craterDecalCount(craters: readonly CraterMark[]): number {
  return craters.reduce((count, crater) => count + crater.decals.length, 0)
}

/** The marks layer's budget: the ring per planted slot, the decals and a spark pool per type. */
export function blastMarksBudgetOf(plantedSlots: number, typeCount: number) {
  return {
    drawCalls: 2 + typeCount,
    instances: plantedSlots + CRATER_MARKS * DECALS_PER_CRATER + typeCount * FUSE_SPARKS_PER_TYPE,
  }
}

/** Writes a live charge's rings into `out` so a frame allocates nothing; returns `out`. */
export function writeRingMark(
  charge: { tx: number; ty: number; size: number },
  chargeType: number,
  baseRadiusMm: number,
  groundRadiusMm: number,
  radiusLevel: number,
  casing: LaidCasing | null,
  out: RingMark,
): RingMark {
  const placement = chargePlacementOf(charge)
  out.x = placement.x
  out.y = placement.y
  out.turn = placement.turn
  out.baseRadiusM = baseRadiusMm / MM_PER_METRE
  out.groundRadiusM = groundRadiusMm / MM_PER_METRE
  out.look = placedRingLookOf(chargeType, radiusLevel, casing)
  return out
}

function cratersAfterEvent(
  craters: CraterMark[],
  event: DomainEvent,
  answers: BlastAnswers,
): CraterMark[] {
  if (event.type === 'PlanetEntered') return []
  if (event.type !== 'BlastStarted') return craters
  const groundRadiusMm = answers.groundRadiusMmOf(event)
  if (groundRadiusMm === null) return craters
  const decals = craterLookOf(
    { chargeType: event.chargeType, groundRadiusMm, casingLaid: event.casingLaid },
    answers.casingOf(),
  )
  return [...craters, { ...chargePlacementOf(event), decals }].slice(-CRATER_MARKS)
}
