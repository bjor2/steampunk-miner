/**
 * The burst's two lines (ticket 829: "NDJSON events for burst warning and burst give (s,p), cell,
 * grade, required grade and delta"): the planet's star-map address as index text, the block's
 * weakest wall's cell, the grade it holds, the grade its cell needs and how many short.
 */
import { placeOfCampaign } from '../../starMap/campaignIndex'
import { toIndexText } from '../../starMap/planetAddress'
import type { BlockWeakness } from '../../world/collapseWeakness'
import type { AuthorityState } from '../authorityState'
import type { BurstReport, DomainEventBody } from '../domainEvent'
import { systemOfPlanet } from '../planetOfState'
import { gradesShortOf } from './burstHold'

/** `CasingBurstWarned` for a block starting a hold of `holdTicks`. */
export function burstWarnedOf(
  state: AuthorityState,
  block: string,
  weakness: BlockWeakness,
  holdTicks: number,
): DomainEventBody {
  return { type: 'CasingBurstWarned', ...burstReportOf(state, block, weakness), holdTicks }
}

/** `CasingBurst` for a block whose refill starts. */
export function burstOf(
  state: AuthorityState,
  block: string,
  weakness: BlockWeakness,
): DomainEventBody {
  return { type: 'CasingBurst', ...burstReportOf(state, block, weakness) }
}

function burstReportOf(state: AuthorityState, block: string, weakness: BlockWeakness): BurstReport {
  const system = systemOfPlanet(state.planet)
  return {
    block,
    system: toIndexText(system),
    place: toIndexText(placeOfCampaign(system, BigInt(state.planet.index))),
    tx: weakness.tile.tx,
    ty: weakness.tile.ty,
    grade: weakness.weakestGrade,
    required: weakness.required,
    delta: gradesShortOf(weakness),
  }
}
