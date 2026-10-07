/**
 * Each player's running mobility effects (the `mobility` save section v1, the GD lock on #204):
 * the windows the items opened, kept in the authority so every effect replays the same on every
 * machine. The kernel seams read them (ticket 233): the motion fold, the hull damage intercept,
 * the detection modifier and the heat pause. The window clock clears each one when it ends, so
 * the section goes back to its initial value (out of the state and the digest) once nothing runs.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { isJsonObject, isWholeNumber } from '../../../systems/authority/payloadFields'
import {
  readSection,
  withSection,
  type SaveSection,
} from '../../../systems/registries/saveSections'
import type { HeatPauseWindow } from '../../../systems/registries/heatPauses'

/** A grapple's reel: toward the open tile beside the hooked cell, until `untilTick`. */
export interface ReelWindow {
  hookTx: number
  hookTy: number
  tx: number
  ty: number
  untilTick: number
}

/** A burst along a world direction (any length but zero), until `untilTick`. */
export interface BurstWindow {
  dirX: number
  dirY: number
  speedMmPerS: number
  untilTick: number
}

/** A smoke cloud where the canister burst, in millimetres. */
export interface SmokeCloud {
  x: number
  y: number
  untilTick: number
}

/**
 * A rivet patch holding still after its wind-up; it lands at `finishTick`. `expectedEnergy` is the
 * tank the next tick should find once the toggles have drawn: less means the player spent energy
 * on movement or the drill, which cancels the hold (`rivetPatch.ts`).
 */
export interface RivetHold {
  finishTick: number
  expectedEnergy: number
}

export interface MobilityState {
  reel: ReelWindow | null
  boost: BurstWindow | null
  escape: BurstWindow | null
  /** The first tick the dropped ballast no longer lightens the miner; 0 with none dropped. */
  ballastUntilTick: number
  /** The first tick the steam curtain is down again; 0 with none raised. */
  shieldUntilTick: number
  smoke: SmokeCloud | null
  /** Kept until the heat gauge has settled past each, so no vent is missed (`heatPauses`). */
  heatSinks: readonly HeatPauseWindow[]
  patch: RivetHold | null
}

export const NO_MOBILITY_EFFECTS: MobilityState = {
  reel: null,
  boost: null,
  escape: null,
  ballastUntilTick: 0,
  shieldUntilTick: 0,
  smoke: null,
  heatSinks: [],
  patch: null,
}

export const MOBILITY_SECTION: SaveSection<MobilityState> = {
  id: 'mobility',
  version: 1,
  scope: 'player',
  initial: NO_MOBILITY_EFFECTS,
  problems: mobilityStateProblems,
  toPortable: (value) => value,
  ofPortable: (body) => body as MobilityState,
}

export function mobilityOf(state: AuthorityState, playerId: string): MobilityState {
  return readSection(state, playerId, MOBILITY_SECTION)
}

export function withMobility(
  state: AuthorityState,
  playerId: string,
  value: MobilityState,
): AuthorityState {
  return withSection(state, playerId, MOBILITY_SECTION, value)
}

/** The player's section changed by `change`. */
export function updateMobility(
  state: AuthorityState,
  playerId: string,
  change: (value: MobilityState) => MobilityState,
): AuthorityState {
  return withMobility(state, playerId, change(mobilityOf(state, playerId)))
}

/** Windows whose vent the gauge has not settled past yet: kept so none is missed. */
export function unsettledHeatSinksOf(
  value: MobilityState,
  settledTick: number,
): readonly HeatPauseWindow[] {
  const kept = value.heatSinks.filter((window) => window.untilTick > settledTick)
  return kept.length === value.heatSinks.length ? value.heatSinks : kept
}

function mobilityStateProblems(body: unknown): string[] {
  if (!isJsonObject(body)) return ['mobility must be an object']
  return [
    ...nullableProblems('reel', body.reel, REEL_FIELDS),
    ...nullableProblems('boost', body.boost, BURST_FIELDS),
    ...nullableProblems('escape', body.escape, BURST_FIELDS),
    ...tickProblems('ballastUntilTick', body.ballastUntilTick),
    ...tickProblems('shieldUntilTick', body.shieldUntilTick),
    ...nullableProblems('smoke', body.smoke, SMOKE_FIELDS),
    ...heatSinkProblems(body.heatSinks),
    ...nullableProblems('patch', body.patch, ['finishTick', 'expectedEnergy']),
  ]
}

const REEL_FIELDS = ['hookTx', 'hookTy', 'tx', 'ty', 'untilTick'] as const
const BURST_FIELDS = ['dirX', 'dirY', 'speedMmPerS', 'untilTick'] as const
const SMOKE_FIELDS = ['x', 'y', 'untilTick'] as const
const HEAT_SINK_FIELDS = ['fromTick', 'untilTick', 'ventBp', 'gainBp'] as const

function nullableProblems(name: string, value: unknown, fields: readonly string[]): string[] {
  if (value === null || hasIntegerFields(value, fields)) return []
  return [`mobility.${name} must be null or {${fields.join(', ')}} integers`]
}

function tickProblems(name: string, value: unknown): string[] {
  return isWholeNumber(value) ? [] : [`mobility.${name} must be a whole number`]
}

function heatSinkProblems(value: unknown): string[] {
  const isList =
    Array.isArray(value) && value.every((window) => hasIntegerFields(window, HEAT_SINK_FIELDS))
  return isList ? [] : [`mobility.heatSinks must be a list of {${HEAT_SINK_FIELDS.join(', ')}}`]
}

function hasIntegerFields(value: unknown, fields: readonly string[]): boolean {
  return isJsonObject(value) && fields.every((field) => Number.isSafeInteger(value[field]))
}
