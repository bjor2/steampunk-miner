/**
 * A planted charge's fuse on the authority's clock (spec #109): at its `detonateTick` it blows,
 * whether or not a command arrives then, so a run gives the same blast however its ticks are
 * batched. Charges due at one tick blow in player id order; a remote charge has no fuse and blows
 * only when the plunger fires it (#149 calls `detonatePlantedCharge`). The blast is the charge's
 * size (K8 #218). It says so in one `charge_detonated {by}` (the flash, shake and sound key off it),
 * hits its planter and the enemies in
 * its radius at once, and runs the slices' blast effects (feature-slices.md 3.7; with none
 * registered nothing changes). Its ground then breaks as a live blast, a slice a tick from this
 * same tick (`blastSlice.ts`, K6 #189), the slices' gates deciding its gated cells (K2), which
 * checks the rim for collapse and ends in one `blast_resolved`.
 *
 * D1 (#860): the blast is a disc record, its rung, the planter's Blast Radius level read now and
 * the session's `blastSeq`, which counts every blast and is saved, so a reload never renumbers one.
 * The planter and enemy hits keep to the rung's own radius; its ground disc (`blastDisc.ts`) is
 * what the level widens.
 */
import { chargeRadiusMm, chargeTypeOf } from '../../economy/chargeSizes'
import { applyBlastEffects, type BlastEvent } from '../../registries/blastEffects'
import type { PlantedCharge } from '../../vehicle/vehicleCharges'
import type { PlanetParams } from '../../world/planetParams'
import type { AuthorityState } from '../authorityState'
import { stampedFor, type TickOutcome } from '../combat/combatTick'
import type { DetonationTrigger, DomainEventBody } from '../domainEvent'
import { planetParamsOf } from '../planetOfState'
import { hitEnemiesInBlast, hitPlanterInBlast } from './blastHits'
import { chargesOf, withCharges } from './chargeRules'
import { baseR2Of, groundR2Of, groundRadiusMmOf, UNOWNED_RADIUS_LEVEL } from './blastDisc'
import { blastSeqOf, withBlastSeq } from './blastSeq'
import { startLiveBlast } from './liveBlast'

/** The earliest tick after `afterTick` a fused charge blows, or null with none fused. */
export function nextDetonationTick(state: AuthorityState, afterTick: number): number | null {
  const ticks = fuseTicksOfPlanted(state).map((detonateTick) =>
    Math.max(afterTick + 1, detonateTick),
  )
  return ticks.length === 0 ? null : Math.min(...ticks)
}

/** Every fused charge due by `tick` blows; the state is left at `tick`. */
export function detonateChargesDue(state: AuthorityState, tick: number): TickOutcome {
  const due = plantersOf(state).filter((playerId) => isFuseDue(state, playerId, tick))
  const blown = due.reduce<TickOutcome>(
    (outcome, playerId) => {
      const next = detonatePlantedCharge(outcome.state, playerId, tick, 'fuse')
      return { state: next.state, events: [...outcome.events, ...next.events] }
    },
    { state, events: [] },
  )
  return { state: { ...blown.state, tick }, events: blown.events }
}

/** When and how a charge blows, and the planter's Blast Radius level it blows at. */
interface Detonation {
  tick: number
  by: DetonationTrigger
  radiusLevel: number
}

/** The planter's live charge blows now; `by` says whether its fuse or the plunger fired it. */
export function detonatePlantedCharge(
  state: AuthorityState,
  playerId: string,
  tick: number,
  by: DetonationTrigger,
): TickOutcome {
  return detonatePlantedChargeAtLevel(state, playerId, {
    tick,
    by,
    radiusLevel: UNOWNED_RADIUS_LEVEL,
  })
}

/**
 * The charge blows at the planter's Blast Radius level read at detonation: the seam D9 (#869)
 * feeds the owned level through; until then every charge blows at the unowned level 0.
 */
export function detonatePlantedChargeAtLevel(
  state: AuthorityState,
  playerId: string,
  detonation: Detonation,
): TickOutcome {
  const charges = chargesOf(state, playerId)
  const spent = withCharges(state, playerId, { ...charges, planted: null })
  const params = planetParamsOf(state.planet)
  if (params === null) return { state: spent, events: [] }
  return blastCharge(spent, params, playerId, charges.planted as PlantedCharge, detonation)
}

function blastCharge(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  charge: PlantedCharge,
  { tick, by, radiusLevel }: Detonation,
): TickOutcome {
  const blast = chargeBlastOf(playerId, charge, tick, { radiusLevel, blastSeq: blastSeqOf(state) })
  const counted = withBlastSeq(state, blast.blastSeq + 1)
  const planterHit = hitPlanterInBlast(counted, params, playerId, charge, tick)
  const enemiesHit = hitEnemiesInBlast(planterHit.state, params, charge, tick)
  const sliceEffects = applyBlastEffects(enemiesHit.state, blast, params)
  const detonated = chargeDetonatedOf(blast, by, params)
  const started = blastStartedOf(blast)
  return {
    state: startLiveBlast(sliceEffects.state, blast),
    events: [
      ...stampedFor({ state, events: [detonated, started, ...planterHit.events] }, playerId, tick)
        .events,
      ...enemiesHit.events,
      ...stampedFor(sliceEffects, playerId, tick).events,
    ],
  }
}

/** What the slices' gates and blast effects and the live blast are told: every field an integer. */
function chargeBlastOf(
  playerId: string,
  charge: PlantedCharge,
  tick: number,
  { radiusLevel, blastSeq }: Pick<BlastEvent, 'radiusLevel' | 'blastSeq'>,
): BlastEvent {
  return {
    tx: charge.tx,
    ty: charge.ty,
    radiusMm: chargeRadiusMm(charge.size),
    size: charge.size,
    radiusLevel,
    blastSeq,
    playerId,
    source: 'charge',
    tick,
  }
}

/**
 * The flash, shake and sound read the blast's size and radius off its detonation (#213): the
 * ground it clears, its rung's own radius at level 0 (D1 #860).
 */
function chargeDetonatedOf(
  blast: BlastEvent,
  by: DetonationTrigger,
  params: PlanetParams,
): DomainEventBody {
  const { tx, ty, size } = blast
  return { type: 'ChargeDetonated', tx, ty, size, radiusMm: groundRadiusMmOf(blast, params), by }
}

/** The blast's disc record for the run log; no casing is laid before D3's Blast Casing (#862). */
function blastStartedOf(blast: BlastEvent): DomainEventBody {
  const { tx, ty, size, radiusLevel, blastSeq } = blast
  return {
    type: 'BlastStarted',
    tx,
    ty,
    size,
    chargeType: chargeTypeOf(size),
    radiusLevel,
    baseR2: String(baseR2Of(blast)),
    groundR2: String(groundR2Of(blast)),
    blastSeq,
    casingLaid: false,
  }
}

function isFuseDue(state: AuthorityState, playerId: string, tick: number): boolean {
  const { detonateTick } = chargesOf(state, playerId).planted as PlantedCharge
  return detonateTick !== null && detonateTick <= tick
}

function fuseTicksOfPlanted(state: AuthorityState): number[] {
  return plantersOf(state)
    .map((playerId) => (chargesOf(state, playerId).planted as PlantedCharge).detonateTick)
    .filter((detonateTick): detonateTick is number => detonateTick !== null)
}

/** Players with a charge on a wall, in id order. */
function plantersOf(state: AuthorityState): string[] {
  return Object.keys(state.players)
    .sort()
    .filter((playerId) => chargesOf(state, playerId).planted !== null)
}
