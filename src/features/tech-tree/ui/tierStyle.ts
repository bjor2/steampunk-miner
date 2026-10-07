/** The custom properties a node or ruler mark is placed by: its planet, and its row on that planet. */
import type { CSSProperties } from 'react'

export function tierStyleOf(tier: number, stack = 0): CSSProperties {
  return { '--tier': tier, '--stack': stack } as CSSProperties
}

export function rulerStyleOf(lastPlanet: number): CSSProperties {
  return { '--planets': lastPlanet } as CSSProperties
}
