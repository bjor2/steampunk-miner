/**
 * Placing the coins of the screen-space stream each rendered frame (#171: once launched they ride
 * in screen space, so they always arrive even if you drive off): from the stack's pixel to the
 * money counter, or to the `Lining −X` tag for the coins the bill peeled off. Written on the
 * elements' styles through refs, never React state, with scratch made once per burst.
 *
 * A target that is not on screen keeps its last pixel: the stack once it leaves the view, the
 * counter once the bay closes (the coins still land, the counter just is not drawn). Before the
 * counter was ever seen, the coins fly to the top centre, where the bay header sits.
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
  stackWorld: FlightPoint
  from: FlightPoint
  counter: FlightPoint
  tag: FlightPoint
  point: FlightPoint
  isCounterSeen: boolean
  /** Which seats show now, so an unchanged seat writes nothing. */
  shownSeats: boolean[]
}

export function createStreamFlight(stackWorld: FlightPoint, seats: number): StreamFlight {
  return {
    stackWorld,
    from: { x: 0, y: 0 },
    counter: { x: 0, y: 0 },
    tag: { x: 0, y: 0 },
    point: { x: 0, y: 0 },
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
  keepPoint(flight.from, project(flight.stackWorld))
  const counter = moneyCounterPointIn(layer)
  if (counter !== null) flight.isCounterSeen = true
  keepPoint(flight.counter, counter ?? (flight.isCounterSeen ? null : topCentreOf(layer, flight)))
  keepPoint(flight.tag, liningTagPointIn(layer) ?? flight.counter)
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

function keepPoint(kept: FlightPoint, now: ScreenPoint | null): void {
  if (now === null) return
  kept.x = now.x
  kept.y = now.y
}

function topCentreOf(layer: HTMLElement, flight: StreamFlight): FlightPoint {
  flight.point.x = layer.clientWidth / 2
  flight.point.y = 0
  return flight.point
}
