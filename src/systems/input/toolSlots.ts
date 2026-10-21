/**
 * The tool slot bar's rows as rules (spec #678 HS kinds, ticket 691; the G&V and GD rulings on
 * #691): every active tool is a row with a fixed bar position, the action a key or a tap presses
 * and a pure read of what its cell shows. A row is a touch binding too (#474), so the coverage and
 * seal rules of `touchBindings.ts` hold for it. The kernel's own rows are Plant charge and the
 * guns toggle, which left the touch cluster for the bar; the slices register the rest (the
 * power-up slots and drill sockets, the bore gun). A new tool adds a row, never a layout.
 *
 * Positions are fixed: on desktop cell n is pressed by Digit n, so a row at a hotkey position
 * must carry that key. Nothing here touches the DOM or the store.
 */
import { vehicleOf, type AuthorityState } from '../authority/authorityState'
import { chargesOf } from '../authority/charges/chargeRules'
import { hudLabelIconIdOf } from '../art/icons/iconSet'
import { isGunOnAuto, mountedGunModeOf } from '../vehicle/vehicleGun'
import { ACTION_MAP, actionDefOf, type ActionId, type ActionMap } from './actionMap'
import type { TouchBindingRule } from './touchBindings'

/** What one cell shows: an icon and a cooldown ring, never text; charges as a badge past one. */
export interface ToolFace {
  iconId: string
  /** The tool's name, for assistive tech only (no text is drawn). */
  name: string
  /** The share of the cooldown still to run, in whole percent: 0 when ready. */
  cooldownPercent: number
  /** Charges left and the most it holds; 0 and 0 for a tool without charges. */
  chargesLeft: number
  chargesMax: number
  /** Toggled on (the guns on auto, a toggle power-up running). */
  isOn: boolean
  /** Winding up or channelling now. */
  isActing: boolean
}

export interface ToolSlotRule<F extends ToolFace = ToolFace> extends TouchBindingRule {
  /** The bar position, 1 first: the order on a phone and the fixed cell on desktop. */
  position: number
  /** What the cell shows now, or null while the tool cannot be pressed (unowned, empty slot). */
  faceOf(state: AuthorityState, playerId: string): F | null
}

/** The last bar position a number key reaches (Digit1-Digit8, the HS's desktop slots). */
export const HOTKEY_POSITIONS_MAX = 8

/** After the slices' positions (power-up slots 1-7, the bore gun 8): desktop overflow on. */
const PLANT_CHARGE_POSITION = 9
const TOGGLE_GUNS_POSITION = 10

const NO_COOLDOWN = { cooldownPercent: 0, chargesLeft: 0, chargesMax: 0, isActing: false }

/** Plant charge and the guns toggle, moved off the touch cluster (G&V ruling on #691, option 1). */
export const KERNEL_TOOL_SLOT_RULES: readonly ToolSlotRule[] = [
  {
    id: 'kernel.tool_plant_charge',
    anchor: 'kernel',
    touch: { gesture: 'tap', action: 'plant_charge' },
    position: PLANT_CHARGE_POSITION,
    faceOf: plantChargeFaceOf,
  },
  {
    id: 'kernel.tool_toggle_guns',
    anchor: 'kernel',
    touch: { gesture: 'tap', action: 'toggle_guns' },
    position: TOGGLE_GUNS_POSITION,
    faceOf: toggleGunsFaceOf,
  },
]

/** The action a cell presses: the row's touch action. */
export function actionOfToolRule(rule: ToolSlotRule): ActionId {
  const { action } = rule.touch
  if (action === undefined) throw new Error(`tool slot "${rule.id}" presses no action`)
  return action
}

/** The number key that presses a bar position, or null past the hotkey positions. */
export function hotkeyOfPosition(position: number): string | null {
  const isHotkeyed = position >= 1 && position <= HOTKEY_POSITIONS_MAX
  return isHotkeyed ? `Digit${position}` : null
}

/** Why one row breaks the bar's rules; empty when it keeps them. */
export function toolSlotRuleProblemsOf(rule: ToolSlotRule, map: ActionMap): string[] {
  const problems = [
    ...positionProblems(rule.position),
    ...pressProblems(rule),
    ...hotkeyProblems(rule, map),
  ]
  return problems.map((problem) => `tool slot "${rule.id}" ${problem}`)
}

/** Every position two rows share, as a problem each. */
export function sharedPositionProblemsOf(rules: readonly ToolSlotRule[]): string[] {
  return rules
    .filter((rule, index) => rules.findIndex((other) => other.position === rule.position) < index)
    .map((rule) => `tool slot "${rule.id}" takes position ${rule.position}, already taken`)
}

function positionProblems(position: number): string[] {
  return Number.isSafeInteger(position) && position >= 1
    ? []
    : [`has position ${position}; positions are whole numbers from 1`]
}

function pressProblems(rule: ToolSlotRule): string[] {
  const { gesture, action } = rule.touch
  if (gesture === 'none' || action === undefined) return ['presses no action']
  return []
}

function hotkeyProblems(rule: ToolSlotRule, map: ActionMap): string[] {
  const hotkey = hotkeyOfPosition(rule.position)
  const { action } = rule.touch
  if (hotkey === null || action === undefined) return []
  if (actionDefOf(map, action).keyboard.includes(hotkey)) return []
  return [`sits at position ${rule.position}, but ${hotkey} does not press "${action}"`]
}

function plantChargeFaceOf(state: AuthorityState, playerId: string): ToolFace | null {
  if (!chargesOf(state, playerId).isRackMounted) return null
  return {
    iconId: hudLabelIconIdOf('charges'),
    name: nameOf('plant_charge'),
    isOn: false,
    ...NO_COOLDOWN,
  }
}

function toggleGunsFaceOf(state: AuthorityState, playerId: string): ToolFace | null {
  const { gun } = vehicleOf(state, playerId)
  if (mountedGunModeOf(gun) === null) return null
  return {
    iconId: hudLabelIconIdOf('guns'),
    name: nameOf('toggle_guns'),
    isOn: isGunOnAuto(gun),
    ...NO_COOLDOWN,
  }
}

function nameOf(action: ActionId): string {
  return actionDefOf(ACTION_MAP, action).displayName
}
