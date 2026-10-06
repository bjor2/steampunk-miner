// The claimed-to-done window of a ticket (#138): from its first claim (the start of the first loop
// session) to its close. The Features tab counts only this window. Time before the claim, blocked
// or waiting or idle, is dropped; blocked, planner_wait and idle time inside it is kept under its
// own category, because a block after the work started says something about the work. Pure.
import { zeroTotals } from './phaseCategories.mjs'

function clippedMs(segment, from, to) {
  const start = Math.max(Date.parse(segment.start), from)
  const end = Math.min(Date.parse(segment.end), to)
  return Math.max(end - start, 0)
}

/**
 * Seconds per category of the segments (ISO `start`/`end`) inside [claimed, closed], every
 * category present; a segment that straddles the claim keeps only its part after it.
 */
export function claimedWindowTotals(segments, claimed, closed) {
  const from = Date.parse(claimed)
  const to = Date.parse(closed)
  const ms = zeroTotals()
  for (const segment of segments) ms[segment.category] += clippedMs(segment, from, to)
  return Object.fromEntries(Object.entries(ms).map(([id, value]) => [id, Math.round(value / 1000)]))
}
