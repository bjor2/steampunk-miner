import { useEffect, type RefObject } from 'react'
import { drillPresence } from '../../../scene/drillPresence'
import { vehiclePresence } from '../../../scene/vehiclePresence'
import { vehicleStagePresence } from '../../../scene/vehicleStage'
import { UPGRADE_IDS, type UpgradeId } from '../../../systems/economy/economyDefinition'
import { turnedWidthShareOf } from '../../../systems/render/stagedTurn'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { onFrame, project } from '../../../ui/projection/worldToScreen'
import { placePartPoint, SHOWCASE } from '../systems/render/showcaseReactions'

interface Anchor {
  x: number
  y: number
}

/** Where each line leaves its plaque, measured when the layout changes, not per frame. */
interface LeaderLayout {
  origin: Anchor
  plaques: Map<UpgradeId, Anchor>
  lines: Map<UpgradeId, SVGLineElement>
}

const part = { x: 0, y: 0 }

/**
 * Measures the plaques on mount and resize, then every rendered frame ends each line on its part's
 * projected point: the car's drawn centre, its up, its facing and the turntable's turn.
 */
export function useLeaderLines(svg: RefObject<SVGSVGElement>): void {
  useEffect(() => {
    const element = svg.current
    if (element === null) return
    const layout: LeaderLayout = { origin: { x: 0, y: 0 }, plaques: new Map(), lines: new Map() }
    const measure = () => measureLayout(element, layout)
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    const stopFrames = onFrame(() => drawLeaders(layout))
    return () => {
      stopFrames()
      observer.disconnect()
    }
  }, [svg])
}

function measureLayout(svg: SVGSVGElement, layout: LeaderLayout): void {
  const frame = svg.getBoundingClientRect()
  layout.origin = { x: frame.left, y: frame.top }
  for (const id of UPGRADE_IDS) {
    const plaque = svg.parentElement?.querySelector(`[data-plaque="${id}"]`)
    const line = svg.querySelector<SVGLineElement>(`[data-leader="${id}"]`)
    if (plaque instanceof HTMLElement && line !== null) {
      layout.plaques.set(id, innerEdgeOf(plaque.getBoundingClientRect(), frame))
      layout.lines.set(id, line)
    }
  }
}

/** The plaque's edge that faces the car, the middle of the frame, relative to the frame. */
function innerEdgeOf(plaque: DOMRect, frame: DOMRect): Anchor {
  const isRightOfMiddle = plaque.left + plaque.width / 2 > frame.left + frame.width / 2
  const x = isRightOfMiddle ? plaque.left : plaque.right
  return { x: x - frame.left, y: plaque.top + plaque.height / 2 - frame.top }
}

function drawLeaders(layout: LeaderLayout): void {
  const widthShare = facingSign() * turnedWidthShareOf(vehicleStagePresence.rotation)
  for (const [id, line] of layout.lines) {
    placePartPoint(SHOWCASE.tracks[id], vehiclePresence, drillPresence.up, widthShare, part)
    drawLeader(line, layout.plaques.get(id), project(part), layout.origin)
  }
}

function facingSign(): number {
  return drillPresence.facing === FACING.left ? -1 : 1
}

function drawLeader(
  line: SVGLineElement,
  from: Anchor | undefined,
  to: Anchor | null,
  origin: Anchor,
): void {
  if (from === undefined || to === null) return line.setAttribute('visibility', 'hidden')
  line.setAttribute('visibility', 'visible')
  line.x1.baseVal.value = from.x
  line.y1.baseVal.value = from.y
  line.x2.baseVal.value = to.x - origin.x
  line.y2.baseVal.value = to.y - origin.y
}
