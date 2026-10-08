/**
 * What a slice's pressed action does (#217, the #200 seam lock): an action the kernel's fixed
 * routing table has no rule for in the top layer, such as `use_slot_1`, asks these in id order;
 * the first command intent is submitted. A null intent (an empty or locked slot) does nothing and
 * is not buffered. With nothing registered, routing is what it was.
 *
 * A pressed action coming up (ticket 332, the TD ruling on #285) asks the reactions that declare
 * `toReleaseIntent`, whatever the layer now is: a key released after docking must still release
 * what it pressed. A null release intent sends nothing, so an action with none is silent on its
 * way up, as it always was.
 */
import type { CommandIntent } from '../authority/authorityCommand'
import type { ActionId, InputContext } from '../input/actionMap'
import type { InputSituation } from '../input/inputRouting'
import { defineRegistry, entriesOf } from './seal'

export interface InputReactionEntry {
  id: string
  actionId: ActionId
  contexts: readonly InputContext[]
  toIntent(situation: InputSituation): CommandIntent | null
  /** What the action coming up sends, or null for nothing; absent for a press-only action. */
  toReleaseIntent?(situation: InputSituation): CommandIntent | null
}

export const INPUT_REACTION_REGISTRY = defineRegistry<InputReactionEntry>('inputReactions')

/** The first intent a slice gives for the action in the situation's layer, or null. */
export function sliceIntentOfPress(
  action: ActionId,
  situation: InputSituation,
): CommandIntent | null {
  for (const entry of reactionsTo(action, situation.layer)) {
    const intent = entry.toIntent(situation)
    if (intent !== null) return intent
  }
  return null
}

/** The first intent a slice gives for the action coming up, in any layer, or null. */
export function sliceIntentOfRelease(
  action: ActionId,
  situation: InputSituation,
): CommandIntent | null {
  for (const entry of releaseReactionsTo(action)) {
    const intent = entry.toReleaseIntent?.(situation) ?? null
    if (intent !== null) return intent
  }
  return null
}

function releaseReactionsTo(action: ActionId): InputReactionEntry[] {
  return entriesOf(INPUT_REACTION_REGISTRY).filter(
    (entry) => entry.actionId === action && entry.toReleaseIntent !== undefined,
  )
}

function reactionsTo(action: ActionId, layer: InputContext): InputReactionEntry[] {
  return entriesOf(INPUT_REACTION_REGISTRY).filter(
    (entry) => entry.actionId === action && entry.contexts.includes(layer),
  )
}
