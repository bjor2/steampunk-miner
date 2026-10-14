/**
 * The artefact slice's registration (ticket 329 as 206c, spec #162; GD lock on #206): the three
 * twists as cache cards (`artefactOption`, shown once the base item is owned), their `twist`
 * answers on the echo sounder, the grapple winch and the ore-shifter (`itemHook`), and their item
 * cards. The slice is named for the `artefact.` ids the twists keep (#162), so they register with
 * the slice prefix. No lane slice is imported. No side effects at import; the loader calls
 * `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { TWIST_CARDS } from './systems/twistCards'
import { TWIST_HOOKS } from './systems/twistHooks'
import { TWIST_OPTIONS } from './systems/twistOptions'

export const slice: SliceDefinition = {
  id: 'artefact',
  register(r) {
    TWIST_OPTIONS.forEach((option) => r.artefactOption(option))
    TWIST_HOOKS.forEach((hook) => r.itemHook(hook))
    r.itemDescriptionEntries(TWIST_CARDS)
  },
}
