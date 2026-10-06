/**
 * The two statistics the session analysis (#125) reads trends with: a least-squares slope and a
 * median. Presentation-side numbers for a report, never part of a digest.
 */

/** dy/dx of the least-squares line through `points`; null when x never changes. */
export function slopeOf(points: readonly (readonly [x: number, y: number])[]): number | null {
  if (points.length < 2) return null
  const meanX = meanOf(points.map(([x]) => x))
  const meanY = meanOf(points.map(([, y]) => y))
  const spread = sumOf(points.map(([x]) => (x - meanX) * (x - meanX)))
  if (spread === 0) return null
  return sumOf(points.map(([x, y]) => (x - meanX) * (y - meanY))) / spread
}

/** The middle value, the mean of the two middle ones for an even count; null when empty. */
export function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function meanOf(values: readonly number[]): number {
  return sumOf(values) / values.length
}

function sumOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}
