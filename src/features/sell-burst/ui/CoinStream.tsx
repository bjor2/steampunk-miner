/**
 * The burst's coins in screen space (#171 section 1), on the click-through layer above the bay
 * screen (ticket 220), so they cross the open Sell bay to its money counter. One pooled element
 * per coin the burst may hold, placed each rendered frame by `placeStreamCoins`; with no burst it
 * draws nothing.
 */
import { useEffect, useMemo, useRef } from 'react'
import { readAuthorityState } from '../../../store/authorityLink'
import { dockSiteOfPlanet } from '../../../systems/authority/planetOfState'
import { onFrame } from '../../../ui/projection/worldToScreen'
import { sellShopPointsOf } from '../scene/sellShopPoints'
import { useSellBurstStore } from '../store/sellBurstStore'
import { BURST_TIMING } from '../systems/burstTiming'
import type { SellBurst } from '../systems/sellBurst'
import styles from './CoinStream.module.css'
import { createStreamFlight, placeStreamCoins, type StreamFlight } from './streamFlight'

const SEATS = Array.from({ length: BURST_TIMING.coins.max }, (_, seat) => seat)

export const COIN_STREAM_TEST_ID = 'sell-burst-coin-stream'

export function CoinStream() {
  const burst = useSellBurstStore((state) => state.burst)
  if (burst === null) return null
  return <CoinSeats burst={burst} />
}

function CoinSeats({ burst }: { burst: SellBurst }) {
  const layer = useRef<HTMLDivElement>(null)
  const seats = useRef<(HTMLSpanElement | null)[]>([])
  const flight = useMemo(streamFlightOfPlanet, [])
  useEffect(
    () => onFrame(() => placeStreamFrame(layer.current, seats.current, burst, flight)),
    [burst, flight],
  )
  return (
    <div ref={layer} className={styles.stream} data-testid={COIN_STREAM_TEST_ID}>
      {SEATS.map((seat) => (
        <span
          key={seat}
          ref={(element) => (seats.current[seat] = element)}
          className={styles.coin}
        />
      ))}
    </div>
  )
}

function placeStreamFrame(
  layer: HTMLElement | null,
  seats: readonly (HTMLElement | null)[],
  burst: SellBurst,
  flight: StreamFlight,
): void {
  if (layer !== null) placeStreamCoins(layer, seats, burst, flight)
}

/** The Exchange's points the stream may leave from, on this planet's pad. */
function streamFlightOfPlanet(): StreamFlight {
  const site = dockSiteOfPlanet(readAuthorityState().planet)
  const points = site === null ? null : sellShopPointsOf(site)
  const starts = points === null ? [] : [points.stack, points.crown, points.chute]
  return createStreamFlight(starts, SEATS.length)
}
