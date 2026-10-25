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
 * claiming its schedule row, the Buy on each merchant line, the carried crates' count with the
 * drop beside the gauges, and the crate the pacing bot carries under its kit policy. Ticket 881
 * makes the three hazard tools act by context: their trade-offs, their factors on their hazards'
 * contacts and the kernel's pre-cut hook that decides when each acts; and the Damp Flask's uncork.
 * Ticket 882 gives each tool its one visible outcome while it acts: the plough shoves the scree
 * ahead aside through the terrain edit queue, the tongs loot the cluster, the vane turns the vent's
 * shove outward, the flask clears firedamp round its cell; and puts the tools on sale.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { planetKitDebugActions } from './debug'
import { PLANET_KIT_PROJECTIONS, PLANET_KIT_RUN_EVENTS } from './logging'
import { KIT_SOCKET_PIECE_ID, KitSocketParts } from './scene/KitSocketParts'
import { MERCHANT_FRONTAGE_PIECE_ID, MerchantFrontage } from './scene/MerchantFrontage'
import { PLANET_KIT_BOT_CRATES } from './systems/botCrates'
import { PLANET_KIT_BOT_FLASK } from './systems/botFlask'
import { PLANET_KIT_BOT_KIT_BUYS } from './systems/botKitBuys'
import { CONTAINER_RULES } from './systems/containerRules'
import { CONTAINERS_SECTION } from './systems/containerSection'
import { KIT_BUY_RULES } from './systems/kitBuyRules'
import { UNCORK_FLASK_REACTION } from './systems/flaskReaction'
import { FLASK_FACTOR, FLASK_RULES } from './systems/flaskRules'
import { FLASK_CLEAR } from './systems/flaskClear'
import { SCREE_SHOVE_REACTION } from './systems/screeShove'
import { SHARD_LOOT_REACTION } from './systems/shardLoot'
import { VANE_RIDE_REACTION, VANE_SHOVE_AIM } from './systems/vaneAim'
import { KIT_HOLDINGS_SECTION } from './systems/kitHoldingsSection'
import { KIT_TOOL_CONTEXTS, KIT_TOOL_FACTORS, KIT_TOOL_TRADE_OFFS } from './systems/kitToolRules'
import { kitItemEntriesOf } from './systems/kitItemContent'
import { KIT_SOCKETS } from './systems/kitSockets'
import { MERCHANT_ORE_PREMIUM, MERCHANT_PREMIUM_LIFT } from './systems/merchantPremium'
import { PLANET_KITS } from './systems/planetKitRows'
import { MERCHANT_FACILITY } from './systems/sessionMerchant'
import { CarriedCrates } from './ui/CarriedCrates'
import { KIT_OUTCOME_TAG_PRIORITY, KitOutcomeTags } from './ui/KitOutcomeTags'
import { FLASK_TOOL_SLOT } from './ui/flaskToolSlot'
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
    r.content('kit-item', kitItemEntriesOf(PLANET_KITS.items, KIT_SOCKETS))
    r.saveSection(CONTAINERS_SECTION)
    r.saveSection(KIT_HOLDINGS_SECTION)
    r.commandRules(CONTAINER_RULES)
    r.commandRules(KIT_BUY_RULES)
    // The plough, tongs and vane act while their hazard is within the drill's reach (ticket 881).
    r.preCutContext(KIT_TOOL_CONTEXTS)
    KIT_TOOL_TRADE_OFFS.forEach((row) => r.toolTradeOff(row))
    KIT_TOOL_FACTORS.forEach((factor) => r.contactFactor(factor))
    // The Damp Flask, uncorked on purpose: no firedamp drain while it is open (ticket 881).
    r.commandRules(FLASK_RULES)
    r.contactFactor(FLASK_FACTOR)
    // U, LB+Y or the flask's cell in the bar's overflow uncorks one (ticket 881).
    r.inputReaction(UNCORK_FLASK_REACTION)
    // One visible outcome per tool while it acts, each logged (ticket 882).
    r.authorityReaction(SCREE_SHOVE_REACTION)
    r.authorityReaction(SHARD_LOOT_REACTION)
    r.shoveAim(VANE_SHOVE_AIM)
    r.authorityReaction(VANE_RIDE_REACTION)
    r.hazardClear(FLASK_CLEAR)
    r.toolSlot(FLASK_TOOL_SLOT)
    // The crate the pacing bot carries under `kitPolicy.crates: 'drop_on_full'` (ticket 850).
    r.botCrates(PLANET_KIT_BOT_CRATES)
    // The flask a tools-on bot uncorks on entering firedamp, under `kitPolicy.flask` (ticket 881).
    r.botFlask(PLANET_KIT_BOT_FLASK)
    // Each planet's own kit a merchants-on bot buys, under `kitPolicy.merchant` (ticket 826).
    r.botKitBuy(PLANET_KIT_BOT_KIT_BUYS)
    r.eventProjections(PLANET_KIT_PROJECTIONS)
    r.runEvents(PLANET_KIT_RUN_EVENTS)
    r.hudPanel({
      id: 'planet-kit.container-markers',
      slot: 'overlay',
      priority: CONTAINER_MARKER_PRIORITY,
      Panel: ContainerMarkers,
    })
    r.hudPanel({
      id: 'planet-kit.outcome-tags',
      slot: 'overlay',
      priority: KIT_OUTCOME_TAG_PRIORITY,
      Panel: KitOutcomeTags,
    })
    r.hudPanel({ id: 'planet-kit.carried-crates', slot: 'gauges', Panel: CarriedCrates })
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
