/**
 * A finger on a tree node (#161 section 4, mobile; X7 of the #157 gap review): held for the #164
 * long-press time it opens the node's card, a shorter press is a tap that does what a click does,
 * and a finger that slides is scrolling the list, so its hold opens nothing. A mouse only clicks.
 * Nothing here touches the DOM or the store.
 */

/**
 * A finger that slid further than this, in CSS px, is scrolling the list, not holding the node.
 * Android's touch slop is 8 dp; 10 px leaves room for a thumb's wobble.
 */
export const NODE_PRESS_SLOP_PX = 10

export interface NodePressPoint {
  pointerType: string
  x: number
  y: number
}

export interface NodePress {
  nodeId: string
  startX: number
  startY: number
}

/** The hold a touch or pen starts on a node; a mouse starts none, its click opens the card. */
export function nodePressStartedOn(nodeId: string, point: NodePressPoint): NodePress | null {
  if (point.pointerType === 'mouse') return null
  return { nodeId, startX: point.x, startY: point.y }
}

export function hasPressSlid(press: NodePress, point: NodePressPoint): boolean {
  const dx = point.x - press.startX
  const dy = point.y - press.startY
  return dx * dx + dy * dy > NODE_PRESS_SLOP_PX * NODE_PRESS_SLOP_PX
}
