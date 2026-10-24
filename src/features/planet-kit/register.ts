/**
 * The planet-kit slice's registration: no side effects at import; the loader calls `register`.
 * Ticket 820 shipped the data rows only. Ticket 823 registers the Cache Crate's placed containers:
 * the session section that keeps them per planet, the drop and pickup commands and the scenario
 * call, their log lines, the map markers and the list on the base sheet, and the placeholder
 * parts on the sockets G&V named for the kit tools (shown by a debug switch until #850 lets a
 * player own one). Buying kit items and the four hazard tools come with #850.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { planetKitDebugActions } from './debug'
import { PLANET_KIT_PROJECTIONS, PLANET_KIT_RUN_EVENTS } from './logging'
import { KIT_SOCKET_PIECE_ID, KitSocketParts } from './scene/KitSocketParts'
import { CONTAINER_RULES } from './systems/containerRules'
import { CONTAINERS_SECTION } from './systems/containerSection'
import { CONTAINER_MARKER_PRIORITY, ContainerMarkers } from './ui/ContainerMarkers'
import { CONTAINERS_TAB } from './ui/ContainersTab'

export const slice: SliceDefinition = {
  id: 'planet-kit',
  register(r) {
    r.saveSection(CONTAINERS_SECTION)
    r.commandRules(CONTAINER_RULES)
    r.eventProjections(PLANET_KIT_PROJECTIONS)
    r.runEvents(PLANET_KIT_RUN_EVENTS)
    r.hudPanel({
      id: 'planet-kit.container-markers',
      slot: 'overlay',
      priority: CONTAINER_MARKER_PRIORITY,
      Panel: ContainerMarkers,
    })
    r.sheetTab(CONTAINERS_TAB)
    r.vehiclePiece({ id: KIT_SOCKET_PIECE_ID, Piece: KitSocketParts })
    // steampunkDebug.features['planet-kit'].placeContainer({ tx, ty, ore }), .containers(),
    // .showKitSockets(), .hideKitSockets(), .kitSockets()
    r.debugActions(planetKitDebugActions)
  },
}
