/**
 * Keyboard focus on a menu screen (#33 section 6): focus follows reading order, `ui_up`/`ui_left`
 * step back and `ui_down`/`ui_right` forward, wrapping; `ui_prev_panel`/`ui_next_panel` jump to
 * the first control of the panel before or after. UI state only, never a command.
 */

/** One focusable control, in reading order, and the panel it sits in. */
export interface FocusStop {
  id: string
  panel: string
}

/** The focused id if it is still on screen, else the screen's starting control. */
export function focusOnScreen(
  stops: readonly FocusStop[],
  focusedId: string | null,
  startId: string,
): string {
  return stops.some((stop) => stop.id === focusedId) ? (focusedId as string) : startId
}

export function stepFocus(stops: readonly FocusStop[], focusedId: string, step: -1 | 1): string {
  if (stops.length === 0) return focusedId
  const index = stops.findIndex((stop) => stop.id === focusedId)
  return stops[wrap(index + step, stops.length)].id
}

export function jumpFocusToPanel(
  stops: readonly FocusStop[],
  focusedId: string,
  step: -1 | 1,
): string {
  const panels = [...new Set(stops.map((stop) => stop.panel))]
  if (panels.length === 0) return focusedId
  const current = stops.find((stop) => stop.id === focusedId)?.panel ?? panels[0]
  const target = panels[wrap(panels.indexOf(current) + step, panels.length)]
  return stops.find((stop) => stop.panel === target)?.id ?? focusedId
}

function wrap(index: number, length: number): number {
  return ((index % length) + length) % length
}
