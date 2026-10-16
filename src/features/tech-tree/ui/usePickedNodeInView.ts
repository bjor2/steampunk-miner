/**
 * Brings the picked node into view on the map (#470 PT-5): "Next affordable" may pick a node the
 * map is panned away from. Reads the store's picked node and scrolls only the map's own scroll
 * area to centre it, once per pick, never per frame: `scrollIntoView` would also shift the
 * screen's clipped frame sideways.
 */
import { useEffect, useRef, type RefObject } from 'react'
import { useTreeScreenStore } from '../store/treeScreenStore'
import { nodeTestIdOf } from './nodeTestIds'

export function usePickedNodeInView(): RefObject<HTMLDivElement> {
  const map = useRef<HTMLDivElement>(null)
  const selectedNodeId = useTreeScreenStore((state) => state.selectedNodeId)
  useEffect(() => centreNodeOnMap(map.current, selectedNodeId), [selectedNodeId])
  return map
}

function centreNodeOnMap(map: HTMLDivElement | null, nodeId: string | null): void {
  if (map === null || nodeId === null) return
  const node = map.querySelector(`[data-testid="${nodeTestIdOf(nodeId)}"]`)
  const viewport = node?.closest('[data-scroll-area]')?.firstElementChild
  if (node instanceof HTMLElement && viewport instanceof HTMLElement) centreIn(viewport, node)
}

function centreIn(viewport: HTMLElement, node: HTMLElement): void {
  const frame = viewport.getBoundingClientRect()
  const box = node.getBoundingClientRect()
  viewport.scrollBy(
    box.left + box.width / 2 - (frame.left + frame.width / 2),
    box.top + box.height / 2 - (frame.top + frame.height / 2),
  )
}
