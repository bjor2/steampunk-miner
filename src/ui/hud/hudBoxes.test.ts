import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore } from '../../store/gameStore'
import { readHudModel, readTouchSituation } from '../../store/screenReads'
import { HINT_TABLE } from '../../systems/hints/hintTable'
import { TOUCH_HELD_ANCHOR_IDS } from '../../systems/input/touchBindings'
import { touchBindingRows } from '../registries/touchBindings'
import { PlaquesView } from '../plaques/PlaquesView'
import { TouchControlsView } from '../touch/TouchControls'
import { ToolSlotBarView } from '../toolSlots/ToolSlotBar'
import { everyReadoutOf } from './hudFixtures'
import { HUD_BOX_IDS, HUD_ZONE_ATTRIBUTE, STICK_ZONE_ID } from './hudBoxes'
import { HudView } from './HudView'

// #500 TD shape 4.1: every HUD box carries `data-hud` on its root, so the layout specs can measure
// it. A server render from props draws each box as the game would.

const PLAQUES = {
  hint: { id: 'hint_sell', iconId: 'icon-hint', lines: ['Ore fills your cargo hold.'] },
  transmission: { id: 'tx_intro', iconId: 'icon-transmission', lines: ['Welcome, driller.'] },
}

/** The bar with Plant charge on it (ticket 691): its cell is a `tool-slot` box. */
const PLANT_TOOL = {
  rowId: 'kernel.tool_plant_charge',
  position: 9,
  face: {
    iconId: 'icon-charges',
    name: 'Plant charge',
    cooldownPercent: 0,
    chargesLeft: 0,
    chargesMax: 0,
    isOn: false,
    isActing: false,
  },
}

const hudBoxesIn = (html: string) => [...html.matchAll(/data-hud="([^"]+)"/g)].map((m) => m[1])

function drawEveryBox(): string {
  const hud = createElement(HudView, { model: everyReadoutOf(readHudModel()), isFlashing: false })
  const touch = createElement(TouchControlsView, {
    situation: readTouchSituation(),
    isLeftHanded: false,
  })
  const bar = createElement(ToolSlotBarView, {
    tools: [PLANT_TOOL],
    kind: 'phone',
    isDetailOpen: false,
    isLeftHanded: false,
    isRaised: false,
    isOverCluster: false,
  })
  return [hud, createElement(PlaquesView, { model: PLAQUES }), touch, bar]
    .map((element) => renderToString(element))
    .join('')
}

beforeEach(() => resetGameStore())

describe('HUD boxes (#500)', () => {
  it('lists each data-hud id once', () => {
    const ids = Object.values(HUD_BOX_IDS)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('sets data-hud on every HUD box root, the loaded tech tree button included', () => {
    const boxes = new Set(hudBoxesIn(drawEveryBox()))
    expect([...boxes].sort()).toEqual(Object.values(HUD_BOX_IDS).sort())
  })

  it('draws one data-hud box per threat marker, never one for the threats layer', () => {
    const html = renderToString(
      createElement(HudView, { model: everyReadoutOf(readHudModel()), isFlashing: false }),
    )
    const markers = everyReadoutOf(readHudModel()).threats.length
    expect(hudBoxesIn(html).filter((id) => id === HUD_BOX_IDS.threat)).toHaveLength(markers)
  })

  it('sets data-hud on each touch control button and data-hud-zone on the stick zone', () => {
    const html = renderToString(
      createElement(TouchControlsView, { situation: readTouchSituation(), isLeftHanded: false }),
    )
    const buttons = html.match(/<button/g) ?? []
    expect(buttons.length).toBeGreaterThan(0)
    expect(hudBoxesIn(html)).toEqual(buttons.map(() => HUD_BOX_IDS.control))
    expect(html).toContain(`${HUD_ZONE_ATTRIBUTE}="${STICK_ZONE_ID}"`)
  })
})

describe('HUD boxes of held items (#500, HS)', () => {
  it.each(TOUCH_HELD_ANCHOR_IDS)(
    'gives the held %s no HUD box, no touch control and no hint',
    (id) => {
      const anchors = touchBindingRows().map((row) => JSON.stringify(row.anchor))
      expect(anchors.filter((anchor) => anchor.includes(id))).toEqual([])
      expect(HINT_TABLE.hints.filter((hint) => JSON.stringify(hint).includes(id))).toEqual([])
      expect(drawEveryBox()).not.toContain(id)
    },
  )
})
