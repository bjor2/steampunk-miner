/**
 * What `balance:forks` counts of one bot run to tell a lane's two branches apart (GD lock on #255,
 * the action-mix column; ticket 267). The run is folded step by step, each step being a command or
 * a wait with the events it answered and where the vehicle stood after it:
 *
 * - a cell the bit cut is a `TileDestroyed` with no cause; it is a flank cell off the vehicle's
 *   column (left or right of the bore, so a sideways gallery's cells too) and a descent cell below
 *   the vehicle;
 * - the bot's airborne ticks are the thrust ticks of its pose reports, out of all their action
 *   ticks;
 * - a cargo unit is the bit's when the cell it came from was cut just before it (`groundDrill`
 *   destroys the cell, then collects its unit), and came by reach (a drain, siphon or pull) when no
 *   cell broke for it; a blast's or a bore's units are neither;
 * - an opened cell is any `TileDestroyed`, a blast's those with the `blast` cause;
 * - a trip is a dock left, as the pacing report counts them;
 * - a branch item's use is its `PowerUpUsed`, under the role the lock gives its branch (a wide
 *   ping, a cone read, a phase, an arc);
 * - a descent cell crossed by phasing is a phase started downward (its landing below the cell it
 *   crosses) that landed (`aetheric.PhaseLanded`); a reversed phase crossed nothing (ticket 391);
 * - an arc's damage is what its bolt logged, `targets` hits of `damage` each (`aetheric.ArcFired`),
 *   so the guns' hits in the same wait are never the arc's (ticket 391).
 *
 * Pure: the lane hands it the bot session's commands and events.
 */
import type { AuthorityCommand } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  add,
  fromCanonical,
  fromSafeInteger,
  mul,
  ZERO_MONEY,
  type Money,
} from '../../../systems/money'
import type { TilePoint } from '../../../systems/world/tileGrid'

/** What a branch item's use stands for in its lane's metric (GD lock on #255, the table). */
export type ForkMixRole = 'ping' | 'cone' | 'phase' | 'arc'

/** Which branch item plays which role; the items of every other branch play none. */
export type ForkMixRoles = ReadonlyMap<string, ForkMixRole>

export interface ForkMixTally {
  bitCells: number
  flankCells: number
  descentCells: number
  phasedDescentCells: number
  /** Whether the phase under way is crossing downward; it counts once it lands. */
  isPhaseDescending: boolean
  actionTicks: number
  airborneTicks: number
  bitUnits: number
  reachUnits: number
  openedCells: number
  blastCells: number
  trips: number
  uses: Record<ForkMixRole, number>
  enemyDamage: Money
  arcDamage: Money
}

/** One command, or one wait (`command` null), and what it left. */
export interface ForkMixStep {
  command: AuthorityCommand | null
  /** The vehicle's tile after the step; null before it has a pose. */
  vehicleTile: TilePoint | null
  events: readonly DomainEvent[]
}

export function emptyForkMixTally(): ForkMixTally {
  return {
    bitCells: 0,
    flankCells: 0,
    descentCells: 0,
    phasedDescentCells: 0,
    isPhaseDescending: false,
    actionTicks: 0,
    airborneTicks: 0,
    bitUnits: 0,
    reachUnits: 0,
    openedCells: 0,
    blastCells: 0,
    trips: 0,
    uses: { ping: 0, cone: 0, phase: 0, arc: 0 },
    enemyDamage: ZERO_MONEY,
    arcDamage: ZERO_MONEY,
  }
}

/** Adds the step to `tally`, in place: a run has a step for every command and wait. */
export function tallyForkMixStep(
  tally: ForkMixTally,
  step: ForkMixStep,
  roles: ForkMixRoles,
): void {
  tallyPoseTicks(tally, step.command)
  step.events.forEach((event, at) => tallyEvent(tally, step, event, step.events[at - 1]))
  tallyUses(tally, step.events, roles)
}

function tallyPoseTicks(tally: ForkMixTally, command: AuthorityCommand | null): void {
  if (command === null || command.type !== 'reportPose') return
  const { thrustTicks, driveTicks, drillTicks } = command.payload
  tally.actionTicks += thrustTicks + driveTicks + drillTicks
  tally.airborneTicks += thrustTicks
}

function tallyEvent(
  tally: ForkMixTally,
  step: ForkMixStep,
  event: DomainEvent,
  previous: DomainEvent | undefined,
): void {
  if (event.type === 'TileDestroyed') tallyOpenedCell(tally, step.vehicleTile, event)
  if (event.type === 'CargoAdded') tallyCargo(tally, event.amount, previous)
  if (event.type === 'DockLeft') tally.trips += 1
  if (event.type === 'EnemyDamaged') tally.enemyDamage = add(tally.enemyDamage, damageOf(event))
  if (event.type === 'GunHit') tally.enemyDamage = add(tally.enemyDamage, damageOf(event))
  tallyAethericEvent(tally, event)
}

/** The aetheric verbs: a phase's crossing once it lands, a bolt's hits as it logged them. */
function tallyAethericEvent(tally: ForkMixTally, event: DomainEvent): void {
  if (event.type === 'aetheric.PhaseStarted') tally.isPhaseDescending = event.toTy < event.cellTy
  if (event.type === 'aetheric.PhaseReversed') tally.isPhaseDescending = false
  if (event.type === 'aetheric.PhaseLanded') tallyPhaseLanded(tally)
  if (event.type === 'aetheric.ArcFired')
    tally.arcDamage = add(tally.arcDamage, boltDamageOf(event))
}

function tallyPhaseLanded(tally: ForkMixTally): void {
  if (tally.isPhaseDescending) tally.phasedDescentCells += 1
  tally.isPhaseDescending = false
}

function boltDamageOf(bolt: Extract<DomainEvent, { type: 'aetheric.ArcFired' }>): Money {
  return mul(fromCanonical(bolt.damage), fromSafeInteger(bolt.targets))
}

type TileDestroyed = Extract<DomainEvent, { type: 'TileDestroyed' }>

function tallyOpenedCell(
  tally: ForkMixTally,
  vehicle: TilePoint | null,
  cell: TileDestroyed,
): void {
  tally.openedCells += 1
  if (cell.cause === 'blast') tally.blastCells += 1
  if (cell.cause === undefined) tallyBitCell(tally, vehicle, cell)
}

function tallyBitCell(tally: ForkMixTally, vehicle: TilePoint | null, cell: TileDestroyed): void {
  tally.bitCells += 1
  if (vehicle === null) return
  if (cell.tx !== vehicle.tx) tally.flankCells += 1
  if (cell.ty < vehicle.ty) tally.descentCells += 1
}

function tallyCargo(tally: ForkMixTally, units: number, previous: DomainEvent | undefined): void {
  if (previous?.type !== 'TileDestroyed') tally.reachUnits += units
  else if (previous.cause === undefined) tally.bitUnits += units
}

function damageOf(event: DomainEvent): Money {
  if (event.type === 'EnemyDamaged') return fromCanonical(event.amount)
  return event.type === 'GunHit' ? fromCanonical(event.damage) : ZERO_MONEY
}

function tallyUses(tally: ForkMixTally, events: readonly DomainEvent[], roles: ForkMixRoles): void {
  for (const event of events) {
    const role = roleOfUse(event, roles)
    if (role !== null) tally.uses[role] += 1
  }
}

function roleOfUse(event: DomainEvent, roles: ForkMixRoles): ForkMixRole | null {
  return event.type === 'power-up-core.PowerUpUsed' ? (roles.get(event.itemId) ?? null) : null
}
