/**
 * The title menu's text on the shared Title+OneLine element (spec #422, pass #429): the game's
 * name heads every page, a save slot is its name with planet and playtime as glyph plus value and
 * its wall time in the tooltip, the New Game confirm is a title, one line and its warning, kept
 * visible, a slot another world generator made carries a warning, and a refused load is a title over its problem lines. No word of ticket 403's copy is
 * lost: the confirm's three sentences are now its title, its line and its warning.
 */
import { HINT_PLAQUE_ICON_ID, hudLabelIconIdOf } from '../../systems/art/icons/iconSet'
import type { TitleSlotRow } from '../../systems/views/titleMenuModel'
import type { ElementText } from '../../systems/views/uiText'
import type { IconValue } from '../kit/TitleOneLine'

export const GAME_NAME_TEXT: ElementText = {
  id: 'title.game',
  title: 'Steampunk Miner',
  oneLine: '',
  tooltipLines: [],
}

export const NEW_GAME_CONFIRM_TEXT: ElementText = {
  id: 'title.confirm-new-game',
  title: 'Start new game?',
  oneLine: 'You start again from planet 1; nothing carries over.',
  tooltipLines: [],
}

/** What New Game throws away: a warning, so it stays on the element. */
export const NEW_GAME_FACTS: readonly IconValue[] = [
  {
    iconId: HINT_PLAQUE_ICON_ID,
    text: 'The autosave is replaced at the first checkpoint; named slots stay.',
    holds: 'warning',
  },
]

export const LOAD_REFUSED_TEXT: ElementText = {
  id: 'title.load-refused',
  title: 'Load refused',
  oneLine: '',
  tooltipLines: [],
}

export function titleSlotTextOf(row: TitleSlotRow): ElementText {
  return {
    id: `title.slot.${row.slot}`,
    title: row.name,
    oneLine: '',
    tooltipLines: [`Saved ${row.savedAtText}`],
  }
}

export function titleSlotFactsOf(row: TitleSlotRow): IconValue[] {
  return [
    { iconId: hudLabelIconIdOf('planet'), text: row.planetText },
    { iconId: hudLabelIconIdOf('tile_time'), text: row.playtimeText },
    ...generatorWarningsOf(row),
  ]
}

/** A slot another generator made is flagged before Load is pressed (ticket 670), kept visible. */
function generatorWarningsOf(row: TitleSlotRow): IconValue[] {
  if (row.generatorNote === null) return []
  return [{ iconId: HINT_PLAQUE_ICON_ID, text: row.generatorNote, holds: 'warning' }]
}
