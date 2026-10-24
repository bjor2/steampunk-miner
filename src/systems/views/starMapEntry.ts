/**
 * The star map's way in (ticket 792): Bjor could not find the map on his phone, where its only
 * entry was a faint cluster glyph drawn after the first touch. A phone now shows a labelled button
 * in the HUD's top row from the run's first frame, wherever M opens the map (the vehicle's and the
 * platform's layers, ticket 757); desktop keeps its strip button. Pure.
 */
import { ACTION_MAP, actionDefOf, type InputContext } from '../input/actionMap'

/** The button shows wherever the map's own key works, so a tap and M agree. */
export function isStarMapButtonShown(layer: InputContext): boolean {
  return actionDefOf(ACTION_MAP, 'open_star_map').contexts.includes(layer)
}
