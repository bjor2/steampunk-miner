/**
 * Placing the coins of the screen-space stream each rendered frame (#171: once launched they ride
 * in screen space, so they always arrive even if you drive off): from the stack's pixel to the
 * money counter, or to the `Lining −X` tag for the coins the bill peeled off. Written on the
 * elements' styles through refs, never React state, with scratch made once per burst.
 *
 * A target that is not on screen keeps its last pixel: the building once it leaves the view, the
 * counter once the bay closes (the coins still land, the counter just is not drawn). Before the
 * counter was ever seen, the coins fly to the top centre, where the bay header sits; before the
 * building was, they rise from the bottom centre.
 */
import { readAuthorityTick } from '../../../store/gameStore'
import { moneyCounterPointIn } from '../../../ui/platform/moneyCounterAnchor'
import { project, type ScreenPoint } from '../../../ui/projection/worldToScreen'
import {
  isPeeledCoin,
  screenFlightPointAt,
  screenFlightShareAt,
  type FlightPoint,
} from '../systems/render/burstFlight'
import type { SellBurst } from '../systems/sellBurst'
import { liningTagPointIn } from './liningTagAnchor'

export interface StreamFlight {
  /** Where the stream leaves from, best first: the stack, the crown, the chute (world metres). */
  starts: readonly FlightPoint[]
  from: FlightPoint
  counter: FlightPoint
  tag: FlightPoint
  point: FlightPoint
  isStartSeen: boolean
  isCounterSeen: boolean
  /** Which seats show now, so an unchanged seat writes nothing. */
  shownSeats: boolean[]
}

export function createStreamFlight(starts: readonly FlightPoint[], seats: number): StreamFlight {
  return {
    starts,
    from: { x: 0, y: 0 },
    counter: { x: 0, y: 0 },
    tag: { x: 0, y: 0 },
    point: { x: 0, y: 0 },
    isStartSeen: false,
    isCounterSeen: false,
    shownSeats: Array.from({ length: seats }, () => false),
  }
}

export function placeStreamCoins(
  layer: HTMLElement,
  seats: readonly (HTMLElement | null)[],
  burst: SellBurst,
  flight: StreamFlight,
): void {
  const tick = readAuthorityTick()
  readStreamEnds(layer, flight)
  let seat = 0
  for (const wave of burst.waves) {
    for (let index = 0; index < wave.coins; index++, seat++) {
      const share = screenFlightShareAt(wave, index, tick)
      const target = isPeeledCoin(wave, index) ? flight.tag : flight.counter
      placeSeat(seats[seat], seat, share, target, flight)
    }
  }
  for (; seat < seats.length; seat++) placeSeat(seats[seat], seat, null, flight.counter, flight)
}

/** The stream's ends this frame, each kept at its last pixel while it is not on screen. */
function readStreamEnds(layer: HTMLElement, flight: StreamFlight): void {
  const start = firstOnScreen(flight.starts)
  if (start !== null) flight.isStartSeen = true
  keepPoint(flight.from, start ?? (flight.isStartSeen ? null : bottomCentreOf(layer, flight)))
  const counter = insideOrNull(layer, moneyCounterPointIn(layer))
  if (counter !== null) flight.isCounterSeen = true
  keepPoint(flight.counter, counter ?? (flight.isCounterSeen ? null : topCentreOf(layer, flight)))
  keepPoint(flight.tag, insideOrNull(layer, liningTagPointIn(layer)) ?? flight.counter)
}

function placeSeat(
  element: HTMLElement | null,
  seat: number,
  share: number | null,
  target: FlightPoint,
  flight: StreamFlight,
): void {
  if (element === null) return
  const isShown = share !== null
  if (isShown !== flight.shownSeats[seat]) element.style.visibility = isShown ? 'visible' : 'hidden'
  flight.shownSeats[seat] = isShown
  if (share === null) return
  const { x, y } = screenFlightPointAt(flight.from, target, share, flight.point)
  element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
}

/**
 * The stack stands 10 m up the Exchange, over the docked camera's view; then the coins leave from
 * the crown, or the chute, so they always start on the building.
 */
function firstOnScreen(starts: readonly FlightPoint[]): ScreenPoint | null {
  for (let index = 0; index < starts.length; index++) {
    const point = project(starts[index])
    if (point !== null) return point
  }
  return null
}

/** The bay's shutter slides the header in from above the screen; out there it is not a target. */
function insideOrNull(layer: HTMLElement, point: ScreenPoint | null): ScreenPoint | null {
  if (point === null) return null
  const isInside = point.x >= 0 && point.x < layer.clientWidth
  return isInside && point.y >= 0 && point.y < layer.clientHeight ? point : null
}

function keepPoint(kept: FlightPoint, now: ScreenPoint | null): void {
  if (now === null) return
  kept.x = now.x
  kept.y = now.y
}

function bottomCentreOf(layer: HTMLElement, flight: StreamFlight): FlightPoint {
  flight.point.x = layer.clientWidth / 2
  flight.point.y = layer.clientHeight
  return flight.point
}

function topCentreOf(layer: HTMLElement, flight: StreamFlight): FlightPoint {
  flight.point.x = layer.clientWidth / 2
  flight.point.y = 0
  return flight.point
}
