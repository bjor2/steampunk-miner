/**
 * Reads the HUD's drawn boxes off the page (#500 TD shape 4.1): every element a selector finds,
 * with its `getBoundingClientRect` box and the id its attribute names. The hint chip's room (#500)
 * and the coverage overlay (ticket 682) measure through it, so both see the same boxes.
 */
import type { ScreenBox } from '../../systems/views/hudClearView'
import type { MeasuredHudBox } from '../../systems/views/hudCoverageReport'

/** Every drawn element the selector finds, with its box; a hidden one has no area and is left out. */
export function measuredBoxesOf(selector: string, attribute: string): MeasuredHudBox[] {
  return [...document.querySelectorAll(selector)]
    .map((element) => ({ ...boxOf(element), id: element.getAttribute(attribute) ?? '' }))
    .filter((box) => box.right > box.left && box.bottom > box.top)
}

export function boxOf(element: Element): ScreenBox {
  const { left, top, right, bottom } = element.getBoundingClientRect()
  return { left, top, right, bottom }
}
