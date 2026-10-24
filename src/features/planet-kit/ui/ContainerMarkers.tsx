/**
 * The map markers of the placed containers (the TD's final ruling on #823, point 8; G&V: the crate
 * is drawn at its cell with its owner shown by a tag colour): one overlay card at the centre of
 * each container's cell on this planet, the kind's name and its units, the local player's own in
 * brass, another player's in copper. Drawn whatever the ground does there, so a container under
 * fallen rubble still shows. Reads only the authority replica.
 */
import { useMemo } from 'react'
import type { Vec2 } from '../../../ui/projection/worldToScreen'
import { OverlayCard } from '../../../ui/overlay/OverlayCard'
import { useScreenModel } from '../../../ui/useScreenModel'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { readContainerMarkers } from '../store/containerReads'
import type { ContainerRow } from '../systems/containerViews'
import { PLANET_KIT_TEST_IDS } from './testIds'
import styles from './ContainerMarkers.module.css'

/** Above the assay lens (5) and the mining chip (10): a placed hold keeps its seat over an ore reading. */
export const CONTAINER_MARKER_PRIORITY = 15

const HALF_TILE = 0.5

export function ContainerMarkers() {
  const markers = useScreenModel(readContainerMarkers)
  return (
    <>
      {markers.map((marker) => (
        <ContainerMarker key={marker.key} marker={marker} />
      ))}
    </>
  )
}

function ContainerMarker({ marker }: { marker: ContainerRow }) {
  const anchor = useMemo(() => tileCentreOf(marker.cell), [marker.cell])
  return (
    <OverlayCard anchor={anchor}>
      <span
        className={styles.marker}
        data-testid={PLANET_KIT_TEST_IDS.containerMarker}
        data-container={marker.key}
        data-owner={marker.isOwn ? 'own' : 'other'}
      >
        <span className={styles.name}>{marker.name}</span>
        <span>×{marker.units}</span>
      </span>
    </OverlayCard>
  )
}

/** A tile's centre in world units: a tile is a metre (#4). */
function tileCentreOf(tile: TilePoint): Vec2 {
  return { x: tile.tx + HALF_TILE, y: tile.ty + HALF_TILE }
}
