/**
 * A planted charge's fuse on the authority's clock (spec #109): at its `detonateTick` it blows,
 * whether or not a command arrives then, so a run gives the same blast however its ticks are
 * batched. Charges due at one tick blow in player id order. A blast says so in one
 * `charge_detonated` (the flash, shake and sound key off it), hits its planter and the enemies in
 * its radius at once, and runs the slices' blast effects (feature-slices.md 3.7; with none
 * registered nothing changes). Its ground then breaks as a live blast, a slice a tick from this
 * same tick (`blastSlice.ts`, K6 #189), the slices' gates deciding its gated cells (K2), which
 * checks the rim for collapse and ends in one `blast_resolved`.
 */
import { blastRadiusMm, chargeSize } from '../../economy/blastingCharges'
import { applyBlastEffects, type BlastEvent } from '../../registries/blastEffects'
import type { PlantedCharge } from '../../vehicle/vehicleCharges'
import type { PlanetParams } from '../../world/planetParams'
import type { AuthorityState } from '../authorityState'
import { stampedFor, type TickOutcome } from '../combat/combatTick'
import type { DomainEventBody } from '../domainEvent'
import { planetParamsOf } from '../planetOfState'
import { hitEnemiesInBlast, hitPlanterInBlast } from './blastHits'
import { chargesOf, withCharges } from './chargeRules'
import { startLiveBlast } from './liveBlast'

/** The earliest tick after `afterTick` a planted charge blows, or null with none planted. */
export function nextDetonationTick(state: AuthorityState, afterTick: number): number | null {
  const ticks = plantersOf(state).map((playerId) =>
    Math.max(afterTick + 1, (chargesOf(state, playerId).planted as PlantedCharge).detonateTick),
  )
  return ticks.length === 0 ? null : Math.min(...ticks)
}

/** Every charge due by `tick` blows; the state is left at `tick`. */
export function detonateChargesDue(state: AuthorityState, tick: number): TickOutcome {
  const due = plantersOf(state).filter(
    (playerId) => (chargesOf(state, playerId).planted as PlantedCharge).detonateTick <= tick,
  )
  const blown = due.reduce<TickOutcome>(
    (outcome, playerId) => {
      const next = detonateCharge(outcome.state, playerId, tick)
      return { state: next.state, events: [...outcome.events, ...next.events] }
    },
    { state, events: [] },
  )
  return { state: { ...blown.state, tick }, events: blown.events }
}

function detonateCharge(state: AuthorityState, playerId: string, tick: number): TickOutcome {
  const charges = chargesOf(state, playerId)
  const spent = withCharges(state, playerId, { ...charges, planted: null })
  const params = planetParamsOf(state.planet)
  if (params === null) return { state: spent, events: [] }
  return blastCharge(spent, params, playerId, charges.planted as PlantedCharge, tick)
}

function blastCharge(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  charge: PlantedCharge,
  tick: number,
): TickOutcome {
  const blast = chargeBlastOf(playerId, charge, tick)
  const planterHit = hitPlanterInBlast(state, params, playerId, charge, tick)
  const enemiesHit = hitEnemiesInBlast(planterHit.state, params, charge, tick)
  const sliceEffects = applyBlastEffects(enemiesHit.state, blast, params)
  const detonated: DomainEventBody = { type: 'ChargeDetonated', tx: charge.tx, ty: charge.ty }
  return {
    state: startLiveBlast(sliceEffects.state, blast),
    events: [
      ...stampedFor({ state, events: [detonated, ...planterHit.events] }, playerId, tick).events,
      ...enemiesHit.events,
      ...stampedFor(sliceEffects, playerId, tick).events,
    ],
  }
}

/** What the slices' gates and blast effects and the live blast are told: every field an integer. */
function chargeBlastOf(playerId: string, charge: PlantedCharge, tick: number): BlastEvent {
  return {
    tx: charge.tx,
    ty: charge.ty,
    radiusMm: blastRadiusMm(),
    size: chargeSize(),
    playerId,
    source: 'charge',
    tick,
  }
}

/** Players with a charge on a wall, in id order. */
function plantersOf(state: AuthorityState): string[] {
  return Object.keys(state.players)
    .sort()
    .filter((playerId) => chargesOf(state, playerId).planted !== null)
}
