/**
 * The devices a binding names (#33 section 2; ticket 346 adds the pad): each action lists its
 * chords per device in its own field, `keyboard` or `gamepad`, and the same rules hold for every
 * device. A chord must be one the device knows, an action needs at least one, and two actions live
 * in one context never share one. Device-agnostic on purpose, so a key and a pad button are
 * checked, rebound and refused alike.
 */
import { isKnownKeyChord } from './keyCodes'
import { isKnownPadChord } from './padCodes'

export type BindingField = 'keyboard' | 'gamepad'

export interface BindingDevice {
  field: BindingField
  isKnownChord(chord: unknown): boolean
  /** How a problem names one chord: "is not a known key code". */
  codeNoun: string
  /** How a problem names a missing binding: "has no key bound". */
  boundNoun: string
}

export const BINDING_DEVICES: readonly BindingDevice[] = [
  { field: 'keyboard', isKnownChord: isKnownKeyChord, codeNoun: 'key code', boundNoun: 'key' },
  {
    field: 'gamepad',
    isKnownChord: isKnownPadChord,
    codeNoun: 'pad code',
    boundNoun: 'pad button',
  },
]

/** What the checks read of an action: its id, its layers and its chords per device. */
export type BoundAction = { id: string; contexts: readonly string[] } & Readonly<
  Record<BindingField, readonly string[]>
>

/** Unknown chords, an empty action, and one chord on two actions live in one context. */
export function deviceBindingProblems(
  actions: readonly BoundAction[],
  contexts: readonly string[],
  device: BindingDevice,
): string[] {
  return [
    ...actions.flatMap((action) => unknownChordProblems(action, device)),
    ...actions
      .filter((action) => action[device.field].length === 0)
      .map((action) => `${action.id} has no ${device.boundNoun} bound`),
    ...contexts.flatMap((context) => duplicateChordProblems(actions, context, device.field)),
  ]
}

function unknownChordProblems(action: BoundAction, device: BindingDevice): string[] {
  return action[device.field]
    .filter((chord) => !device.isKnownChord(chord))
    .map((chord) => `${action.id}: ${JSON.stringify(chord)} is not a known ${device.codeNoun}`)
}

function duplicateChordProblems(
  actions: readonly BoundAction[],
  context: string,
  field: BindingField,
): string[] {
  const ownerOfChord = new Map<string, string>()
  const problems: string[] = []
  for (const action of actions.filter((candidate) => candidate.contexts.includes(context))) {
    for (const chord of new Set(action[field])) {
      const owner = ownerOfChord.get(chord)
      if (owner !== undefined) problems.push(duplicateProblem(chord, owner, action.id, context))
      else ownerOfChord.set(chord, action.id)
    }
  }
  return problems
}

function duplicateProblem(chord: string, first: string, second: string, context: string): string {
  return `${chord} is bound to both ${first} and ${second} in the ${context} context`
}
