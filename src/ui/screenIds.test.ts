import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore, takeSessionSnapshot, useGameStore } from '../store/gameStore'
import { pressAction, releaseAction, resetInput } from '../store/inputRuntime'
import {
  readHudModel,
  readPlaqueModel,
  readSellBayModel,
  readSettingsModel,
  readUpgradeBayModel,
} from '../store/screenReads'
import { digTenMetresUntil } from '../systems/authority/casingDigFixtures'
import {
  createScriptedSession,
  dockInBay,
  FREEZE_ENEMIES,
  mineTile,
  PARAMS,
  surfaceOreTiles,
} from '../systems/authority/scriptedSession'
import {
  selectArtefactChoiceModel,
  type ArtefactChoiceModel,
} from '../systems/views/artefactChoiceModel'
import { artefactCacheTile } from '../systems/world/artefactCache'
import { plantOnWall, prepareBlaster } from '../systems/authority/charges/chargeFixtures'
import { ArtefactChoiceView } from './artefact/ArtefactChoiceView'
import { SliceScreenView } from './screens/SliceScreen'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import {
  setEnergyCommand,
  setGunLevelCommand,
  teleportToDockCommand,
} from '../systems/vehicle/vehicleCommands'
import { selectHudModel, type HudModel } from '../systems/views/hudModel'
import type { BayFooter, BayHeader } from '../systems/views/bayFrame'
import { selectSellBayModel, type SellBayModel } from '../systems/views/sellBayModel'
import { selectUpgradeBayModel, type UpgradeBayModel } from '../systems/views/upgradeBayModel'
import { selectRefineryBayModel, type RefineryBayModel } from '../systems/views/refineryBayModel'
import {
  dockAtBayOf,
  mineSurfaceOre,
  REFINERY_SITE,
  sessionOnPlanet,
} from '../systems/authority/refinery/refineryFixtures'
import type { PlaqueModel } from '../systems/views/plaqueModel'
import type { SettingsModel } from '../systems/views/settingsModel'
import { FACING } from '../systems/vehicle/vehiclePose'
import { HudView } from './hud/HudView'
import { UI_IDS, type UiId } from './ids'
import { RefineryBayView } from './platform/RefineryBayView'
import { SellBayView } from './platform/SellBayView'
import { UpgradeBayView } from './platform/UpgradeBayView'
import { PlaquesView } from './plaques/PlaquesView'
import { SettingsView } from './settings/SettingsView'

// #33 acceptance 12: the screens rendered on the server (no browser, no DOM) carry an element for
// every id in UI_IDS, and its text is the model's value. Ids, not markup shape, are the contract.

beforeEach(() => {
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
  resetGameStore()
  resetInput()
})

afterEach(() => uninstallRunLog())

const game = () => useGameStore.getState()

/** The text inside the element carrying `data-testid="id"`, tags stripped, or null if absent. */
function textOfTestId(html: string, id: string): string | null {
  const start = html.search(new RegExp(`<(\\w+)[^>]*data-testid="${id}"`))
  if (start < 0) return null
  const tag = /<(\w+)/.exec(html.slice(start))![1]
  let depth = 0
  const pattern = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g')
  pattern.lastIndex = start
  for (let match = pattern.exec(html); match !== null; match = pattern.exec(html)) {
    depth += match[1] === '/' ? -1 : 1
    if (depth === 0) return decode(html.slice(html.indexOf('>', start) + 1, match.index))
  }
  return null
}

function decode(inner: string): string {
  return inner
    .replace(/<[^>]*>/g, '')
    .replace(/<!-- -->/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
}

/** What each id's text must be; null for a gauge dial, which shows a needle and no text. */
function hudTexts(model: HudModel): Partial<Record<UiId, string | null>> {
  return {
    [UI_IDS.hudEnergyGauge]: null,
    [UI_IDS.hudEnergyText]: model.energy.text,
    [UI_IDS.hudHullGauge]: null,
    [UI_IDS.hudHullText]: model.hull.text,
    [UI_IDS.hudCargoGauge]: null,
    [UI_IDS.hudCargoText]: model.cargo.text,
    [UI_IDS.hudCargoCore]: model.cargo.coreText,
    [UI_IDS.hudCargoValue]: model.cargoValue.text,
    ...(model.liningBill === null ? {} : { [UI_IDS.hudLiningBill]: model.liningBill.text }),
    [UI_IDS.hudDepth]: model.depth.text,
    [UI_IDS.hudBand]: String(model.depth.band),
    ...(model.casing === null ? {} : { [UI_IDS.hudCasing]: model.casing.text }),
    ...(model.guns === null ? {} : { [UI_IDS.hudGuns]: model.guns.text }),
    ...(model.guns?.isIdle === true ? { [UI_IDS.hudGunsIdle]: model.guns.idleText } : {}),
    ...(model.charges === null ? {} : { [UI_IDS.hudCharges]: model.charges.text }),
    ...(model.chargeFuse === null ? {} : { [UI_IDS.hudChargeFuse]: model.chargeFuse.text }),
    ...(model.heat === null
      ? {}
      : { [UI_IDS.hudHeatGauge]: null, [UI_IDS.hudHeatText]: model.heat.text }),
    ...(model.heat?.isThrottled === true
      ? { [UI_IDS.hudHeatThrottled]: model.heat.throttledText }
      : {}),
    [UI_IDS.hudTileTime]: model.tileTime.text,
    [UI_IDS.hudStatuses]: null,
    [UI_IDS.hudState]: model.vehicleState.text,
    ...(model.cargo.isFull ? { [UI_IDS.hudCargoFull]: 'FULL' } : {}),
    ...(model.dockArrow === null
      ? {}
      : { [UI_IDS.hudCompassDock]: String(model.dockArrow.distance) }),
    ...(model.coreDistance === null
      ? {}
      : { [UI_IDS.hudCoreDistance]: String(model.coreDistance) }),
    ...(model.vehicleState.rescueCountdownTicks === null
      ? {}
      : { [UI_IDS.hudRescueCountdown]: model.vehicleState.rescueCountdownText }),
    ...(model.dockPrompt.isShown ? { [UI_IDS.hudDockPrompt]: model.dockPrompt.text } : {}),
    ...(model.cachePrompt.isShown ? { [UI_IDS.hudCachePrompt]: model.cachePrompt.text } : {}),
    ...(model.isDebugRun ? { [UI_IDS.hudDebugMark]: 'DEBUG RUN' } : {}),
    ...(model.warning.level === 'ok' ? {} : { [UI_IDS.hudWarningEnergy]: model.warning.text }),
  }
}

function bayFrameTexts(header: BayHeader, footer: BayFooter): Partial<Record<UiId, string | null>> {
  return {
    [UI_IDS.platformScreen]: null,
    [UI_IDS.platformMoney]: header.money.text,
    [UI_IDS.platformPlanet]: String(header.planet),
    [UI_IDS.platformCoreBayGauge]: null,
    [UI_IDS.platformCoreBay]: header.coreBay.text,
    [UI_IDS.platformState]: header.platformStateText,
    [UI_IDS.platformUndock]: footer.undock.label,
    [UI_IDS.platformSettings]: footer.settings.label,
    ...(footer.travel === null
      ? { [UI_IDS.platformEndCard]: null }
      : {
          [UI_IDS.platformTravel]: footer.travel.button.label,
          [UI_IDS.platformTravelFee]: footer.travel.fee.text,
          [UI_IDS.platformTravelFragments]: footer.travel.fragmentsText,
          ...(footer.travel.isArmed ? { [UI_IDS.platformTravelConfirm]: null } : {}),
        }),
  }
}

function sellBayTexts(model: SellBayModel): Partial<Record<UiId, string | null>> {
  const { shop, charging, quickService } = model
  return {
    ...bayFrameTexts(model.header, model.footer),
    [UI_IDS.sellbayScreen]: null,
    [UI_IDS.shopCargoTotal]: shop.cargoTotalText,
    [UI_IDS.shopSellAll]: shop.sellAll.label,
    [UI_IDS.shopSellAllValue]: shop.sellAllValue.text,
    [UI_IDS.chargingEnergy]: charging.energyText,
    [UI_IDS.chargingPrice]: charging.price.text,
    [UI_IDS.chargingCost]: charging.cost.text,
    [UI_IDS.chargingRecharge]: charging.recharge.label,
    [UI_IDS.platformQuickService]: quickService.button.label,
    [UI_IDS.platformQuickTotal]: quickService.total.text,
  }
}

function upgradeBayTexts(model: UpgradeBayModel): Partial<Record<UiId, string | null>> {
  const { repair, casing } = model
  return {
    ...bayFrameTexts(model.header, model.footer),
    [UI_IDS.upgradebayScreen]: null,
    [UI_IDS.workshopHull]: repair.hullText,
    [UI_IDS.workshopRepair]: repair.button.label,
    [UI_IDS.workshopRepairCost]: repair.cost.text,
    [UI_IDS.workshopVisualTier]: String(model.visualTier),
    [UI_IDS.upgradebayCasing]: null,
    [UI_IDS.upgradebayCasingGrade]: casing.gradeText,
    [UI_IDS.upgradebayCasingCost]: casing.cost.text,
    [UI_IDS.upgradebayCasingBuy]: casing.buy.label,
    ...(model.lining === null
      ? {}
      : {
          [UI_IDS.upgradebayLining]: null,
          [UI_IDS.upgradebayLiningActive]: model.lining.activeText,
          [UI_IDS.upgradebayLiningCost]: model.lining.cost.text,
          [UI_IDS.upgradebayLiningEffect]: model.lining.effectText,
          [UI_IDS.upgradebayLiningButton]: model.lining.button.label,
        }),
    ...(model.guns === null
      ? {}
      : {
          [UI_IDS.upgradebayGuns]: null,
          [UI_IDS.upgradebayGunsLevel]: model.guns.levelText,
          [UI_IDS.upgradebayGunsCost]: model.guns.cost.text,
          [UI_IDS.upgradebayGunsEffect]: model.guns.effectText,
          [UI_IDS.upgradebayGunsBuy]: model.guns.buy.label,
        }),
    ...(model.charges === null
      ? {}
      : {
          [UI_IDS.upgradebayCharges]: null,
          [UI_IDS.upgradebayChargesCarried]: model.charges.restock[0].levelText,
          [UI_IDS.upgradebayChargesCost]: model.charges.restock[0].cost?.text ?? '-',
          [UI_IDS.upgradebayChargesEffect]: model.charges.restock[0].effectText,
          [UI_IDS.upgradebayChargesRestock]: model.charges.restock[0].buy.label,
          [UI_IDS.upgradebayRack]: null,
          [UI_IDS.upgradebayRackSize]: model.charges.rack.levelText,
          [UI_IDS.upgradebayRackCost]: model.charges.rack.cost?.text ?? '-',
          [UI_IDS.upgradebayRackEffect]: model.charges.rack.effectText,
          [UI_IDS.upgradebayRackBuy]: model.charges.rack.buy.label,
        }),
    [UI_IDS.upgradebayPreview]: null,
    [UI_IDS.upgradebayQuickService]: model.quickService.label,
  }
}

function refineryBayTexts(model: RefineryBayModel): Partial<Record<UiId, string | null>> {
  return {
    ...bayFrameTexts(model.header, model.footer),
    [UI_IDS.refinerybayScreen]: null,
    [UI_IDS.refinerybayBatchCap]: model.batchCapText,
    [UI_IDS.refinerybaySlotBuy]: model.buySlot.label,
    [UI_IDS.refinerybaySlotPrice]: model.slotPrice?.text ?? null,
  }
}

function refinedTexts(model: SellBayModel): Partial<Record<UiId, string | null>> {
  if (model.refined === null) return {}
  return {
    [UI_IDS.sellbayRefined]: null,
    [UI_IDS.sellbayRefinedTotal]: model.refined.total.text,
    [UI_IDS.sellbayRefinedCollect]: model.refined.collect.label,
  }
}

function liningTexts(model: SellBayModel): Partial<Record<UiId, string | null>> {
  if (model.lining === null) return {}
  return {
    [UI_IDS.sellbayLining]: null,
    [UI_IDS.sellbayLiningBilled]: model.lining.billed.text,
    [UI_IDS.sellbayLiningPaid]: model.lining.paid.text,
    [UI_IDS.sellbayLiningForgiven]: model.lining.forgiven.text,
  }
}

function settingsTexts(model: SettingsModel): Partial<Record<UiId, string | null>> {
  return {
    [UI_IDS.settingsPanel]: null,
    [UI_IDS.settingsResetBindings]: model.reset.label,
    [UI_IDS.settingsClose]: model.close.label,
    ...(model.bindingProblems.length > 0
      ? { [UI_IDS.settingsBindingProblems]: model.bindingProblems.join('') }
      : {}),
  }
}

function artefactChoiceTexts(model: ArtefactChoiceModel): Partial<Record<UiId, string | null>> {
  return { [UI_IDS.artefactChoice]: null, [UI_IDS.artefactLeave]: model.leave.label }
}

function plaqueTexts(model: PlaqueModel): Partial<Record<UiId, string | null>> {
  return {
    ...(model.hint === null ? {} : { [UI_IDS.hudHintPlaque]: model.hint.lines.join('') }),
    ...(model.transmission === null
      ? {}
      : { [UI_IDS.hudTransmission]: model.transmission.lines.join('') }),
  }
}

/** Renders a screen and checks every expected id; returns the ids it found. */
function checkScreen(element: ReactElement, texts: Partial<Record<UiId, string | null>>): string[] {
  const html = renderToString(element)
  for (const [id, text] of Object.entries(texts)) {
    const shown = textOfTestId(html, id)
    expect(shown, `${id} is rendered`).not.toBeNull()
    if (text !== null) expect(shown, `${id} shows the model value`).toBe(text)
  }
  return Object.keys(texts)
}

/** A fake slice's full screen in the shell's frame (ticket 211); the frame carries no model text. */
function renderSliceScreen(): string[] {
  const probe: SliceDefinition = {
    id: 'ids-probe',
    register: (r) => r.screen({ id: 'ids-probe.screen', priority: 0, render: () => null }),
  }
  const frame = createElement(SliceScreenView, {
    openScreenId: 'ids-probe.screen',
    onDismiss: () => undefined,
  })
  return withRegistrations([probe], () => checkScreen(frame, { [UI_IDS.sliceScreen]: null }))
}

function renderHud(): string[] {
  const model = readHudModel()
  return checkScreen(createElement(HudView, { model, isFlashing: true }), hudTexts(model))
}

function renderPlaques(): string[] {
  const model = readPlaqueModel()
  return checkScreen(createElement(PlaquesView, { model }), plaqueTexts(model))
}

function renderSellBay(): string[] {
  const model = readSellBayModel()
  const element = createElement(SellBayView, { model, focusedId: 'platform-quick-service' })
  return checkScreen(element, sellBayTexts(model))
}

function renderUpgradeBay(): string[] {
  const model = readUpgradeBayModel()
  const element = createElement(UpgradeBayView, { model, focusedId: '' })
  return checkScreen(element, upgradeBayTexts(model))
}

/**
 * On planet 3 (#105): the Refinery bay with ore in the hold and a batch refining, then the Sell
 * bay once the batch is ready, with its refined line and Collect.
 */
function renderRefineryScreens(): string[] {
  const session = sessionOnPlanet(3, '1e30')
  session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_power', level: 250 } })
  session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_tip', level: 130 } })
  const tick = mineSurfaceOre(session, 10, 6)
  dockAtBayOf(session, tick, REFINERY_SITE, 'refinery')
  const tier = Number.parseInt(Object.keys(session.vehicle().cargo.ore)[0], 10)
  session.submit(tick + 1, { type: 'queueRefine', payload: { resourceTier: tier, units: 2 } })
  const ui = {
    isTravelArmed: false,
    isQuickServiceHighlighted: false,
    focusedId: null,
    installingUpgradeId: null,
  }
  const refinery = selectRefineryBayModel(session.state(), 'p1', ui)
  expect(refinery.ore.length).toBeGreaterThan(0)
  dockAtBayOf(session, tick + 2 + 180 * 60, REFINERY_SITE, 'sell')
  const sell = selectSellBayModel(session.state(), 'p1', ui)
  expect(sell.refined?.lines).toHaveLength(1)
  return [
    ...checkScreen(
      createElement(RefineryBayView, { model: refinery, focusedId: '' }),
      refineryBayTexts(refinery),
    ),
    ...checkScreen(createElement(SellBayView, { model: sell, focusedId: '' }), refinedTexts(sell)),
  ]
}

/** After a 10 m dig (#128): the Sell bay mid-visit, its first sale having paid the lining bill. */
function renderLiningVisit(): string[] {
  const { session, end } = digTenMetresUntil(1, '0')
  mineTile(session, end + 100, surfaceOreTiles(1)[0])
  dockInBay(session, end + 200, 'sell')
  session.submit(end + 200, { type: 'sellCargo', payload: { resourceTier: 'all' } })
  const model = selectSellBayModel(session.state(), 'p1', {
    isTravelArmed: false,
    isQuickServiceHighlighted: false,
    focusedId: null,
    installingUpgradeId: null,
  })
  expect(model.lining).not.toBeNull()
  return checkScreen(createElement(SellBayView, { model, focusedId: '' }), liningTexts(model))
}

function renderSettings(): string[] {
  const model = readSettingsModel()
  return checkScreen(
    createElement(SettingsView, { model, focusedId: 'settings-close' }),
    settingsTexts(model),
  )
}

/** The store mines through the live physics loop only, so a full hold comes from a script. */
function sessionWithOre(units: number) {
  const session = createScriptedSession()
  surfaceOreTiles(units).forEach((tile, index) => mineTile(session, 1 + index * 50, tile))
  return session
}

function renderFullHoldHud(): string[] {
  const session = sessionWithOre(10)
  const model = selectHudModel({
    state: session.state(),
    playerId: 'p1',
    depthTiles: 0,
    bindings: game().bindings,
  })
  expect(model.cargo.isFull).toBe(true)
  return checkScreen(createElement(HudView, { model, isFlashing: false }), hudTexts(model))
}

/** The HUD over the planet's artefact cache, and the cache's cards (#46). */
function renderAtArtefactCache(): string[] {
  const session = createScriptedSession()
  const cache = artefactCacheTile(PARAMS)
  session.submit(1, FREEZE_ENEMIES)
  session.submit(2, { ...strandedPoseIntent(), payload: poseOnTile(cache) })
  const hud = selectHudModel({
    state: session.state(),
    playerId: 'p1',
    depthTiles: 0,
    bindings: game().bindings,
  })
  expect(hud.cachePrompt.isShown).toBe(true)
  const cards = selectArtefactChoiceModel(session.state(), 'p1')
  return [
    ...checkScreen(createElement(HudView, { model: hud, isFlashing: false }), hudTexts(hud)),
    ...checkScreen(
      createElement(ArtefactChoiceView, { model: cards, focusedId: 'artefact-leave' }),
      artefactChoiceTexts(cards),
    ),
  ]
}

/** The HUD with the guns held back by low steam, then planet 4's Upgrade bay offering their next level (#107). */
function renderWithGuns(): string[] {
  const session = createScriptedSession()
  session.submit(1, setGunLevelCommand(10))
  session.submit(1, setEnergyCommand('37.75'))
  const hud = selectHudModel({
    state: session.state(),
    playerId: 'p1',
    depthTiles: 0,
    bindings: game().bindings,
  })
  expect(hud.guns?.isIdle).toBe(true)
  session.submit(2, { type: 'debug.setPlanet', payload: { planetIndex: 4 } })
  session.submit(2, teleportToDockCommand('upgrade'))
  const bay = selectUpgradeBayModel(session.state(), 'p1', {
    isTravelArmed: false,
    isQuickServiceHighlighted: false,
    focusedId: null,
    installingUpgradeId: null,
  })
  expect(bay.guns).not.toBeNull()
  return [
    ...checkScreen(createElement(HudView, { model: hud, isFlashing: false }), hudTexts(hud)),
    ...checkScreen(
      createElement(UpgradeBayView, { model: bay, focusedId: '' }),
      upgradeBayTexts(bay),
    ),
  ]
}

/**
 * The HUD with a charge lit on the wall ahead and the rack's count, then planet 7's Upgrade bay
 * offering a restock and a rack slot (#109).
 */
function renderWithCharges(): string[] {
  const session = createScriptedSession()
  prepareBlaster(session, 1)
  plantOnWall(session, 2)
  const hud = selectHudModel({
    state: session.state(),
    playerId: 'p1',
    depthTiles: 0,
    bindings: game().bindings,
  })
  expect(hud.chargeFuse).not.toBeNull()
  const bay = upgradeBayOn(7)
  expect(bay.charges).not.toBeNull()
  return [
    ...checkScreen(createElement(HudView, { model: hud, isFlashing: false }), hudTexts(hud)),
    ...checkScreen(
      createElement(UpgradeBayView, { model: bay, focusedId: '' }),
      upgradeBayTexts(bay),
    ),
  ]
}

/** Planet 8's HUD with the drill throttled by heat, then its Upgrade bay offering refractory (#113). */
function renderWithHeat(): string[] {
  const session = createScriptedSession()
  session.submit(1, { type: 'debug.setPlanet', payload: { planetIndex: 8 } })
  session.submit(1, { type: 'debug.setHeat', payload: { heat: 80 } })
  const hud = selectHudModel({
    state: session.state(),
    playerId: 'p1',
    depthTiles: 0,
    bindings: game().bindings,
  })
  expect(hud.heat?.isThrottled).toBe(true)
  session.submit(2, teleportToDockCommand('upgrade'))
  const bay = selectUpgradeBayModel(session.state(), 'p1', {
    isTravelArmed: false,
    isQuickServiceHighlighted: false,
    focusedId: null,
    installingUpgradeId: null,
  })
  expect(bay.lining).not.toBeNull()
  return [
    ...checkScreen(createElement(HudView, { model: hud, isFlashing: false }), hudTexts(hud)),
    ...checkScreen(
      createElement(UpgradeBayView, { model: bay, focusedId: '' }),
      upgradeBayTexts(bay),
    ),
  ]
}

function upgradeBayOn(planetIndex: number): UpgradeBayModel {
  const session = createScriptedSession()
  session.submit(1, { type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit(1, teleportToDockCommand('upgrade'))
  return selectUpgradeBayModel(session.state(), 'p1', {
    isTravelArmed: false,
    isQuickServiceHighlighted: false,
    focusedId: null,
    installingUpgradeId: null,
  })
}

function strandedPoseIntent() {
  return { type: 'reportPose' as const, payload: strandedPose }
}

function poseOnTile(tile: { tx: number; ty: number }) {
  return { ...strandedPose, x: tile.tx * 1000 + 500, y: tile.ty * 1000 + 500 }
}

function tap(action: Parameters<typeof pressAction>[0]): void {
  pressAction(action)
  releaseAction(action)
}

const strandedPose = {
  x: 20_500,
  y: 297_500,
  vx: 0,
  vy: 0,
  upx: 0,
  upy: 1024,
  facing: FACING.right,
  driving: false,
  thrusting: false,
  drilling: false,
  thrustTicks: 0,
  driveTicks: 0,
  drillTicks: 0,
}

/** Every UI_IDS id, across the screens and states that show them. */
function expectEveryIdRendered(): void {
  const found = new Set<string>()
  const keep = (ids: string[]) => ids.forEach((id) => found.add(id))
  keep(renderHud())
  game().startPlaques()
  keep(renderPlaques())
  tap('interact')
  game().setCoreFragments(63)
  game().giveMoney('60.8')
  game().pressScreenButton('platform-travel')
  keep(renderSellBay())
  keep(renderUpgradeBay())
  game().setBindings({ lift: { keyboard: ['KeyE'] } })
  keep(renderSettings())
  game().pressScreenButton('platform-travel')
  tap('interact')
  keep(renderSellBay())
  tap('ui_cancel')
  game().setUpgrade('cargo_hold', 0)
  game().reportPose(strandedPose)
  game().setEnergy('0')
  keep(renderHud())
  keep(renderFullHoldHud())
  keep(renderAtArtefactCache())
  keep(renderWithGuns())
  keep(renderWithCharges())
  keep(renderWithHeat())
  keep(renderRefineryScreens())
  keep(renderLiningVisit())
  keep(renderSliceScreen())
  expect(Object.values(UI_IDS).filter((id) => !found.has(id))).toEqual([])
}

/** A stand-in describer: what the row draws once any describer answers, not what it says. */
const DESCRIBER_PROBE: SliceDefinition = {
  id: 'ids-describer',
  register: (r) =>
    r.itemDescriber({
      id: 'ids-describer.cards',
      describe: () => ({ flavour: 'A probe.', statLines: [] }),
    }),
}

describe('screen ids (#33 acceptance 12)', () => {
  // The ids are the empty fast path's contract: with a describer registered, a shop row draws as
  // its item card, whose contract is `data-item-card` plus the buy id (GD and TD locks on #164).
  it('renders every UI_IDS id somewhere with the model value as its text', () => {
    withRegistrations([], expectEveryIdRendered)
  })

  it('draws each Upgrade bay row as its item card, carrying the buy id, once a describer answers', () => {
    game().giveMoney('1e6')
    game().teleportToDock('upgrade')
    const model = readUpgradeBayModel()
    const html = withRegistrations([DESCRIBER_PROBE], () =>
      renderToString(
        createElement(UpgradeBayView, { model: readUpgradeBayModel(), focusedId: '' }),
      ),
    )
    for (const buy of [...model.tracks.map((row) => row.buy), model.casing.buy]) {
      expect(html).toMatch(new RegExp(`data-item-card="[^"]+"[^>]*data-testid="${buy.id}"`))
    }
    expect(textOfTestId(html, UI_IDS.upgradebayCasing)).toBeNull()
  })

  it('marks the preview with the focused track and the tier after its purchase, digest untouched', () => {
    game().setUpgrade('boiler', 70)
    game().setUpgrade('engine', 9)
    game().teleportToDock('upgrade')
    const digest = takeSessionSnapshot().digest
    game().moveFocus(1)
    game().moveFocus(1)
    const html = renderToString(
      createElement(UpgradeBayView, { model: readUpgradeBayModel(), focusedId: '' }),
    )
    expect(html).toMatch(
      /data-testid="upgradebay-preview" data-highlight="engine" data-visual-tier="2"/,
    )
    expect(takeSessionSnapshot().digest).toBe(digest)
  })

  it('carries the tier and family on every shop row', () => {
    const session = sessionWithOre(4)
    session.submit(400, teleportToDockCommand('sell'))
    const model = selectSellBayModel(session.state(), 'p1', {
      isTravelArmed: false,
      isQuickServiceHighlighted: false,
      focusedId: null,
      installingUpgradeId: null,
    })
    const html = renderToString(createElement(SellBayView, { model, focusedId: '' }))
    const rows = [...html.matchAll(/data-testid="shop-row-\d+"[^>]*/g)]
    expect(rows.length).toBe(model.shop.rows.length)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row[0]).toMatch(/data-tier="\d+"/)
      expect(row[0]).toMatch(/data-family="mixed"/)
    }
  })
})
