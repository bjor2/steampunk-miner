/**
 * The parts slices swap into the car (#180 big level-ups, `partMotionRequests`), as React state:
 * checked each frame against the presence's version and re-rendered only when the swaps change,
 * which is a handful of times a visit, so the parts list never rebuilds per frame.
 */
import { useFrame } from '@react-three/fiber'
import { useState } from 'react'
import { partMotion } from './partMotionPresence'

interface ShownSwaps {
  version: number
  partIds: readonly string[]
}

export function useSwappedPartIds(): readonly string[] {
  const [shown, setShown] = useState(swapsNow)
  useFrame(() => {
    if (partMotion.requested.shownVersion !== shown.version) setShown(swapsNow())
  })
  return shown.partIds
}

function swapsNow(): ShownSwaps {
  const { shownVersion, shownPartIds } = partMotion.requested
  return { version: shownVersion, partIds: [...shownPartIds] }
}
