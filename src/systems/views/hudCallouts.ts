/**
 * The HUD's texts on the shared Title+OneLine element (spec #422, pass #428). A readout is its
 * label as the title, its value drawn beside it. A call-out (a warning, a prompt, the fuse) is
 * one model sentence, "LOW ENERGY: head for the platform": the words before its first `: ` or
 * ` — ` become the title, the rest the one line, so no word of the model's text is cut or
 * changed. The HUD lets every click through to the canvas, so no tooltip could open there: its
 * elements carry none, and the element shows all it says.
 */
import type { ElementText } from './uiText'

/** Where a call-out's title ends and its one line starts: the model's own separators. */
const CALLOUT_SEPARATOR = /: | — /

/** A readout titled by its label, with no line under it and no tooltip. */
export function readoutTextOf(id: string, label: string): ElementText {
  return { id, title: label, oneLine: '', tooltipLines: [] }
}

/** A call-out split at its first separator; a text with none is a title alone. */
export function calloutTextOf(id: string, text: string): ElementText {
  const match = CALLOUT_SEPARATOR.exec(text)
  if (match === null) return readoutTextOf(id, text)
  const title = text.slice(0, match.index)
  return { id, title, oneLine: text.slice(match.index + match[0].length), tooltipLines: [] }
}
