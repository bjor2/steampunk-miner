/**
 * The HUD's texts on the shared Title+OneLine element (spec #422, pass #428). A readout is its
 * label as the title, its value drawn beside it. A call-out (a warning, a prompt, the fuse) is
 * one model sentence, "LOW ENERGY: head for the platform": the words before its first `: ` or
 * ` — ` become the title, the rest the one line, so no word of the model's text is cut or
 * changed. The HUD lets every click through to the canvas, so no tooltip could open there: its
 * elements carry none, and the element shows all it says.
 */
import type { ElementText } from './uiText'

/** Statuses whose words another banner call-out already draws: the fuse, low energy, the tow. */
const STATUSES_SAID_ELSEWHERE: ReadonlySet<string> = new Set(['fuse', 'low_energy', 'tow'])

/** Where a call-out's title ends and its one line starts: the model's own separators. */
const CALLOUT_SEPARATOR = /: | — /

/** A readout titled by its label, with no line under it and no tooltip. */
export function readoutTextOf(id: string, label: string): ElementText {
  return { id, title: label, oneLine: '', tooltipLines: [] }
}

/**
 * A status icon's words beside it (ticket 476: they were its hover title, which touch never
 * shows), a call-out like any other; null when another banner call-out already says them.
 */
export function statusLabelTextOf(status: { id: string; text: string }): ElementText | null {
  if (STATUSES_SAID_ELSEWHERE.has(status.id)) return null
  return calloutTextOf(`hud.status.${status.id}`, status.text)
}

/** A call-out split at its first separator; a text with none is a title alone. */
export function calloutTextOf(id: string, text: string): ElementText {
  const match = CALLOUT_SEPARATOR.exec(text)
  if (match === null) return readoutTextOf(id, text)
  const title = text.slice(0, match.index)
  return { id, title, oneLine: text.slice(match.index + match[0].length), tooltipLines: [] }
}
