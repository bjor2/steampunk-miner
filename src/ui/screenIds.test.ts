import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore, useGameStore } from '../store/gameStore'
import { pressAction, releaseAction, resetInput } from '../store/inputRuntime'
import {
  readHudModel,
  readPlaqueModel,
  readPlatformModel,
  readSettingsModel,
} from '../store/screenReads'
import {
  createScriptedSession,
  mineTile,
  surfaceOreTiles,
} from '../systems/authority/scriptedSession'
import { teleportToDockCommand } from '../systems/vehicle/vehicleCommands'
import { selectHudModel, type HudModel } from '../systems/views/hudModel'
import { selectPlatformModel, type PlatformModel } from '../systems/views/platformModel'
import type { PlaqueModel } from '../systems/views/plaqueModel'
import type { SettingsModel } from '../systems/views/settingsModel'
import { FACING } from '../systems/vehicle/vehiclePose'
import { HudView } from './hud/HudView'
import { UI_IDS, type UiId } from './ids'
import { PlatformView } from './platform/PlatformView'
import { PlaquesView } from './plaques/PlaquesView'
import { SettingsView } from './settings/SettingsView'

// #33 acceptance 12: both screens rendered on the server (no browser, no DOM) carry an element for
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
    [UI_IDS.hudDepth]: model.depth.text,
    [UI_IDS.hudBand]: String(model.depth.band),
    [UI_IDS.hudTileTime]: model.tileTime.text,
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
    ...(model.isDebugRun ? { [UI_IDS.hudDebugMark]: 'DEBUG RUN' } : {}),
    ...(model.warning.level === 'ok' ? {} : { [UI_IDS.hudWarningEnergy]: model.warning.text }),
  }
}

function platformTexts(model: PlatformModel): Partial<Record<UiId, string | null>> {
  const { header, shop, workshop, charging, footer } = model
  return {
    [UI_IDS.platformScreen]: null,
    [UI_IDS.platformMoney]: header.money.text,
    [UI_IDS.platformPlanet]: String(header.planet),
    [UI_IDS.platformCoreBayGauge]: null,
    [UI_IDS.platformCoreBay]: header.coreBay.text,
    [UI_IDS.platformState]: header.platformStateText,
    [UI_IDS.shopCargoTotal]: shop.cargoTotalText,
    [UI_IDS.shopSellAll]: shop.sellAll.label,
    [UI_IDS.shopSellAllValue]: shop.sellAllValue.text,
    [UI_IDS.workshopHull]: workshop.hullText,
    [UI_IDS.workshopRepair]: workshop.repair.label,
    [UI_IDS.workshopRepairCost]: workshop.repairCost.text,
    [UI_IDS.workshopVisualTier]: String(workshop.visualTier),
    [UI_IDS.chargingEnergy]: charging.energyText,
    [UI_IDS.chargingPrice]: charging.price.text,
    [UI_IDS.chargingCost]: charging.cost.text,
    [UI_IDS.chargingRecharge]: charging.recharge.label,
    [UI_IDS.platformQuickService]: footer.quickService.label,
    [UI_IDS.platformQuickTotal]: footer.quickTotal.text,
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

function renderHud(): string[] {
  const model = readHudModel()
  return checkScreen(createElement(HudView, { model, isFlashing: true }), hudTexts(model))
}

function renderPlaques(): string[] {
  const model = readPlaqueModel()
  return checkScreen(createElement(PlaquesView, { model }), plaqueTexts(model))
}

function renderPlatform(): string[] {
  const model = readPlatformModel()
  const element = createElement(PlatformView, { model, focusedId: 'platform-quick-service' })
  return checkScreen(element, platformTexts(model))
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

describe('screen ids (#33 acceptance 12)', () => {
  it('renders every UI_IDS id somewhere with the model value as its text', () => {
    const found = new Set<string>()
    const keep = (ids: string[]) => ids.forEach((id) => found.add(id))
    keep(renderHud())
    game().startPlaques()
    keep(renderPlaques())
    tap('interact')
    game().setCoreFragments(63)
    game().giveMoney('60.8')
    game().pressScreenButton('platform-travel')
    keep(renderPlatform())
    game().setBindings({ lift: { keyboard: ['KeyE'] } })
    keep(renderSettings())
    game().pressScreenButton('platform-travel')
    tap('interact')
    keep(renderPlatform())
    tap('ui_cancel')
    game().setUpgrade('cargo_hold', 0)
    game().reportPose(strandedPose)
    game().setEnergy('0')
    keep(renderHud())
    keep(renderFullHoldHud())
    expect(Object.values(UI_IDS).filter((id) => !found.has(id))).toEqual([])
  })

  it('carries the tier and family on every shop row', () => {
    const session = sessionWithOre(4)
    session.submit(400, teleportToDockCommand())
    const model = selectPlatformModel(session.state(), 'p1', {
      isTravelArmed: false,
      isQuickServiceHighlighted: false,
    })
    const html = renderToString(createElement(PlatformView, { model, focusedId: '' }))
    const rows = [...html.matchAll(/data-testid="shop-row-\d+"[^>]*/g)]
    expect(rows.length).toBe(model.shop.rows.length)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row[0]).toMatch(/data-tier="\d+"/)
      expect(row[0]).toMatch(/data-family="mixed"/)
    }
  })
})
