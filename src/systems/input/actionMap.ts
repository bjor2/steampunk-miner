/**
 * The rebindable action map (decision #33 sections 2 and 3, the version 2 table of #40, gamepad
 * ruled out of the slice on #33): the defaults ship as data in `src/data/input/actions.json`, the player's overrides are a
 * sparse `{ actionId: { keyboard } }` map in the local preferences file. Device-agnostic: every
 * rule here speaks of action ids, and a key is only one device's way to press one, so a gamepad
 * table can be added beside `keyboard` later.
 *
 * Overrides are refused, never trimmed (the #11 rule): the whole override is checked, every
 * problem is listed, and any problem leaves the defaults in force. A reserved key (`Escape`)
 * cannot be bound by an override, and an action that has it by default keeps it, so Escape always
 * closes the top layer.
 */
import SHIPPED_ACTION_MAP from '../../data/input/actions.json'
import { isKnownKeyChord, keyLabelOf } from './keyCodes'

export const INPUT_CONTEXTS = ['vehicle', 'platform', 'artefact', 'settings'] as const

/**
 * `vehicle` while driving, `platform` on the dock screen, `settings` on the overlay (#33),
 * `artefact` while the cache's three cards are open (#46).
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
  'ui_up',
  'ui_down',
  'ui_left',
  'ui_right',
  'ui_confirm',
  'ui_cancel',
  'zoom_in',
  'zoom_out',
  'zoom_reset',
  'open_settings',
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
}

export interface ActionMap {
  inputMapVersion: number
  reservedKeys: readonly string[]
  actions: readonly ActionDef[]
}

/** The keyboard chords in force for each action. */
export type Bindings = Readonly<Record<ActionId, readonly string[]>>

export interface ActionOverride {
  keyboard?: readonly string[]
}

/** The player's sparse rebinding (#33 section 3), as the preferences file holds it. */
export type BindingOverrides = Readonly<Partial<Record<ActionId, ActionOverride>>>

export interface BindingsOutcome {
  bindings: Bindings
  /** Empty when the overrides are in force; otherwise every problem, and the defaults rule. */
  problems: string[]
}

/** 2 since #40: `W` lifts, `Space` docks, `aim_up` and the panel jumps are gone. */
export const INPUT_MAP_VERSION = 2

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

export function defaultBindings(map: ActionMap): Bindings {
  return Object.fromEntries(map.actions.map((action) => [action.id, action.keyboard])) as Bindings
}

/** The bindings an override gives, or the defaults and every problem when it is refused. */
export function bindingsWithOverrides(map: ActionMap, overrides: unknown): BindingsOutcome {
  const problems = overrideProblems(map, overrides)
  if (problems.length > 0) return { bindings: defaultBindings(map), problems }
  return { bindings: mergedBindings(map, overrides as BindingOverrides), problems: [] }
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

function mergedBindings(map: ActionMap, overrides: BindingOverrides): Bindings {
  return defaultBindings({ ...map, actions: withOverrides(map, overrides) })
}

function withOverrides(map: ActionMap, overrides: BindingOverrides): ActionDef[] {
  return map.actions.map((action) => {
    const keyboard = overrides[action.id]?.keyboard
    if (keyboard === undefined) return action
    return { ...action, keyboard: [...keyboard, ...reservedKeysOf(map, action)] }
  })
}

function reservedKeysOf(map: ActionMap, action: ActionDef): string[] {
  return action.keyboard.filter((chord) => map.reservedKeys.includes(chord))
}

/** Unknown keys, an empty action, and the same key on two actions live in one context. */
function bindingProblems(map: ActionMap): string[] {
  return [
    ...map.actions.flatMap((action) => unknownKeyProblems(action.id, action.keyboard)),
    ...map.actions
      .filter((action) => action.keyboard.length === 0)
      .map((action) => `${action.id} has no key bound`),
    ...INPUT_CONTEXTS.flatMap((context) => duplicateKeyProblems(map, context)),
  ]
}

function unknownKeyProblems(actionId: string, keys: readonly unknown[]): string[] {
  return keys
    .filter((key) => !isKnownKeyChord(key))
    .map((key) => `${actionId}: ${JSON.stringify(key)} is not a known key code`)
}

function duplicateKeyProblems(map: ActionMap, context: InputContext): string[] {
  const ownerOfKey = new Map<string, string>()
  const problems: string[] = []
  for (const action of map.actions.filter((candidate) => candidate.contexts.includes(context))) {
    for (const key of new Set(action.keyboard)) {
      const owner = ownerOfKey.get(key)
      if (owner !== undefined) problems.push(duplicateKeyProblem(key, owner, action.id, context))
      else ownerOfKey.set(key, action.id)
    }
  }
  return problems
}

function duplicateKeyProblem(key: string, first: string, second: string, context: string): string {
  return `${key} is bound to both ${first} and ${second} in the ${context} context`
}

function overrideEntryProblems(map: ActionMap, id: string, override: unknown): string[] {
  if (!isActionId(id)) return [`${JSON.stringify(id)} is not an action id`]
  if (!isRecord(override) || !isStringList(override.keyboard ?? [])) {
    return [`${id}: an override is { keyboard: [key codes] }`]
  }
  const extraFields = Object.keys(override).filter((field) => field !== 'keyboard')
  const keyboard = (override.keyboard ?? []) as readonly string[]
  return [
    ...extraFields.map((field) => `${id}: unknown override field ${JSON.stringify(field)}`),
    ...keyboard
      .filter((key) => map.reservedKeys.includes(key))
      .map((key) => `${id}: ${key} is reserved and cannot be rebound`),
  ]
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
