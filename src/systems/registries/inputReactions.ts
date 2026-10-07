/**
 * What a slice's pressed action does (#217, the #200 seam lock): an action the kernel's fixed
 * routing table has no rule for in the top layer, such as `use_slot_1`, asks these in id order;
 * the first command intent is submitted. A null intent (an empty or locked slot) does nothing and
 * is not buffered. With nothing registered, routing is what it was.
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

function reactionsTo(action: ActionId, layer: InputContext): InputReactionEntry[] {
  return entriesOf(INPUT_REACTION_REGISTRY).filter(
    (entry) => entry.actionId === action && entry.contexts.includes(layer),
  )
}
