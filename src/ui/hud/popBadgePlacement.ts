/**
 * Option B's count badges (ticket 616, the VS condition 1 on #442): each frame, after the camera
 * moved, every merged pop the spray layer drew gets a badge over it showing how many cells it
 * holds; the rest of the badges hide. Written through refs and CSS transforms, never React state,
 * and the text is rewritten only when a badge's count changes, so a frame allocates nothing else.
 */
import { popBadgePresence } from '../../scene/popBadgePresence'
import { popBadgeTextOf } from '../../systems/materialPop/popLook'
import {
  createScreenPlacement,
  placeAtWorldPoint,
  type ScreenPlacement,
} from '../projection/screenPlacement'

export interface PopBadgeBoard {
  placements: ScreenPlacement[]
  /** The count each badge shows now; 0 while hidden. */
  shown: Uint16Array
  point: { x: number; y: number }
}

export function createPopBadgeBoard(slots: number): PopBadgeBoard {
  const placements = Array.from({ length: slots }, createScreenPlacement)
  return { placements, shown: new Uint16Array(slots), point: { x: 0, y: 0 } }
}

export function placePopBadges(
  elements: readonly (HTMLElement | null)[],
  board: PopBadgeBoard,
): void {
  elements.forEach((element, at) => {
    if (element === null) return
    if (at < popBadgePresence.count) showBadge(element, board, at)
    else hideBadge(element, board, at)
  })
}

function showBadge(element: HTMLElement, board: PopBadgeBoard, at: number): void {
  const cells = popBadgePresence.cells[at]
  if (board.shown[at] !== cells) element.textContent = popBadgeTextOf(cells)
  board.shown[at] = cells
  board.point.x = popBadgePresence.x[at]
  board.point.y = popBadgePresence.y[at]
  placeAtWorldPoint(element, board.placements[at], board.point)
}

function hideBadge(element: HTMLElement, board: PopBadgeBoard, at: number): void {
  if (board.shown[at] === 0) return
  board.shown[at] = 0
  board.placements[at].isShown = false
  element.style.visibility = 'hidden'
}
