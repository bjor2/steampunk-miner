/**
 * Slice hooks on how a lane item plays (GD lock on #206, adopting the TD ruling with the Vertical
 * Scaler's pins; ticket 323): a combo or a twist answers at one of a lane item's authority-side
 * decision points, and the lane consults this registry there, so no slice imports another. It
 * lives in the kernel, not `power-up-core`, because twists live in kernel code
 * (`systems/artefacts/`).
 *
 * - **Points.** Scalar points (`reach`, `autoFire`, `tow`, `twist`) answer whole cells or bp, summed
 *   onto the lane's own value and clamped once: a reach by `itemHookCaps.reachCellsMax`, the others
 *   by the ceiling the lane passes (its charges, its warnings, its base item's cap). Selection
 *   points (`targetOrder`, `dragTarget`, `aim`) answer an integer score per candidate tile; the
 *   lane takes its candidates highest summed score first, then in its own order.
 * - **No dig hook (VS pin 1).** No point is about digging, and the context carries no dig number
 *   (ticks per cell, hardness, the dig budget, felt cps, the bore advance).
 * - **Order.** Hooks are read sorted by `(hook, laneId, parentItemId, id)` in code-unit order, and
 *   every fold is order-independent (`itemHookCaps.ts`).
 * - **Cells.** A hook only ranks the candidates its lane lists, or scales the lane's own number:
 *   it never makes air and never reaches a gated or core cell, which the lane's `canMine` and
 *   eligibility rules already left out.
 * - **Income.** A hook that adds yield names its `incomeItemId`; the lane sums such claims per item
 *   before its trip cap clamps them (`incomeUnderRoomOf`).
 * - **Beacon.** Only `terrain-tools` knows where a lodestone beacon waits, so it provides it
 *   (`liveBeacon.ts`) and every answer hears it in `ctx.beacon` (ticket 326), never by an import.
 * - **No unlocks.** A hook never registers an unlock id: the seal refuses an id naming a row of the
 *   locked schedule, as report rows are refused (#146).
 *
 * With nothing registered every lane plays exactly as before.
 */
import type { AuthorityState } from '../authority/authorityState'
import { ECONOMY } from '../economy/economy'
import { cappedScalarOf, rankedBySummedScore } from '../economy/itemHookCaps'
import { LOCKED_SCHEDULE, unlockIdNamedIn } from '../unlocks/unlockSchedule'
import type { TilePoint } from '../world/tileGrid'
import { liveBeaconOf, type LiveBeacon } from './liveBeacon'
import { defineRegistry, entriesOf, type SealedRegistration } from './seal'

export type SelectionHookPoint = 'targetOrder' | 'dragTarget' | 'aim'
export type ScalarHookPoint = 'reach' | 'autoFire' | 'tow' | 'twist'
export type ItemHookPoint = SelectionHookPoint | ScalarHookPoint

export const ITEM_HOOK_POINTS: readonly ItemHookPoint[] = [
  'targetOrder',
  'dragTarget',
  'reach',
  'aim',
  'autoFire',
  'tow',
  'twist',
]

/**
 * What a lane tells a hook at its decision point: integers and tiles only, no float, no dig
 * number. A lane that needs another field adds it here as an integer or a tile; `beacon` is the
 * one field the registry adds itself.
 */
export interface ItemHookContext {
  tick: number
  /** The parent item's Mark acting now. */
  mark: number
  /** The parent item's magnitude at that Mark, in the lane's own whole units. */
  magnitude: number
  origin: TilePoint
  /** The tiles a selection point ranks, in the lane's own order; empty at a scalar point. */
  candidates: readonly TilePoint[]
  /** The player's live lodestone beacon on this planet, set by the registry; absent with none. */
  beacon?: LiveBeacon
}

interface ItemHookFields {
  /** `<slice>.<name>`. */
  id: string
  /** The lane slice whose decision point consults it. */
  laneId: string
  /** The lane item whose play it changes. */
  parentItemId: string
  /** The item whose income cap any yield it adds counts toward; absent for a hook with no yield. */
  incomeItemId?: string
}

export interface SelectionItemHook extends ItemHookFields {
  hook: SelectionHookPoint
  /** One integer score per `ctx.candidates` tile, in that order; null to say nothing. */
  answer(state: AuthorityState, playerId: string, ctx: ItemHookContext): readonly number[] | null
}

export interface ScalarItemHook extends ItemHookFields {
  hook: ScalarHookPoint
  /** Whole cells or bp added to the lane's own value; null to say nothing. */
  answer(state: AuthorityState, playerId: string, ctx: ItemHookContext): number | null
}

export type ItemHook = SelectionItemHook | ScalarItemHook

interface ItemHookAsk {
  parentItemId: string
  ctx: ItemHookContext
}

export interface SelectionHookAsk extends ItemHookAsk {
  point: SelectionHookPoint
}

/** A reach is held to `reachCellsMax` and any lower ceiling; the other points to the lane's. */
export type ScalarHookAsk = ItemHookAsk & {
  /** The lane's own value before any hook. */
  base: number
} & (
    | { point: 'reach'; ceiling?: number }
    | { point: Exclude<ScalarHookPoint, 'reach'>; ceiling: number }
  )

const SCALAR_POINTS: ReadonlySet<ItemHookPoint> = new Set(['reach', 'autoFire', 'tow', 'twist'])

export const ITEM_HOOK_REGISTRY = defineRegistry<ItemHook>('itemHooks', itemHookSealProblemOf)

/** The lane's value after every answering hook, clamped once; exactly `base` when none answers. */
export function scalarHookValueOf(
  state: AuthorityState,
  playerId: string,
  ask: ScalarHookAsk,
): number {
  const answers = scalarAnswersOf(state, playerId, ask)
  if (answers.length === 0) return ask.base
  return cappedScalarOf(ask.base, answers, scalarCapOf(ask))
}

/** The lane's candidates, highest summed score first, then in its own order; none added or lost. */
export function rankedCandidatesOf(
  state: AuthorityState,
  playerId: string,
  ask: SelectionHookAsk,
): TilePoint[] {
  return rankedBySummedScore(ask.ctx.candidates, selectionAnswersOf(state, playerId, ask))
}

function scalarAnswersOf(state: AuthorityState, playerId: string, ask: ScalarHookAsk): number[] {
  const hooks = hooksAt(ask.point, ask.parentItemId).filter(isScalarHook)
  const ctx = heardContextOf(state, playerId, ask.ctx, hooks)
  return hooks
    .map((hook) => hook.answer(state, playerId, ctx))
    .filter((answer): answer is number => answer !== null)
}

function selectionAnswersOf(
  state: AuthorityState,
  playerId: string,
  ask: SelectionHookAsk,
): (readonly number[])[] {
  const hooks = hooksAt(ask.point, ask.parentItemId).filter(isSelectionHook)
  const ctx = heardContextOf(state, playerId, ask.ctx, hooks)
  return hooks
    .map((hook) => hook.answer(state, playerId, ctx))
    .filter((answer): answer is readonly number[] => answer !== null)
}

/** The lane's context plus the player's live beacon; the beacon is read only when a hook listens. */
function heardContextOf(
  state: AuthorityState,
  playerId: string,
  ctx: ItemHookContext,
  hooks: readonly ItemHook[],
): ItemHookContext {
  const beacon = hooks.length === 0 ? null : liveBeaconOf(state, playerId)
  return beacon === null ? ctx : { ...ctx, beacon }
}

function scalarCapOf(ask: ScalarHookAsk): number {
  if (ask.point !== 'reach') return ask.ceiling
  return Math.min(ECONOMY.itemHookCaps.reachCellsMax, ask.ceiling ?? Number.MAX_SAFE_INTEGER)
}

/** The hooks on one point of one lane item, sorted by `(hook, laneId, parentItemId, id)`. */
function hooksAt(point: ItemHookPoint, parentItemId: string): ItemHook[] {
  return entriesOf(ITEM_HOOK_REGISTRY)
    .filter((hook) => hook.hook === point && hook.parentItemId === parentItemId)
    .sort(compareHookOrder)
}

function compareHookOrder(a: ItemHook, b: ItemHook): number {
  return compareCodeUnits(a.laneId, b.laneId) || compareCodeUnits(a.id, b.id)
}

function compareCodeUnits(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

function isScalarHook(hook: ItemHook): hook is ScalarItemHook {
  return SCALAR_POINTS.has(hook.hook)
}

function isSelectionHook(hook: ItemHook): hook is SelectionItemHook {
  return !SCALAR_POINTS.has(hook.hook)
}

/** A hook on no known point, or one whose id names an unlock row; null when every hook is sound. */
function itemHookSealProblemOf(
  registrations: readonly SealedRegistration<ItemHook>[],
): string | null {
  const problems = registrations.flatMap(({ entry }) => problemsOfHook(entry))
  return problems.length === 0 ? null : problems.join('; ')
}

function problemsOfHook(hook: ItemHook): string[] {
  const unlockId = unlockIdNamedIn(LOCKED_SCHEDULE, hook.id)
  return [
    ...(ITEM_HOOK_POINTS.includes(hook.hook) ? [] : [`"${hook.id}" hooks no point "${hook.hook}"`]),
    ...(unlockId === undefined ? [] : [`"${hook.id}" names the unlock id "${unlockId}"`]),
  ]
}
