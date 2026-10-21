/**
 * The runs behind stabiliser foam's pace gate (the VS pin on #381, ticket 381): the pacing bot
 * arrives on a planet on-curve and plays to its core twice on each pacing seed, once bare and once
 * with the ground holders granted together: foam in `powerup.1` and the lode clamp in `powerup.2`,
 * both pressed at every chance by the magnet hand (`magnetHand.ts`), and the refractory lining, the
 * first casing-cement grade that reinforces the tunnel it lines (#157 piece iii, ticket 367). The
 * bore gun is not in the hand: the bot fires it only through the kernel `BorePolicy`, which a slice
 * run cannot pass, and `balance:bore` gates it on its own. Only specs use it.
 */
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import type { SliceRun } from '../../systems/bot/playSlice'
import {
  add,
  div,
  floor,
  fromCanonical,
  fromSafeInteger,
  mul,
  toSafeInteger,
  ZERO_MONEY,
  type Money,
} from '../../systems/money'
import { withMagnetHand } from './magnetHand'
import { BASIS_POINTS, coreRunOn, MAGNET_PACE_SEEDS } from './magnetPaceRuns'
import { LODE_CLAMP_ID } from './systems/lodeClamp'
import { STABILISER_FOAM_ID } from './systems/stabiliserFoam'

/** Foam's own planet, and the two the magnet family's gate plays. */
export const FOAM_PACE_PLANETS = [3, 7, 10] as const
export const FOAM_PACE_SEEDS = MAGNET_PACE_SEEDS

const BARE_SETUP: readonly CommandIntent[] = [setVehicleLoadoutCommand({})]

const HOLDERS_SETUP: readonly CommandIntent[] = [
  setVehicleLoadoutCommand({ 'powerup.1': STABILISER_FOAM_ID, 'powerup.2': LODE_CLAMP_ID }),
  { type: 'debug.setLiningType', payload: { liningType: 'refractory' } },
]

export interface FoamPaceRuns {
  planet: number
  seed: number
  bare: SliceRun
  withHolders: SliceRun
}

export function foamPaceRunsOn(planet: number, seed: number): FoamPaceRuns {
  return {
    planet,
    seed,
    bare: coreRunOn(planet, seed, BARE_SETUP, (session) => session),
    withHolders: coreRunOn(planet, seed, HOLDERS_SETUP, withMagnetHand),
  }
}

/** How many sprays of foam set cells in the run. */
export function foamSpraysOf(run: SliceRun): number {
  return run.events.filter((event) => event.type === 'terrain-tools.FoamSet').length
}

/** Whether the rig was destroyed at any point of the run, by any cause. */
export function hasRigDied(run: SliceRun): boolean {
  return run.events.some((event) => event.type === 'VehicleDestroyed')
}

/** How many times a collapse destroyed the rig in the run. */
export function collapseDeathsOf(run: SliceRun): number {
  return run.events.filter(
    (event) => event.type === 'VehicleDestroyed' && event.cause === 'collapse',
  ).length
}

/** The lining billed at the Sell bay over the run's sale income, in whole basis points. */
export function liningShareBpOf(run: SliceRun): number {
  const share = div(sumOf(run, liningBilledOf), sumOf(run, saleValueOf))
  return toSafeInteger(floor(mul(share, fromSafeInteger(BASIS_POINTS))))
}

function sumOf(run: SliceRun, amountOf: (event: DomainEvent) => string | null): Money {
  return run.events
    .map(amountOf)
    .map((amount) => (amount === null ? ZERO_MONEY : fromCanonical(amount)))
    .reduce(add, ZERO_MONEY)
}

function liningBilledOf(event: DomainEvent): string | null {
  return event.type === 'LiningSettled' ? event.billed : null
}

function saleValueOf(event: DomainEvent): string | null {
  return event.type === 'ResourceSold' ? event.value : null
}
