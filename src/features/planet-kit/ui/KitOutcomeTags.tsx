/**
 * The hazard tools' outcomes on the HUD overlay (ticket 882): one tag over the cell each outcome
 * acted on, scree shoved, a shard looted, a vane ride, for a moment, and one over each open
 * flask's cleared firedamp while it is open (`kitOutcomeTags.ts`). Drawn whatever the ground does
 * there. Reads only the outcomes heard and the authority replica.
 */
import { useEffect, useMemo } from 'react'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { OverlayCard } from '../../../ui/overlay/OverlayCard'
import type { Vec2 } from '../../../ui/projection/worldToScreen'
import { useScreenModel } from '../../../ui/useScreenModel'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { hearKitOutcomes, readKitOutcomeTags } from '../store/kitOutcomeFeed'
import type { KitOutcomeTag } from '../systems/render/kitOutcomeTags'
import { PLANET_KIT_TEST_IDS } from './testIds'
import styles from './KitOutcomeTags.module.css'

/** Above the placed containers (15), under the barometer and the reticle (20). */
export const KIT_OUTCOME_TAG_PRIORITY = 18

const HALF_TILE = 0.5

export function KitOutcomeTags() {
  useEffect(() => listenForDomainEvents(hearKitOutcomes), [])
  const tags = useScreenModel(readKitOutcomeTags)
  return (
    <>
      {tags.map((tag) => (
        <OutcomeTag key={tag.key} tag={tag} />
      ))}
    </>
  )
}

function OutcomeTag({ tag }: { tag: KitOutcomeTag }) {
  const anchor = useMemo(() => tileCentreOf(tag.cell), [tag.cell])
  return (
    <OverlayCard anchor={anchor}>
      <span
        className={styles.tag}
        data-testid={PLANET_KIT_TEST_IDS.outcomeTag}
        data-outcome={tag.verb}
      >
        {tag.label}
      </span>
    </OverlayCard>
  )
}

/** A tile's centre in world units: a tile is a metre (#4). */
function tileCentreOf(tile: TilePoint): Vec2 {
  return { x: tile.tx + HALF_TILE, y: tile.ty + HALF_TILE }
}
