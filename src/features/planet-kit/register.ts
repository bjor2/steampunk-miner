/**
 * The planet-kit slice's registration: no side effects at import; the loader calls `register`.
 * Ticket 820 shipped the data rows only. Ticket 823 registers the Cache Crate's placed containers:
 * the session section that keeps them per planet, the drop and pickup commands and the scenario
 * call, their log lines, the map markers and the list on the base sheet, and the placeholder
 * parts on the sockets G&V named for the kit tools (shown by a debug switch until #850 lets a
 * player own one). Ticket 821 stands the merchant counter on the dock (it claims the `merchants`
 * row), counts and pays the merchant's ore premium on the kernel's ledger and sale-lift seams, and
 * draws the planet's merchant on the Sell bay. Ticket 825 brought the Blender art: the sockets'
 * parts, the merchant frontage on the Assay & Exchange and the Cache Crate prop. Ticket 850 sells
 * the kit items: the buy command and the player's holdings section, a content entry per item
 * claiming its schedule row, the Buy on each merchant line, and the carried crates' count with
 * the drop beside the gauges.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { planetKitDebugActions } from './debug'
import { PLANET_KIT_PROJECTIONS, PLANET_KIT_RUN_EVENTS } from './logging'
import { KIT_SOCKET_PIECE_ID, KitSocketParts } from './scene/KitSocketParts'
import { MERCHANT_FRONTAGE_PIECE_ID, MerchantFrontage } from './scene/MerchantFrontage'
import { CONTAINER_RULES } from './systems/containerRules'
import { CONTAINERS_SECTION } from './systems/containerSection'
import { KIT_BUY_RULES } from './systems/kitBuyRules'
import { KIT_HOLDINGS_SECTION } from './systems/kitHoldingsSection'
import { kitItemEntriesOf } from './systems/kitItemContent'
import { MERCHANT_ORE_PREMIUM, MERCHANT_PREMIUM_LIFT } from './systems/merchantPremium'
import { PLANET_KITS } from './systems/planetKitRows'
import { MERCHANT_FACILITY } from './systems/sessionMerchant'
import { planetKitArtAssets } from './systems/planetKitArt'
import { CONTAINER_MARKER_PRIORITY, ContainerMarkers } from './ui/ContainerMarkers'
import { CONTAINERS_TAB } from './ui/ContainersTab'
import { MERCHANT_PANEL_KIND, MERCHANT_PANEL_ROW } from './ui/MerchantPanel'

export const slice: SliceDefinition = {
  id: 'planet-kit',
  register(r) {
    r.dockFacility(MERCHANT_FACILITY)
    r.orePremium(MERCHANT_ORE_PREMIUM)
    r.oreSaleLift(MERCHANT_PREMIUM_LIFT)
    r.content('kit-item', kitItemEntriesOf(PLANET_KITS.items))
    r.saveSection(CONTAINERS_SECTION)
    r.saveSection(KIT_HOLDINGS_SECTION)
    r.commandRules(CONTAINER_RULES)
    r.commandRules(KIT_BUY_RULES)
    r.eventProjections(PLANET_KIT_PROJECTIONS)
    r.runEvents(PLANET_KIT_RUN_EVENTS)
    r.hudPanel({
      id: 'planet-kit.container-markers',
      slot: 'overlay',
      priority: CONTAINER_MARKER_PRIORITY,
      Panel: ContainerMarkers,
    })
    r.sheetTab(CONTAINERS_TAB)
    r.bayPanelKind(MERCHANT_PANEL_KIND)
    r.bayPanelRow(MERCHANT_PANEL_ROW)
    r.vehiclePiece({ id: KIT_SOCKET_PIECE_ID, Piece: KitSocketParts })
    // The merchant's frontage on the Assay & Exchange, where the planet has an authored merchant.
    r.worldPiece({ id: MERCHANT_FRONTAGE_PIECE_ID, layer: 'platform', Piece: MerchantFrontage })
    // The kit sockets' parts, the merchant frontages and the Cache Crate prop (ticket 825, #214).
    r.artAssets(planetKitArtAssets())
    // steampunkDebug.features['planet-kit'].placeContainer({ tx, ty, ore }), .containers(),
    // .showKitSockets(), .hideKitSockets(), .kitSockets(), .merchant(), .merchantFrontage(),
    // .grantKitItem(itemId), .kitHoldings()
    r.debugActions(planetKitDebugActions)
  },
}
