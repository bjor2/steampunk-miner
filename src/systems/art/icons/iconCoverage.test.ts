import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { plantOnWall, prepareBlaster } from '../../authority/charges/chargeFixtures'
import {
  dockAtBayOf,
  mineSurfaceOre,
  REFINERY_SITE,
  sessionOnPlanet,
} from '../../authority/refinery/refineryFixtures'
import { createScriptedSession, mineTile, surfaceOreTiles } from '../../authority/scriptedSession'
import { HINT_TABLE } from '../../hints/hintTable'
import { ACTION_MAP, defaultBindings } from '../../input/actionMap'
import { DEFAULT_PREFERENCES } from '../../input/preferences'
import { ENEMY_IDS, PLATFORM_BAY_IDS } from '../../registeredIds'
import { setHullCommand, teleportToDockCommand } from '../../vehicle/vehicleCommands'
import { selectArtefactChoiceModel } from '../../views/artefactChoiceModel'
import { bayHeaderOf, footerButtonsOf, type BayUiState } from '../../views/bayFrame'
import { energyWarningMarkers, selectHudModel, type HudModel } from '../../views/hudModel'
import { vehicleModeMarkers } from '../../views/hudReadings'
import { selectRefineryBayModel } from '../../views/refineryBayModel'
import { selectSellBayModel, type SellBayModel } from '../../views/sellBayModel'
import { selectSettingsModel } from '../../views/settingsModel'
import { selectUpgradeBayModel, type UpgradeBayModel } from '../../views/upgradeBayModel'
import { KNOWN_ICON_GAPS, resolvesIcon, unresolvedIconIds } from './iconCoverage'
import { enemyIconIdOf, iconFileIds } from './iconSet'
import { oreIconIdOf } from './oreIcon'

// The coverage rule of #158 section 3: every surface's icon ids resolve to a shipped SVG or a
// generated ore icon. Each surface lists its ids through its own model, so a data entry with no
// icon fails here, not on screen.

const BINDINGS = defaultBindings(ACTION_MAP)

const UI: BayUiState = {
  isTravelArmed: false,
  isQuickServiceHighlighted: false,
  focusedId: null,
  installingUpgradeId: null,
}

const markerIcons = (markers: Readonly<Record<string, { icon: string }>>): string[] =>
  Object.values(markers)
    .map((marker) => marker.icon)
    .filter((icon) => icon !== '')

const hudOf = (session: ReturnType<typeof createScriptedSession>): HudModel =>
  selectHudModel({ state: session.state(), playerId: 'p1', depthTiles: 0, bindings: BINDINGS })

const buttonIcons = (buttons: readonly { iconId?: string }[]): string[] =>
  buttons.flatMap((button) => (button.iconId === undefined ? [] : [button.iconId]))

/** Planet 8's Upgrade bay offers every row: lining, guns, charges and the rack (#113, #107, #109). */
function everyUpgradeRow(): UpgradeBayModel {
  const session = createScriptedSession()
  session.submit(1, { type: 'debug.setPlanet', payload: { planetIndex: 8 } })
  session.submit(1, teleportToDockCommand('upgrade'))
  const model = selectUpgradeBayModel(session.state(), 'p1', UI)
  expect([model.lining, model.guns, model.charges].every((row) => row !== null)).toBe(true)
  return model
}

function hudIconsOf(hud: HudModel): string[] {
  return [
    hud.energy.iconId,
    hud.hull.iconId,
    hud.cargo.iconId,
    ...(hud.heat === null ? [] : [hud.heat.iconId]),
    hud.vehicleState.icon,
    ...hud.threats.map((threat) => threat.iconId),
    ...hud.statuses.shown.map((status) => status.iconId),
    ...hud.statuses.secondary.map((status) => status.iconId),
  ]
}

function upgradeBayIconsOf(model: UpgradeBayModel): string[] {
  const rows = [
    ...model.tracks,
    model.casing,
    model.lining,
    model.guns,
    ...(model.charges?.restock ?? []),
    model.charges?.rack,
  ]
  return [
    ...rows.flatMap((row) => (row == null ? [] : [row.iconId])),
    model.tierIconId,
    model.header.emblemId,
    model.header.moneyIconId,
    model.header.planetIconId,
    model.header.platformStateIconId,
    model.header.coreBay.iconId,
    ...buttonIcons([model.repair.button, model.quickService, ...footerButtonsOf(model.footer)]),
  ]
}

function sellBayIconsOf(model: SellBayModel): string[] {
  return [
    ...model.shop.rows.map((row) => row.iconId),
    ...(model.refined?.lines.map((line) => line.iconId) ?? []),
    ...buttonIcons([model.shop.sellAll, model.charging.recharge, model.quickService.button]),
    ...buttonIcons(model.refined === null ? [] : [model.refined.collect]),
  ]
}

/** The Sell bay with ore held, after a planet 3 refine batch is ready (#105). */
function sellBayWithOreAndRefined(): SellBayModel {
  const session = sessionOnPlanet(3, '1e30')
  session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_power', level: 250 } })
  session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_tip', level: 130 } })
  const tick = mineSurfaceOre(session, 10, 6)
  dockAtBayOf(session, tick, REFINERY_SITE, 'refinery')
  const tier = Number.parseInt(Object.keys(session.vehicle().cargo.ore)[0], 10)
  session.submit(tick + 1, { type: 'queueRefine', payload: { resourceTier: tier, units: 2 } })
  const refinery = selectRefineryBayModel(session.state(), 'p1', UI)
  expect(refinery.ore.length).toBeGreaterThan(0)
  expect(unresolvedIconIds(refineryIconsOf(refinery), SHIPPED_ART)).toEqual([])
  dockAtBayOf(session, tick + 2 + 180 * 60, REFINERY_SITE, 'sell')
  const sell = selectSellBayModel(session.state(), 'p1', UI)
  expect(sell.shop.rows.length).toBeGreaterThan(0)
  expect(sell.refined?.lines.length).toBe(1)
  return sell
}

function refineryIconsOf(model: ReturnType<typeof selectRefineryBayModel>): string[] {
  return [
    ...model.ore.map((row) => row.iconId),
    ...model.slots.map((slot) => slot.iconId),
    ...buttonIcons([model.buySlot, ...model.ore.map((row) => row.queue)]),
  ]
}

/** A HUD with a full hold, a lit charge ahead, the hull critical and the vehicle stranded. */
function hudWithStatuses(): HudModel {
  const session = createScriptedSession()
  surfaceOreTiles(10).forEach((tile, index) => mineTile(session, 1 + index * 50, tile))
  prepareBlaster(session, 600)
  plantOnWall(session, 601)
  session.submit(602, setHullCommand('1'))
  const hud = hudOf(session)
  expect(hud.cargo.isFull).toBe(true)
  expect(hud.statuses.shown.map((status) => status.id)).toEqual(['hull_critical', 'fuse'])
  return hud
}

describe('icon coverage (#158 section 3)', () => {
  it('resolves a set icon and an ore icon, and refuses an unknown id', () => {
    expect(resolvesIcon('icon-track-hull', SHIPPED_ART)).toBe(true)
    expect(resolvesIcon(oreIconIdOf('crystal', 40), SHIPPED_ART)).toBe(true)
    expect(resolvesIcon('anchor', SHIPPED_ART)).toBe(false)
    expect(unresolvedIconIds(['anchor', 'anchor', 'icon-casing'], SHIPPED_ART)).toEqual(['anchor'])
  })

  it('has emptied the allowlist of known gaps', () => {
    expect(KNOWN_ICON_GAPS).toEqual([])
  })

  it('ships every icon of the set', () => {
    expect(unresolvedIconIds(iconFileIds(), SHIPPED_ART)).toEqual([])
  })

  it("gives the HUD's vehicle states and energy warnings icons that exist", () => {
    const ids = [...markerIcons(vehicleModeMarkers()), ...markerIcons(energyWarningMarkers())]
    expect(ids.length).toBeGreaterThanOrEqual(5)
    expect(unresolvedIconIds(ids, SHIPPED_ART)).toEqual([])
  })

  it('gives every HUD gauge, status, threat and enemy kind an icon', () => {
    const ids = [...hudIconsOf(hudWithStatuses()), ...ENEMY_IDS.map(enemyIconIdOf)]
    expect(unresolvedIconIds(ids, SHIPPED_ART)).toEqual([])
  })

  it('gives every Upgrade bay row, header field and button an icon, on the planet with every row', () => {
    expect(unresolvedIconIds(upgradeBayIconsOf(everyUpgradeRow()), SHIPPED_ART)).toEqual([])
  })

  it('gives every Sell and Refinery bay row and button an icon, ore rows by their tier', () => {
    expect(unresolvedIconIds(sellBayIconsOf(sellBayWithOreAndRefined()), SHIPPED_ART)).toEqual([])
  })

  it('gives every bay its emblem', () => {
    const session = createScriptedSession()
    const emblems = PLATFORM_BAY_IDS.map((bay) => bayHeaderOf(session.state(), 'p1', bay).emblemId)
    expect(new Set(emblems).size).toBe(PLATFORM_BAY_IDS.length)
    expect(unresolvedIconIds(emblems, SHIPPED_ART)).toEqual([])
  })

  it('gives every artefact card, hint, transmission and setting an icon', () => {
    const session = createScriptedSession()
    const cards = selectArtefactChoiceModel(session.state(), 'p1')
    const settings = selectSettingsModel({
      prefs: DEFAULT_PREFERENCES,
      bindings: BINDINGS,
      bindingProblems: [],
      rebindingActionId: null,
    })
    const ids = [
      cards.titleIconId,
      ...cards.cards.map((card) => card.iconId),
      ...HINT_TABLE.hints.map((hint) => hint.iconId),
      ...settings.toggles.map((toggle) => toggle.iconId),
    ]
    expect(ids.length).toBeGreaterThanOrEqual(4 + HINT_TABLE.hints.length + 6)
    expect(unresolvedIconIds(ids, SHIPPED_ART)).toEqual([])
  })
})
