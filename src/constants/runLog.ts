/**
 * The run log's drill span breaks (ticket 420, the TD spec on #396 section 1, confirmed by the
 * Vertical Scaler): a span closes after 5 s, so a crash loses at most that much of it, and a gap of
 * more than half a second with no drill command from its player ends it.
 */
import { TICKS_PER_SECOND } from './physics'

/** 300 ticks: the hard cap on one span's length. */
export const DRILL_SPAN_CAP_TICKS = 5 * TICKS_PER_SECOND

/** 30 ticks with no drill command from the player close the span. */
export const DRILL_SPAN_IDLE_TICKS = TICKS_PER_SECOND / 2
