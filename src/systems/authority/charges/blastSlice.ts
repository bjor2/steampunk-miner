/**
 * The live blasts' tick (Technical Director, #154 "expanding front", K6 #189): every tick a blast
 * is live, its next slice of ground breaks under the blast rules (`blastOre.ts`), the rim blocks
 * its front has passed are checked for collapse (`blastCollapse.ts`), and a `BlastFront` tells
 * presentation where the front stands (the fire-and-dust ring and edge debris ride `rOuterMm`).
 * Live blasts share `BLAST_TILES_PER_TICK` tiles a tick, oldest first, and a blast's slice is
 * always taken in full: it is never thinned and nothing else on the tick takes its tiles. When its
 * ground and its rim are done, one `BlastResolved` sums the blast up.
 */
import { BLAST_TILES_PER_TICK } from '../../../constants/terrainBudget'
import { toCanonical } from '../../money'
import type { PlanetParams } from '../../world/planetParams'
import type { AuthorityState } from '../authorityState'
import { stampedFor, type TickOutcome } from '../combat/combatTick'
import type { RuleEffect } from '../commandRule'
import type { DomainEventBody } from '../domainEvent'
import { planetParamsOf } from '../planetOfState'
import { blastFrontOf, frontRadiusMm } from './blastFront'
import { checkCollapseBehindFront, collapseBlocksOf } from './blastCollapse'
import { breakBlastSlice, oreUnitsKeptOf, oreValueLostOf } from './blastOre'
import type { LiveBlast } from './liveBlast'

/** The pass so far: the outcome, the tiles left this tick, and the blasts still live. */
interface SlicePass {
  outcome: TickOutcome
  tilesLeft: number
  stillLive: LiveBlast[]
}

/** The next tick a live blast moves, or null with none live. */
export function nextBlastSliceTick(state: AuthorityState): number | null {
  return state.liveBlasts.length === 0 ? null : state.tick + 1
}

export function sliceLiveBlasts(state: AuthorityState, tick: number): TickOutcome {
  const params = planetParamsOf(state.planet)
  if (state.liveBlasts.length === 0 || params === null) return { state, events: [] }
  const start: SlicePass = {
    outcome: { state, events: [] },
    tilesLeft: BLAST_TILES_PER_TICK,
    stillLive: [],
  }
  const pass = state.liveBlasts.reduce(
    (current, live) => advanceLiveBlast(current, live, params, tick),
    start,
  )
  return { ...pass.outcome, state: { ...pass.outcome.state, liveBlasts: pass.stillLive } }
}

function advanceLiveBlast(
  pass: SlicePass,
  live: LiveBlast,
  params: PlanetParams,
  tick: number,
): SlicePass {
  const sliced = sliceGroundOf(pass.outcome.state, params, live, pass.tilesLeft)
  const checked = checkRimOf(sliced.effect.state, params, sliced.live)
  const isResolved = isBlastResolved(checked.live)
  const resolution = isResolved ? [resolvedEventOf(checked.effect.state, checked.live, tick)] : []
  const effect = {
    state: checked.effect.state,
    events: [...sliced.effect.events, ...checked.effect.events, ...resolution],
  }
  const stamped = stampedFor(effect, live.blast.playerId, tick)
  return {
    outcome: {
      state: stamped.state,
      events: [...pass.outcome.events, ...stamped.events],
    },
    tilesLeft: pass.tilesLeft - sliced.tilesCleared,
    stillLive: isResolved ? pass.stillLive : [...pass.stillLive, checked.live],
  }
}

/** The blast's next slice of ground and its front, or nothing when no tiles are left this tick. */
function sliceGroundOf(
  state: AuthorityState,
  params: PlanetParams,
  live: LiveBlast,
  tilesLeft: number,
): { effect: RuleEffect; live: LiveBlast; tilesCleared: number } {
  if (tilesLeft === 0 || isGroundDone(live)) {
    return { effect: { state, events: [] }, live, tilesCleared: 0 }
  }
  const slice = breakBlastSlice(state, params, live, tilesLeft)
  const front = frontEventOf(live, slice.tilesVisited)
  return {
    effect: { state: slice.effect.state, events: [front, ...slice.effect.events] },
    live: slice.live,
    tilesCleared: slice.tilesCleared,
  }
}

function checkRimOf(state: AuthorityState, params: PlanetParams, live: LiveBlast) {
  return checkCollapseBehindFront(state, params, live, frontMmOf(live), isGroundDone(live))
}

function isGroundDone(live: LiveBlast): boolean {
  return live.cursor === blastFrontOf(live.blast.radiusMm).length
}

function isBlastResolved(live: LiveBlast): boolean {
  return isGroundDone(live) && live.collapseChecks === collapseBlocksOf(live.blast)
}

/** How far the front has reached: the last tile it looked at, or the charge tile before any. */
function frontMmOf(live: LiveBlast): number {
  if (live.cursor === 0) return 0
  return frontRadiusMm(blastFrontOf(live.blast.radiusMm)[live.cursor - 1].distanceSq)
}

/** The ring the slice covered, from the first tile it looked at to the last. */
function frontEventOf(live: LiveBlast, tilesVisited: number): DomainEventBody {
  const front = blastFrontOf(live.blast.radiusMm)
  return {
    type: 'BlastFront',
    tx: live.blast.tx,
    ty: live.blast.ty,
    rInnerMm: frontRadiusMm(front[live.cursor].distanceSq),
    rOuterMm: frontRadiusMm(front[live.cursor + tilesVisited - 1].distanceSq),
  }
}

function resolvedEventOf(state: AuthorityState, live: LiveBlast, tick: number): DomainEventBody {
  const { blast } = live
  return {
    type: 'BlastResolved',
    tx: blast.tx,
    ty: blast.ty,
    radiusMm: blast.radiusMm,
    size: blast.size,
    tilesCleared: live.tilesCleared,
    oreUnits: oreUnitsKeptOf(state, live),
    oreValueLost: toCanonical(oreValueLostOf(state, live)),
    collapseChecks: live.collapseChecks,
    collapsesTriggered: live.collapsesTriggered,
    ticks: tick - blast.tick + 1,
  }
}
