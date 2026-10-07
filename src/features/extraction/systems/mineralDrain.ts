/**
 * The mineral drain's act (#162 extractors table, 2.1 channel, 4.2 and 4.5): once its 60-tick
 * channel ends with the miner still, the nearest drainable ore cells within its radius fade to
 * plain ground, half of their ore goes to the hold, and the trip counter moves by what it paid.
 *
 * Nothing changes and nothing is spent (power-up-core returns the charge) when:
 * - the trip is at its cap, or the first cell would pay past it: `extraction.drain_capped`;
 * - the hold has no room for the first unit: `extraction.hold_full`;
 * - nothing in reach is drainable: blocked by the nearest gated, too-hard or core cell, or with no
 *   ore at all, `extraction.no_ore_in_reach`.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { chainEffects, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEventBody } from '../../../systems/authority/domainEvent'
import { collectOreUnit } from '../../../systems/authority/groundDrill'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { queueTerrainEdit } from '../../../systems/authority/terrain/terrainEdits'
import { add, cmp, ZERO_MONEY } from '../../../systems/money'
import { cargoUnitsOf, statsOfVehicle } from '../../../systems/vehicle/vehicleState'
import { bandOfTile } from '../../../systems/world/planetGeometry'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { GROUND_CELL } from '../../../systems/world/worldCell'
import type { PowerUpOutcome, PowerUpUse } from '../../power-up-core'
import { drainReachOf, type DrainReach } from './drainReach'
import { paidCountOf, takeDrainCells, type DrainTake } from './drainTake'
import { drainYieldedOf } from './extractionEvents'
import { balanceOf, extractionItemOf, type ExtractionItem } from './extractionItems'
import { EXTRACTION_ECONOMY } from './extractionEconomy'
import {
  amountsOfTrip,
  incomeTripOf,
  tripOfAmounts,
  withIncomeTrip,
  type IncomeTripAmounts,
} from './incomeTrip'
import { roomUnderCapOf, tripCapAt, tripCapFractionOf } from './tripCap'

export const DRAIN_CAPPED = 'extraction.drain_capped'
export const HOLD_FULL = 'extraction.hold_full'
export const NO_ORE_IN_REACH = 'extraction.no_ore_in_reach'

/** Everything one drain reads, as its channel ends. */
interface DrainScene {
  use: PowerUpUse
  item: ExtractionItem
  band: number
  cap: IncomeTripAmounts['tripCap']
  trip: IncomeTripAmounts
  reach: DrainReach
  take: DrainTake
}

export function drainMinerals(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  const params = planetParamsOf(state.planet) as PlanetParams
  const scene = drainSceneOf(state, params, use)
  return refusalOf(scene) ?? { kind: 'acted', effect: drainedEffectOf(state, scene) }
}

function drainSceneOf(state: AuthorityState, params: PlanetParams, use: PowerUpUse): DrainScene {
  const item = extractionItemOf(use.itemId) as ExtractionItem
  const vehicle = vehicleOf(state, use.playerId)
  const band = bandOfTile(params, use.origin.tx, use.origin.ty)
  const cap = tripCapAt(params.planetIndex, band, statsOfVehicle(vehicle).cargoCapacity)
  const trip = amountsOfTrip(incomeTripOf(state, use.playerId))
  const reach = drainReachOf({
    state,
    params,
    playerId: use.playerId,
    tool: toolOf(item),
    origin: use.origin,
    reachTiles: balanceOf(item).reachTiles,
  })
  const take = takeDrainCells(reach.drainable, {
    maxCells: balanceOf(item).cellsPerUse,
    room: roomUnderCapOf(trip.incomeItemValue, cap),
    holdRoom: statsOfVehicle(vehicle).cargoCapacity - cargoUnitsOf(vehicle.cargo),
    yieldShare: EXTRACTION_ECONOMY.income.yieldShare,
    yieldCarry: trip.yieldCarry,
  })
  return { use, item, band, cap, trip, reach, take }
}

/** The first rule that refuses the use, in the header's order; null when it acts. */
function refusalOf(scene: DrainScene): PowerUpOutcome | null {
  if (isAtCap(scene)) return refused(DRAIN_CAPPED)
  if (scene.reach.drainable.length > 0) return refusalOfEmptyTake(scene.take)
  const nearest = scene.reach.skipped[0]
  return nearest === undefined ? refused(NO_ORE_IN_REACH) : { kind: 'blocked', block: nearest }
}

function isAtCap({ trip, cap }: DrainScene): boolean {
  return cmp(roomUnderCapOf(trip.incomeItemValue, cap), ZERO_MONEY) === 0
}

function refusalOfEmptyTake(take: DrainTake): PowerUpOutcome | null {
  if (take.taken.length > 0) return null
  return refused(take.stoppedBy === 'hold' ? HOLD_FULL : DRAIN_CAPPED)
}

/** `extraction.mineral_drain`: the drain as the gates and the terrain queue know it. */
export function toolOf(item: ExtractionItem): string {
  return `extraction.${item.node.id.split('.').pop() as string}`
}

function refused(reason: string): PowerUpOutcome {
  return { kind: 'refused', reason }
}

/** The cells queued to plain ground, the paid units into the hold, the trip moved on, logged. */
function drainedEffectOf(state: AuthorityState, scene: DrainScene): RuleEffect {
  const queued = queueDrainedCells(state, scene)
  const collected = collectPaidUnits(queued, scene)
  const trip = tripAfter(scene)
  return {
    state: withIncomeTrip(collected.state, scene.use.playerId, tripOfAmounts(trip)),
    events: [...collected.events, drainYieldOf(scene, trip)],
  }
}

/** One swap edit through the shared queue (K6): the ground is changed on the next ticks. */
function queueDrainedCells(state: AuthorityState, { use, item, take }: DrainScene): AuthorityState {
  return queueTerrainEdit(state, {
    playerId: use.playerId,
    source: toolOf(item),
    cells: take.taken.map(({ tile }) => ({ kind: 'swap' as const, ...tile, cell: GROUND_CELL })),
  })
}

/** A unit per paid cell, each named as the drill names it; its player named, as on the clock. */
function collectPaidUnits(state: AuthorityState, { use, take }: DrainScene): RuleEffect {
  const collected = chainEffects(
    state,
    take.taken
      .filter((cell) => cell.isPaid)
      .map((cell) => (current: AuthorityState) => collectOreUnit(current, use.playerId, cell.ore)),
  )
  return { state: collected.state, events: collected.events.map(ownedBy(use.playerId)) }
}

function ownedBy(playerId: string) {
  return (event: DomainEventBody): DomainEventBody => ({ ...event, playerId }) as DomainEventBody
}

function tripAfter({ trip, cap, take }: DrainScene): IncomeTripAmounts {
  return {
    incomeItemValue: add(trip.incomeItemValue, take.value),
    tripCap: cap,
    yieldCarry: take.yieldCarry,
  }
}

function drainYieldOf(scene: DrainScene, trip: IncomeTripAmounts): DomainEventBody {
  return drainYieldedOf({
    playerId: scene.use.playerId,
    itemId: scene.item.itemId,
    value: scene.take.value,
    tripCapFraction: tripCapFractionOf(trip.incomeItemValue, trip.tripCap),
    band: scene.band,
    cells: scene.take.taken.length,
    units: paidCountOf(scene.take),
  })
}
