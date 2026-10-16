/**
 * Where the hazard strip lies on screen (ticket 341; VS on #500): a track that starts
 * `STRIP_INNER_VMIN` hundredths of the short axis out from the middle and runs
 * `STRIP_LENGTH_VMIN`, from the screen alone, so no zoom, speed, depth or drill level moves or
 * sizes it. The vehicle's body, held at the middle, never reaches its inner end, at any zoom.
 */
import { STRIP_INNER_VMIN, STRIP_LENGTH_VMIN } from '../../constants/hazardStrip'
import type { ScreenSize } from './hudClearView'

const PERCENT = 100

export interface HazardStripReach {
  /** Pixels from the screen's middle to the strip's near end. */
  inner: number
  /** The strip's length in pixels. */
  length: number
}

export function hazardStripReachOf(screen: ScreenSize): HazardStripReach {
  const shortAxis = Math.min(screen.width, screen.height)
  return {
    inner: (shortAxis * STRIP_INNER_VMIN) / PERCENT,
    length: (shortAxis * STRIP_LENGTH_VMIN) / PERCENT,
  }
}

/** The custom properties the strip's sheet lays it out by. */
export function hazardStripStyleOf(): Record<string, string> {
  return {
    '--strip-inner': `${STRIP_INNER_VMIN}vmin`,
    '--strip-length': `${STRIP_LENGTH_VMIN}vmin`,
  }
}
