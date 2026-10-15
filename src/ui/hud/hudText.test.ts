import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore } from '../../store/gameStore'
import { readHudModel } from '../../store/screenReads'
import { combatStatusStackOf } from '../../systems/views/combatStatuses'
import { GUN_IDLE_TEXT } from '../../systems/views/gunReading'
import { THROTTLED_TEXT } from '../../systems/views/heatReading'
import type { HudModel } from '../../systems/views/hudModel'
import { forgetUiTexts, registeredUiTexts } from '../../systems/views/uiText'
import { uiTextProblemsOf } from '../../systems/views/uiTextBudget'
import { unregisteredTextsOf } from '../../systems/views/unregisteredText'
import { HudView } from './HudView'

// Spec #422, pass #428: the start scenario draws only part of the HUD, so the budget test cannot
// see a warning, the fuse or a prompt. Here the HUD is handed a model with every readout and
// call-out up at once, as the model's own readers word them, and judged as the budget test does.

const THREAT = {
  kind: 'crawler' as const,
  iconId: 'icon-enemy-crawler',
  phase: 'windup' as const,
  octant: 2,
  arc: 'F' as const,
  ticksLeft: 10,
  isTremor: false,
}

/** Everything on at once: each warning, every optional line, more statuses than fit, a threat. */
function everyReadoutOf(model: HudModel): HudModel {
  const heat = {
    ...model.energy,
    iconId: 'icon-heat-lava',
    isThrottled: true,
    throttledText: THROTTLED_TEXT,
  }
  const chargeFuse = { ticksLeft: 30, isInsideBlast: true, text: 'CHARGE LIT 0.5 s: back off' }
  const warning = {
    ...model.warning,
    level: 'critical' as const,
    text: 'CRITICAL ENERGY: climb home now',
  }
  const vehicleState = {
    ...model.vehicleState,
    rescueCountdownTicks: 600,
    rescueCountdownText: 'tow in 10 s',
  }
  const cargo = { ...model.cargo, coreFragments: 2, coreText: '(2 core)', isFull: true }
  return {
    ...model,
    cargo,
    liningBill: model.cargoValue,
    casing: { text: 'G1', state: 'short' },
    guns: { mode: 'auto', text: 'Auto (G)', isIdle: true, idleText: GUN_IDLE_TEXT },
    boreAuto: { colour: 'amber', label: 'held', hold: 'docked', text: 'held: docked' },
    charges: { carried: 2, capacity: 4, text: '2/4 (C)' },
    chargeFuse,
    heat,
    dockArrow: { octant: 3, distance: 42 },
    coreDistance: 120,
    threats: [THREAT],
    statuses: combatStatusStackOf({
      hullPermille: 50,
      isCollapseWarned: true,
      chargeFuse,
      heat,
      warning,
      threats: [THREAT],
      cargo,
      vehicleState,
    }),
    vehicleState,
    dockPrompt: { isShown: true, text: 'Space: Dock at the Refinery bay' },
    cachePrompt: { isShown: true, text: 'Space: Ancient cache' },
    readyPrompt: { isShown: true, text: 'Scenario ready — press any key' },
    isDebugRun: true,
    warning,
  }
}

function drawEveryReadout(): string {
  const model = everyReadoutOf(readHudModel())
  return renderToString(createElement(HudView, { model, isFlashing: true }))
}

beforeEach(() => {
  resetGameStore()
  forgetUiTexts()
})

afterEach(() => forgetUiTexts())

describe('HUD text budget (spec #422, pass #428)', () => {
  it('draws every readout and call-out on a shared element, with no stray text', () => {
    const markup = drawEveryReadout()
    expect(markup).toContain('data-testid="hud-statuses"')
    expect(unregisteredTextsOf(markup)).toEqual([])
  })

  it('keeps every HUD element within the text budget and its tag rules', () => {
    drawEveryReadout()
    const texts = registeredUiTexts().filter((text) => text.id.startsWith('hud.'))
    expect(texts.length).toBeGreaterThan(20)
    expect(texts.flatMap(uiTextProblemsOf)).toEqual([])
  })

  it('shows the charges and the lining bill on the element, never in a tooltip', () => {
    drawEveryReadout()
    const lines = registeredUiTexts().flatMap((text) => text.lines)
    const held = lines.filter((line) => line.holds !== undefined)
    expect(held.map((line) => line.holds).sort()).toEqual(['charges', 'price'])
    expect(held.every((line) => line.tag === 'visible')).toBe(true)
  })

  it('opens no tooltip on the HUD, which lets every click through to the game', () => {
    drawEveryReadout()
    const hudTexts = registeredUiTexts().filter((text) => text.id.startsWith('hud.'))
    expect(hudTexts.flatMap((text) => text.tooltipLines)).toEqual([])
  })
})
