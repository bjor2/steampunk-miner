/**
 * Touch bindings as rules (#474, the HS decision in the TD's section 8 on #470): each touch control
 * is a row naming the action it presses, the gesture that presses it and the anchor it belongs to.
 * The kernel's own controls are rows here (`kernelTouchBindings.ts`); a slice adds its rows through
 * the `touchBindings` registry, so a new item brings its touch affordance with no kernel edit.
 *
 * - **No touch-only action.** A row presses only an action the keyboard can press, in a layer the
 *   action has: touch is one more source for the same recorded input, never a new one.
 * - **No hold-only press.** A hold or drag row on a `press` action names its `tapPath`, the action a
 *   tap on the same control presses. A `hold` action (the four drive actions) is held on the keys
 *   too, so holding it is its keyboard equivalent.
 * - **`none` says why.** A row with no control names its reason, so coverage tells "no control"
 *   from "forgot" (the HS, TD ruling on #470: only for actions, plus the held list).
 * - **Held items register nothing** (the HS list on #470): no row anchors one, so none is drawn.
 * - **Exposure.** A control shows only while its anchor is owned or `FeatureUnlocked`, or, for a
 *   loadout slot, while the slot holds an item. The kernel's own rows answer to their own rules.
 */
import { vehicleOf, type AuthorityState } from '../authority/authorityState'
import { isFeatureUnlocked } from '../authority/featureUnlocks'
import { ownsItem } from '../authority/loadoutRules'
import type { LoadoutSlotId } from '../registries/vehicleLoadout'
import { itemInSlot } from '../vehicle/loadoutState'
import { actionDefOf, type ActionId, type ActionMap, type InputContext } from './actionMap'

export type TouchGesture = 'tap' | 'toggle' | 'hold' | 'drag' | 'none'

export interface TouchBinding {
  gesture: TouchGesture
  /** The action the control presses; on a `none` row, the action left with no control. */
  action?: ActionId
  /** What a tap on the same control presses: required on a hold or drag of a `press` action. */
  tapPath?: ActionId
}

/**
 * What a control belongs to: a `docs/scaling/horizontal/stats.json` row or an item id, owned or
 * `FeatureUnlocked`; a loadout slot, shown while it holds an item; or the kernel's own controls.
 */
export type TouchAnchor = { row: string } | { slot: LoadoutSlotId } | 'kernel'

export interface TouchBindingRule {
  /** `<slice>.<item>`, or `kernel.<control>` for the kernel's own. */
  id: string
  anchor: TouchAnchor
  touch: TouchBinding
  /** The layers the control works in; absent, every layer its action has. */
  contexts?: readonly InputContext[]
  /** Why a `none` row has no control. */
  reason?: string
}

/**
 * Held or unbuilt on #470 (HS): the void sounder and the galvanic probe (GD ruling on #203 Q3), the
 * slurry siphon (extraction ships only the drain) and the `auto_guns` lane (#319).
 */
export const TOUCH_HELD_ANCHOR_IDS: readonly string[] = [
  'power.void_sounder',
  'power.galvanic_probe',
  'power.slurry_siphon',
  'auto_guns',
]

/** Why the row breaks the binding rules against the action map; empty when it keeps them. */
export function touchBindingProblemsOf(rule: TouchBindingRule, map: ActionMap): string[] {
  const problems = [
    ...heldAnchorProblems(rule),
    ...gestureProblems(rule, map),
    ...keyboardEquivalentProblems(rule, map),
  ]
  return problems.map((problem) => `touch binding "${rule.id}" ${problem}`)
}

/** Why a slice's row breaks what only the kernel may do: list a kernel control. */
export function sliceRowProblemsOf(rule: TouchBindingRule): string[] {
  if (rule.anchor !== 'kernel') return []
  return [`touch binding "${rule.id}" anchors the kernel, whose controls only the kernel lists`]
}

/**
 * Why a row that draws no control of its own breaks the rules: it must be `none`, or press an
 * action a kernel control already presses (the plunger rides the cluster's plant button).
 */
export function undrawnRowProblemsOf(
  rule: TouchBindingRule,
  kernelRules: readonly TouchBindingRule[],
): string[] {
  const { gesture, action } = rule.touch
  if (gesture === 'none' || action === undefined) return []
  if (kernelRules.some((kernel) => isControlPressing(kernel, action))) return []
  return [`touch binding "${rule.id}" draws no control, and no kernel control presses "${action}"`]
}

/**
 * Every action with a key, in every layer it has, that no row reaches: neither pressed nor marked
 * `none` with a reason there. Empty when touch reaches everything the keys do.
 */
export function touchCoverageGapsOf(rules: readonly TouchBindingRule[], map: ActionMap): string[] {
  return map.actions
    .filter((action) => action.keyboard.length > 0)
    .flatMap((action) =>
      action.contexts
        .filter((context) => !isReachedOnTouch(rules, map, action.id, context))
        .map((context) => `"${action.id}" has a key in "${context}" but no touch binding`),
    )
}

/** The layers the row's control works in. */
export function contextsOfRule(rule: TouchBindingRule, map: ActionMap): readonly InputContext[] {
  if (rule.contexts !== undefined) return rule.contexts
  return rule.touch.action === undefined ? [] : actionDefOf(map, rule.touch.action).contexts
}

/** Whether the row's control may show for the player now (HS: owned or FeatureUnlocked). */
export function isTouchAnchorExposed(
  state: AuthorityState,
  playerId: string,
  anchor: TouchAnchor,
): boolean {
  if (anchor === 'kernel') return true
  if ('slot' in anchor) return itemInSlot(vehicleOf(state, playerId).loadout, anchor.slot) !== null
  return isFeatureUnlocked(state, anchor.row) || ownsItem(state, playerId, anchor.row)
}

/** The actions the row's control presses: its action and its tap path. */
export function actionsOfRule(rule: TouchBindingRule): ActionId[] {
  return [rule.touch.action, rule.touch.tapPath].filter(
    (action): action is ActionId => action !== undefined,
  )
}

export function isHeldAnchor(anchor: TouchAnchor): boolean {
  return typeof anchor === 'object' && 'row' in anchor && TOUCH_HELD_ANCHOR_IDS.includes(anchor.row)
}

function isReachedOnTouch(
  rules: readonly TouchBindingRule[],
  map: ActionMap,
  action: ActionId,
  context: InputContext,
): boolean {
  return rules.some(
    (rule) => actionsOfRule(rule).includes(action) && contextsOfRule(rule, map).includes(context),
  )
}

function isControlPressing(rule: TouchBindingRule, action: ActionId): boolean {
  return rule.touch.gesture !== 'none' && actionsOfRule(rule).includes(action)
}

function heldAnchorProblems(rule: TouchBindingRule): string[] {
  return isHeldAnchor(rule.anchor) ? ['anchors a held item, and held items register nothing'] : []
}

function gestureProblems(rule: TouchBindingRule, map: ActionMap): string[] {
  const { gesture, action, tapPath } = rule.touch
  if (gesture === 'none') return rule.reason === undefined ? ['is "none" with no reason'] : []
  if (action === undefined) return [`is "${gesture}" but presses no action`]
  if (isHoldOnlyPress(gesture, action, tapPath, map))
    return [`is "${gesture}" on the press "${action}" with no tapPath`]
  return []
}

/** A key press reached on touch only by holding or dragging: the HS's hold-only action. */
function isHoldOnlyPress(
  gesture: TouchGesture,
  action: ActionId,
  tapPath: ActionId | undefined,
  map: ActionMap,
): boolean {
  const isHoldOrDrag = gesture === 'hold' || gesture === 'drag'
  return isHoldOrDrag && tapPath === undefined && actionDefOf(map, action).kind === 'press'
}

function keyboardEquivalentProblems(rule: TouchBindingRule, map: ActionMap): string[] {
  return [
    ...actionsOfRule(rule)
      .filter((action) => actionDefOf(map, action).keyboard.length === 0)
      .map((action) => `presses "${action}", which has no key`),
    ...layerProblems(rule, map),
  ]
}

function layerProblems(rule: TouchBindingRule, map: ActionMap): string[] {
  const action = rule.touch.action
  if (action === undefined || rule.contexts === undefined) return []
  const layers = actionDefOf(map, action).contexts
  return rule.contexts
    .filter((context) => !layers.includes(context))
    .map((context) => `works in "${context}", where "${action}" is never pressed`)
}
