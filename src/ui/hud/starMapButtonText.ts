/**
 * The words and glyph both star map buttons draw (ticket 792): the action's own name, so the
 * button, the key map and the settings say the same, and the folded chart glyph of the icon set.
 */
import { hudLabelIconIdOf } from '../../systems/art/icons/iconSet'
import { actionDefOf, ACTION_MAP } from '../../systems/input/actionMap'
import { readoutTextOf } from '../../systems/views/hudCallouts'

export const STAR_MAP_TITLE = actionDefOf(ACTION_MAP, 'open_star_map').displayName
export const STAR_MAP_TEXT = readoutTextOf('hud.star-map', STAR_MAP_TITLE)
export const STAR_MAP_ICON_ID = hudLabelIconIdOf('star_map')
