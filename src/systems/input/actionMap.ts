/**
 * The rebindable action map (decision #33 sections 2 and 3, the version 2 table of #40): the
 * defaults ship as data in `src/data/input/actions.json`, the player's overrides are a sparse
 * `{ actionId: { keyboard?, gamepad? } }` map in the local preferences file. Device-agnostic:
 * every rule here speaks of action ids, and a key or a pad button (ticket 346, beside `keyboard`
 * as #33 left room for) is only one device's way to press one. The pad table is optional in an
 * override, so a version 2 file written before it reads unchanged and `inputMapVersion` stays 2.
 *
 * Overrides are refused, never trimmed (the #11 rule): the whole override is checked, every
 * problem is listed, and any problem leaves the defaults in force. A reserved code (`Escape`, and
 * the pad's `PadStart`) cannot be bound by an override, and an action that has it by default
 * keeps it, so Escape and Start always close the top layer.
 */
import SHIPPED_ACTION_MAP from '../../data/input/actions.json'
import { BINDING_DEVICES, deviceBindingProblems, type BindingField } from './bindingDevices'
import { keyLabelOf } from './keyCodes'
import { padLabelOf } from './padCodes'

export const INPUT_CONTEXTS = [
  'vehicle',
  'platform',
  'artefact',
  'settings',
  'pause',
  'screen',
  'sheet',
  'title',
] as const

/**
 * `vehicle` while driving, `platform` on the dock screen, `settings` on the overlay (#33),
 * `artefact` while the cache's three cards are open (#46), `screen` while a slice's full screen is
 * (ticket 211), `sheet` while the base sheet is (ticket 686), `pause` while the pause menu is
 * (ticket 404), `title` while the title menu is (ticket 403).
 */
export type InputContext = (typeof INPUT_CONTEXTS)[number]

/** The action ids the game's rules name; the data file must list exactly these. */
export const ACTION_IDS = [
  'aim_left',
  'aim_right',
  'aim_down',
  'lift',
  'interact',
  'quick_service',
  'request_rescue',
  'toggle_guns',
  // The bore gun's auto mode (ticket 317, #310): answered once the steam sear is researched.
  'toggle_auto_fire',
  // The bore gun's fire (ticket 345, the #314 TD lock section 2): a press routed to the ground-gun
  // slice's input reaction; the slice reads `isActionDown`/`pressCountOf` for repeat-fire.
  'fire_ground_gun',
  'plant_charge',
  'next_charge_size',
  'ui_up',
  'ui_down',
  'ui_left',
  'ui_right',
  'ui_confirm',
  'ui_cancel',
  'zoom_in',
  'zoom_out',
  'zoom_reset',
  // Escape or Start while driving (ticket 404): the pause menu, which holds Settings.
  'open_pause_menu',
  // The power-up slots (#162, #217): only the slices' input reactions answer them.
  'use_slot_1',
  'use_slot_2',
  'use_slot_3',
  'use_slot_4',
  'use_slot_5',
  // The drill sockets' gear (#205 GD lock Q1 a): drill-gear's input reactions answer them.
  'use_drill_flank',
  'use_drill_collar',
] as const

export type ActionId = (typeof ACTION_IDS)[number]

/** `hold` actions shape the vehicle intent while held; `press` actions fire once per press. */
export type ActionKind = 'hold' | 'press'

export interface ActionDef {
  id: ActionId
  displayName: string
  contexts: readonly InputContext[]
  kind: ActionKind
  keyboard: readonly string[]
  /** Pad codes and `PadLB+` chords (`padCodes.ts`), ticket 346. */
  gamepad: readonly string[]
}

export interface ActionMap {
  inputMapVersion: number
  reservedKeys: readonly string[]
  actions: readonly ActionDef[]
}

/** One device's chords in force for each action: the keys, or the pad's buttons. */
export type Bindings = Readonly<Record<ActionId, readonly string[]>>

export type ActionOverride = Partial<Record<BindingField, readonly string[]>>

/** The player's sparse rebinding (#33 section 3), as the preferences file holds it. */
export type BindingOverrides = Readonly<Partial<Record<ActionId, ActionOverride>>>

export interface BindingsOutcome {
  bindings: Bindings
  padBindings: Bindings
  /** Empty when the overrides are in force; otherwise every problem, and the defaults rule. */
  problems: string[]
}

/** 2 since #40: `W` lifts, `Space` docks, `aim_up` and the panel jumps are gone. */
export const INPUT_MAP_VERSION = 2

const BINDING_FIELDS: readonly BindingField[] = BINDING_DEVICES.map((device) => device.field)

export const ACTION_MAP: ActionMap = loadShippedActionMap()

/** Every problem in a raw action map file; empty when it can be used as it is. */
export function actionMapProblems(raw: unknown): string[] {
  if (!isRecord(raw)) return ['the action map must be an object']
  const actions = Array.isArray(raw.actions) ? raw.actions : []
  return [
    ...(raw.inputMapVersion === INPUT_MAP_VERSION
      ? []
      : [`inputMapVersion must be ${INPUT_MAP_VERSION}`]),
    ...(isStringList(raw.reservedKeys) ? [] : ['reservedKeys must be a list of key codes']),
    ...(Array.isArray(raw.actions) ? [] : ['actions must be a list']),
    ...actions.flatMap((action, index) => actionDefProblems(action, `actions[${index}]`)),
    ...actionIdSetProblems(actions),
    ...(actions.every(isActionDefShape) ? bindingProblems(raw as unknown as ActionMap) : []),
  ]
}

/** The keys each action has in the map. */
export function defaultBindings(map: ActionMap): Bindings {
  return bindingsOfField(map.actions, 'keyboard')
}

/** The pad chords each action has in the map. */
export function defaultPadBindings(map: ActionMap): Bindings {
  return bindingsOfField(map.actions, 'gamepad')
}

/** The bindings an override gives, or the defaults and every problem when it is refused. */
export function bindingsWithOverrides(map: ActionMap, overrides: unknown): BindingsOutcome {
  const problems = overrideProblems(map, overrides)
  const actions =
    problems.length > 0 ? map.actions : withOverrides(map, overrides as BindingOverrides)
  return {
    bindings: bindingsOfField(actions, 'keyboard'),
    padBindings: bindingsOfField(actions, 'gamepad'),
    problems,
  }
}

/** Every problem with an override: its shape, its ids and keys, then the bindings it would give. */
export function overrideProblems(map: ActionMap, overrides: unknown): string[] {
  if (!isRecord(overrides)) return ['binding overrides must be an object of action ids']
  const shapeProblems = Object.entries(overrides).flatMap(([id, override]) =>
    overrideEntryProblems(map, id, override),
  )
  if (shapeProblems.length > 0) return shapeProblems
  return bindingProblems({ ...map, actions: withOverrides(map, overrides as BindingOverrides) })
}

/** The actions a chord presses in one context, in the map's order. */
export function actionsOfChord(
  map: ActionMap,
  bindings: Bindings,
  context: InputContext,
  chord: string,
): ActionId[] {
  return map.actions
    .filter((action) => action.contexts.includes(context) && bindings[action.id].includes(chord))
    .map((action) => action.id)
}

/** The first key bound to an action, as the player reads it (#33: hints print this). */
export function boundLabel(bindings: Bindings, actionId: ActionId): string {
  const first = bindings[actionId][0]
  return first === undefined ? 'unbound' : keyLabelOf(first)
}

/** The first pad chord bound to an action, as the player reads it. */
export function boundPadLabel(padBindings: Bindings, actionId: ActionId): string {
  const first = padBindings[actionId][0]
  return first === undefined ? 'unbound' : padLabelOf(first)
}

export function actionDefOf(map: ActionMap, actionId: ActionId): ActionDef {
  const action = map.actions.find((candidate) => candidate.id === actionId)
  if (action === undefined) throw new Error(`the action map has no ${actionId}`)
  return action
}

export function isActionId(value: unknown): value is ActionId {
  return (ACTION_IDS as readonly unknown[]).includes(value)
}

function loadShippedActionMap(): ActionMap {
  const problems = actionMapProblems(SHIPPED_ACTION_MAP)
  if (problems.length > 0) throw new Error(`actions.json refused: ${problems.join('; ')}`)
  return SHIPPED_ACTION_MAP as unknown as ActionMap
}

function bindingsOfField(actions: readonly ActionDef[], field: BindingField): Bindings {
  return Object.fromEntries(actions.map((action) => [action.id, action[field]])) as Bindings
}

function withOverrides(map: ActionMap, overrides: BindingOverrides): ActionDef[] {
  return map.actions.map((action) => {
    const override = overrides[action.id]
    if (override === undefined) return action
    return { ...action, ...overriddenFields(map, action, override) }
  })
}

/** Each device the override names gets its chords, plus the reserved ones the action had. */
function overriddenFields(map: ActionMap, action: ActionDef, override: ActionOverride) {
  return Object.fromEntries(
    BINDING_DEVICES.filter(({ field }) => override[field] !== undefined).map(({ field }) => [
      field,
      [...(override[field] ?? []), ...reservedCodesOf(map, action[field])],
    ]),
  )
}

function reservedCodesOf(map: ActionMap, chords: readonly string[]): string[] {
  return chords.filter((chord) => map.reservedKeys.includes(chord))
}

/** Every device's unknown codes, empty actions and same-context duplicates, keys first. */
function bindingProblems(map: ActionMap): string[] {
  return BINDING_DEVICES.flatMap((device) =>
    deviceBindingProblems(map.actions, INPUT_CONTEXTS, device),
  )
}

function overrideEntryProblems(map: ActionMap, id: string, override: unknown): string[] {
  if (!isActionId(id)) return [`${JSON.stringify(id)} is not an action id`]
  if (
    !isRecord(override) ||
    !BINDING_FIELDS.every((field) => isStringList(override[field] ?? []))
  ) {
    return [`${id}: an override is { keyboard?: [key codes], gamepad?: [pad codes] }`]
  }
  const extraFields = Object.keys(override).filter((field) => !isBindingField(field))
  const chords = BINDING_FIELDS.flatMap((field) => (override[field] ?? []) as readonly string[])
  return [
    ...extraFields.map((field) => `${id}: unknown override field ${JSON.stringify(field)}`),
    ...chords
      .filter((chord) => map.reservedKeys.includes(chord))
      .map((chord) => `${id}: ${chord} is reserved and cannot be rebound`),
  ]
}

function isBindingField(field: string): boolean {
  return (BINDING_FIELDS as readonly string[]).includes(field)
}

function actionDefProblems(action: unknown, path: string): string[] {
  if (!isRecord(action)) return [`${path} must be an object`]
  return [
    ...(typeof action.id === 'string' ? [] : [`${path}.id must be a string`]),
    ...(typeof action.displayName === 'string' && action.displayName !== ''
      ? []
      : [`${path}.displayName must be a non-empty string`]),
    ...(isContextList(action.contexts) ? [] : [`${path}.contexts must list input contexts`]),
    ...(action.kind === 'hold' || action.kind === 'press'
      ? []
      : [`${path}.kind must be hold or press`]),
    ...(isStringList(action.keyboard) ? [] : [`${path}.keyboard must be a list of key codes`]),
    ...(isStringList(action.gamepad) ? [] : [`${path}.gamepad must be a list of pad codes`]),
  ]
}

function actionIdSetProblems(actions: readonly unknown[]): string[] {
  const ids = actions.map((action) => (isRecord(action) ? action.id : undefined))
  return [
    ...ACTION_IDS.filter((id) => ids.filter((listed) => listed === id).length !== 1).map(
      (id) => `${id} must be listed exactly once`,
    ),
    ...ids.filter((id) => !isActionId(id)).map((id) => `${JSON.stringify(id)} is not an action id`),
  ]
}

function isActionDefShape(action: unknown): boolean {
  return actionDefProblems(action, '').length === 0 && isActionId((action as ActionDef).id)
}

function isContextList(value: unknown): boolean {
  const contexts: readonly unknown[] = INPUT_CONTEXTS
  return Array.isArray(value) && value.length > 0 && value.every((item) => contexts.includes(item))
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
