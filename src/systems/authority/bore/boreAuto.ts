/**
 * The bore gun on auto (ticket 317, the #310 GD decision): the kernel's own auto actor, keyed by
 * the steam sear (`STEAM_SEAR_ITEM_ID`), and its toggle `ground_gun.set_auto {on}`.
 *
 * - Its numbers are the sear's, from the `boreGun` provider (`autoShootOf`); with no gun or no
 *   answer the mode holds `unavailable`.
 * - Its clock is the gun's one clock, `nextShotTick` (the TD on #313): it is ready once the last
 *   shot's line has ended and its recovery, with a manual shot's wait folded in, has run out.
 * - It holds while the trip's income cap is used up (Systems on #310), and on a shot that would
 *   start a collapse warning in the rig's own block: the bore's own rule (`boreWeaknessOf`) asked
 *   of the ground as that shot would leave it.
 * - Its target is the best ore over the arc (`boreAutoAim.ts`), and its act the same fire a
 *   `ground_gun.fire` makes, refused for the same reasons.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import type { AutoActor, AutoHoldReason, AutoTarget } from '../../registries/autoActors'
import { boreAutoShootOf, boreGunOf } from '../../registries/boreGun'
import type { VehiclePose } from '../../vehicle/vehiclePose'
import { blockContaining, blockIdOf } from '../../world/collapseBlock'
import type { PlanetParams } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import { vehicleOf, type AuthorityState } from '../authorityState'
import { isAutoModeOn } from '../autoMode/autoModeState'
import { autoToggleRefusal, switchAutoModeOff, switchAutoModeOn } from '../autoMode/autoToggle'
import type { CommandIntent } from '../authorityCommand'
import type { CommandRule, RuleEffect } from '../commandRule'
import { planetParamsOf } from '../planetOfState'
import { bestBoreShotOf, boreShotAlong, type BoreAimAsk, type PlannedShot } from './boreAutoAim'
import { openBoreCell } from './boreCell'
import {
  boreShotRefusal,
  fireAutoBore,
  isShotOpening,
  nextShotTickOf,
  shotOf,
  STEAM_SEAR_ITEM_ID,
} from './boreFire'
import { boreWeaknessOf } from './boreWeakness'

export const BORE_AUTO_RULES: {
  readonly 'ground_gun.set_auto': CommandRule<'ground_gun.set_auto'>
} = {
  'ground_gun.set_auto': {
    fields: { on: 'flag' },
    reject: (state, { playerId }) => autoToggleRefusal(state, playerId, STEAM_SEAR_ITEM_ID),
    apply: (state, { playerId, payload }) =>
      payload.on
        ? switchAutoModeOn(state, playerId, STEAM_SEAR_ITEM_ID)
        : switchAutoModeOff(state, playerId, STEAM_SEAR_ITEM_ID),
  },
}

/**
 * What the toggle key sends: the mode flipped, or null before the sear is researched, so the
 * press does nothing and is not buffered.
 */
export function boreAutoToggleIntentOf(
  state: AuthorityState,
  playerId: string,
): CommandIntent<'ground_gun.set_auto'> | null {
  if (autoToggleRefusal(state, playerId, STEAM_SEAR_ITEM_ID) !== null) return null
  const on = !isAutoModeOn(state, playerId, STEAM_SEAR_ITEM_ID)
  return { type: 'ground_gun.set_auto', payload: { on } }
}

export const BORE_AUTO_ACTOR: AutoActor = {
  id: 'kernel.bore-gun-auto',
  itemId: STEAM_SEAR_ITEM_ID,
  settingsOf: (state, playerId) =>
    aimAskOf(state, playerId) === null ? null : searOf(state, playerId),
  readyTickOf: (state, playerId) =>
    isShotOpening(state, playerId) ? null : nextShotTickOf(state, playerId),
  holdOf: (state, playerId) => (searOf(state, playerId)?.isIncomeCapUsed ? 'income_cap' : null),
  bestTargetOf: (state, playerId) => targetOfShot(withAsk(state, playerId, bestBoreShotOf)),
  targetAlong: (state, playerId, aim) =>
    targetOfShot(withAsk(state, playerId, (current, ask) => boreShotAlong(current, ask, aim))),
  holdAt: (state, playerId, target) => wouldWarnRigBlockHold(state, playerId, target),
  act: (state, playerId, aim, tick) => fireWhenAccepted(state, { playerId, tick, bearing: aim }),
}

function searOf(state: AuthorityState, playerId: string) {
  return boreAutoShootOf(state, playerId)
}

/** What the planner asks, or null with no planet or no gun. */
function aimAskOf(state: AuthorityState, playerId: string): BoreAimAsk | null {
  const params = planetParamsOf(state.planet)
  const stats = boreGunOf(state, playerId)
  if (params === null || stats === null) return null
  const isIncomeCapUsed = searOf(state, playerId)?.isIncomeCapUsed ?? false
  return { playerId, params, stats, shot: shotOf(stats), isIncomeCapUsed }
}

function withAsk(
  state: AuthorityState,
  playerId: string,
  plan: (state: AuthorityState, ask: BoreAimAsk) => PlannedShot | null,
): PlannedShot | null {
  const ask = aimAskOf(state, playerId)
  return ask === null ? null : plan(state, ask)
}

function targetOfShot(shot: PlannedShot | null): AutoTarget | null {
  if (shot === null || shot.best === null) return null
  return { aim: shot.bearing, tile: shot.best.tile, energyQuanta: shot.energyQuanta }
}

/** The shot would leave a weak wall beside its cells in the block the rig stands in. */
function wouldWarnRigBlockHold(
  state: AuthorityState,
  playerId: string,
  target: AutoTarget,
): AutoHoldReason | null {
  const ask = aimAskOf(state, playerId) as BoreAimAsk
  const opened = boreShotAlong(state, ask, target.aim).opened
  const inRigBlock = opened.filter((tile) => isInRigBlock(state, playerId, tile))
  if (inRigBlock.length === 0) return null
  const bored = worldAfterOpening(state, ask, opened)
  return boreWeaknessOf(bored, ask.params, inRigBlock) === null ? null : 'would_warn'
}

function isInRigBlock(state: AuthorityState, playerId: string, tile: TilePoint): boolean {
  const pose = vehicleOf(state, playerId).pose as VehiclePose
  const rigBlock = blockContaining({ xMm: pose.x, yMm: pose.y })
  return blockIdOf(rigBlock) === blockIdOf(blockContaining(tileCentreMm(tile)))
}

/** The ground as the shot would leave it: each of its cells opened through the bore's own path. */
function worldAfterOpening(state: AuthorityState, ask: BoreAimAsk, opened: readonly TilePoint[]) {
  return opened.reduce((current, tile) => openedOn(current, ask, tile), state).world
}

function openedOn(state: AuthorityState, ask: BoreAimAsk, tile: TilePoint): AuthorityState {
  const { playerId, params, shot } = ask
  const cellAsk = { playerId, tick: state.tick, shot, budgetLeft: shot.boreBudgetTicks, tile }
  const opening = openBoreCell(state, params as PlanetParams, cellAsk)
  return opening.kind === 'opened' ? opening.effect.state : state
}

/** The fire, unless the gun would refuse it as it refuses a command; then nothing happens. */
function fireWhenAccepted(
  state: AuthorityState,
  ask: { playerId: string; tick: number; bearing: number },
): RuleEffect {
  if (boreShotRefusal(state, ask) !== null) return { state, events: [] }
  return fireAutoBore(state, ask)
}

function tileCentreMm(tile: TilePoint): { xMm: number; yMm: number } {
  const half = MM_PER_METRE / 2
  return { xMm: tile.tx * MM_PER_METRE + half, yMm: tile.ty * MM_PER_METRE + half }
}
