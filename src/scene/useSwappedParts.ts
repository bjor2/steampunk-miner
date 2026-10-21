/**
 * The parts slices swap into the car (#180 big level-ups, `partMotionRequests`; another asset's look
 * parts since ticket 640), as React state: checked each frame against the presence's version and
 * re-rendered only when the swaps change, which is a handful of times a visit, so the parts list
 * never rebuilds per frame.
 */
import { useFrame } from '@react-three/fiber'
import { useState } from 'react'
import type { PartSwapRequest } from '../systems/registries/partMotionRequests'
import { partMotion } from './partMotionPresence'

export interface SwappedParts {
  version: number
  /** `vehicle` parts in their slots. */
  partIds: readonly string[]
  /** Other assets' parts, each hiding the slot it stands in. */
  looks: readonly PartSwapRequest[]
}

export function useSwappedParts(): SwappedParts {
  const [shown, setShown] = useState(swapsNow)
  useFrame(() => {
    if (partMotion.requested.shownVersion !== shown.version) setShown(swapsNow())
  })
  return shown
}

function swapsNow(): SwappedParts {
  const { shownVersion, shownPartIds, shownLooks } = partMotion.requested
  return { version: shownVersion, partIds: [...shownPartIds], looks: [...shownLooks] }
}
