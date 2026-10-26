/**
 * What the authority's clock does for collapse at a tick (decision #43 Sequence), in processing
 * order of the blocks:
 *
 * - at a block's refill tick (60 ticks after its warning started) it checks once more that the
 *   block still holds (weak with a vehicle within 16 m, or forced); if not, the warning is
 *   cancelled, else the refill starts: `CollapseStarted {block, samplesFilled, vehiclesHit}`, the
 *   crush for every vehicle caught in it, and the first layer;
 * - on each of the next 29 ticks one more refill step, after the last of which the block leaves the
 *   list;
 * - first of all, the braces are brought in line (ticket 331): a braced block is skipped and never
 *   begins its refill, and one whose brace ended warns afresh from this tick;
 * - a reinforced cell (ticket 365) is never filled: its samples stay open and its lining stays;
 * - a block a bare blast rolled (D2 #861) or a burst (ticket 829) crushes no vehicle, and its refill
 *   also leaves the rigs' cells and every cell a vehicle could not drill open
 *   (`blastCollapseOpenCells.ts`); a burst also says `CasingBurst` as its refill starts.
 *
 * Collapse events concern no one player, so they carry only the tick; a crush carries the player
 * whose vehicle it hit. The ground changes as ordinary `GroundChanged`.
 */
import { COLLAPSE_FILL_TICKS } from '../../../constants/balance'
import { tileOfMillimetres } from '../../vehicle/vehiclePose'
import { blockCentreMm, type CollapseBlock } from '../../world/collapseBlock'
import { planRefill, refillBlockStep } from '../../world/collapseRefill'
import { casingBandOfTile } from '../../world/casingBand'
import type { PlanetParams } from '../../world/planetParams'
import { withCollapse, type AuthorityState } from '../authorityState'
import type { RuleEffect } from '../commandRule'
import type { DomainEvent } from '../domainEvent'
import { groundChangedEventsOf } from '../groundChangedEvents'
import { planetParamsOf } from '../planetOfState'
import type { TickOutcome } from '../combat/combatTick'
import { crushVehicle, isCrushable } from './collapseCrush'
import {
  blockOfEntry,
  entryOfBlock,
  isBurstEntry,
  refillTickOf,
  withoutCollapsingBlock,
  type CollapsingBlock,
} from './collapseState'
import { syncCollapseBracesAt } from './collapseBraceSync'
import { keptOpenCellsOf } from './blastCollapseOpenCells'
import { burstOf } from './burstEvents'
import {
  cancelCollapse,
  isCollapseHeld,
  vehicleBodiesOf,
  weaknessOf,
  type VehicleBody,
} from './collapseWatch'

type TickStep = (state: AuthorityState) => TickOutcome

export function runCollapseTick(state: AuthorityState, tick: number): TickOutcome {
  const params = planetParamsOf(state.planet)
  const ran = params === null ? { state, events: [] } : bracedThenAdvanced(state, params, tick)
  return { state: { ...ran.state, tick }, events: ran.events }
}

/** The braces first (ticket 331), so a block braced on its refill tick holds. */
function bracedThenAdvanced(
  state: AuthorityState,
  params: PlanetParams,
  tick: number,
): TickOutcome {
  return runSteps(state, [
    (current) => syncCollapseBracesAt(current, tick, 'beforeCollapseStep'),
    (current) => advanceDueBlocks(current, params, tick),
  ])
}

function advanceDueBlocks(state: AuthorityState, params: PlanetParams, tick: number): TickOutcome {
  const due = state.collapse.blocks.filter((entry) => isDueAt(entry, tick))
  return runSteps(
    state,
    due.map((entry) => (current) => advanceBlock(current, params, entry.block, tick)),
  )
}

/** At or past its refill tick and not braced: a braced block holds in its warning. */
function isDueAt(entry: CollapsingBlock, tick: number): boolean {
  return entry.isBraced !== true && tick >= refillTickOf(entry)
}

function advanceBlock(
  state: AuthorityState,
  params: PlanetParams,
  id: string,
  tick: number,
): TickOutcome {
  const entry = entryOfBlock(state.collapse, id)
  if (entry === null) return { state, events: [] }
  if (tick === refillTickOf(entry)) return beginRefill(state, params, entry, tick)
  return refillStep(state, params, entry, tick)
}

function beginRefill(
  state: AuthorityState,
  params: PlanetParams,
  entry: CollapsingBlock,
  tick: number,
): TickOutcome {
  if (entry.isBraced === true) return { state, events: [] }
  if (!isCollapseHeld(state, params, entry)) {
    return stamped(cancelCollapse(state, entry.block), tick)
  }
  return runSteps(state, [
    (current) => crushAndAnnounce(current, params, entry, tick),
    (current) => refillStep(current, params, entry, tick),
  ])
}

/** `CollapseStarted`, then a crush for each crushable vehicle the refill catches. */
function crushAndAnnounce(
  state: AuthorityState,
  params: PlanetParams,
  entry: CollapsingBlock,
  tick: number,
): TickOutcome {
  const block = blockOfEntry(entry)
  const bodies = vehicleBodiesOf(state)
  const plan = planRefill(
    state.world,
    params,
    block,
    bodies.map(({ centre }) => centre),
    keptOpenCellsOf(state, params, entry),
  )
  const caught = crushedBodiesOf(state, entry, bodies, plan.caught)
  const announced: DomainEvent = {
    tick,
    type: 'CollapseStarted',
    block: entry.block,
    samplesFilled: plan.samples,
    vehiclesHit: caught.length,
  }
  const crushed = crushEach(state, caught, bandOfBlock(params, block), tick)
  const burst = burstEventsOf(state, params, entry, tick)
  return { state: crushed.state, events: [announced, ...burst, ...crushed.events] }
}

/** A burst's own line as its refill starts (ticket 829); none for any other collapse. */
function burstEventsOf(
  state: AuthorityState,
  params: PlanetParams,
  entry: CollapsingBlock,
  tick: number,
): DomainEvent[] {
  if (!isBurstEntry(entry)) return []
  const weakness = weaknessOf(state, params, blockOfEntry(entry))
  return weakness === null ? [] : [{ tick, ...burstOf(state, entry.block, weakness) }]
}

/**
 * The crushable vehicles the refill catches; a bare blast's collapse (D2 #861) and a burst
 * (ticket 829: it never damages the rig) crush none.
 */
function crushedBodiesOf(
  state: AuthorityState,
  entry: CollapsingBlock,
  bodies: readonly VehicleBody[],
  isCaught: readonly boolean[],
): VehicleBody[] {
  if (entry.isBlast === true || isBurstEntry(entry)) return []
  return bodies.filter(
    ({ playerId }, at) => isCaught[at] && isCrushable(state.players[playerId].vehicle),
  )
}

function crushEach(
  state: AuthorityState,
  caught: readonly VehicleBody[],
  band: number,
  tick: number,
): TickOutcome {
  return runSteps(
    state,
    caught.map(({ playerId }) => (current) => {
      const crushed = crushVehicle(current, playerId, band, tick)
      return {
        state: crushed.state,
        events: crushed.events.map((body): DomainEvent => ({ tick, playerId, ...body })),
      }
    }),
  )
}

/** One layer step of the refill, the block leaving the list after the last. */
function refillStep(
  state: AuthorityState,
  params: PlanetParams,
  entry: CollapsingBlock,
  tick: number,
): TickOutcome {
  const step = tick - refillTickOf(entry)
  const bodies = vehicleBodiesOf(state).map(({ centre }) => centre)
  const refilled = refillBlockStep(
    state.world,
    params,
    blockOfEntry(entry),
    step,
    bodies,
    keptOpenCellsOf(state, params, entry),
  )
  const isLast = step >= COLLAPSE_FILL_TICKS - 1
  const collapse = isLast ? withoutCollapsingBlock(state.collapse, entry.block) : state.collapse
  return stamped(
    {
      state: withCollapse({ ...state, world: refilled.world }, collapse),
      events: groundChangedEventsOf(refilled),
    },
    tick,
  )
}

function bandOfBlock(params: PlanetParams, block: CollapseBlock): number {
  const centre = blockCentreMm(block)
  const { tx, ty } = tileOfMillimetres(centre.xMm, centre.yMm)
  return casingBandOfTile(params, tx, ty)
}

function stamped(effect: RuleEffect, tick: number): TickOutcome {
  return {
    state: effect.state,
    events: effect.events.map((body): DomainEvent => ({ tick, ...body })),
  }
}

function runSteps(state: AuthorityState, steps: readonly TickStep[]): TickOutcome {
  return steps.reduce<TickOutcome>(
    (outcome, step) => {
      const next = step(outcome.state)
      return { state: next.state, events: [...outcome.events, ...next.events] }
    },
    { state, events: [] },
  )
}
