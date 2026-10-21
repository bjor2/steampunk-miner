/**
 * The save menus' copy (#672 ruling (b)): every string the title menu, the pause menu and its
 * Save page show is `ui.saveMenu` data in `src/data/saveMenu/saveMenu.json`, never a literal in a
 * model or an element. A `{name}` in a line is filled from the values its caller passes.
 */
import SAVE_MENU_JSON from '../../data/saveMenu/saveMenu.json'

export type SaveMenuText = typeof SAVE_MENU_JSON

export const SAVE_MENU_TEXT: SaveMenuText = SAVE_MENU_JSON

const PLACEHOLDER = /\{(\w+)\}/g

/** `template` with each `{name}` replaced by `values[name]`; an unknown name stays as written. */
export function fillSaveMenuText(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(PLACEHOLDER, (placeholder, name: string) =>
    name in values ? String(values[name]) : placeholder,
  )
}
