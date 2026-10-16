import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { submitCommand } from '../../store/authorityLink'
import { resetGameStore, useGameStore } from '../../store/gameStore'
import { readTouchSituation } from '../../store/screenReads'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import { isHeldAnchor, type TouchAnchor } from '../../systems/input/touchBindings'
import { RegistrationRefusedError } from '../../systems/registries/seal'
import type { TouchBindingRow } from '../registries/touchBindings'
import { touchBindingRows } from '../registries/touchBindings'
import { DEVICE_UI_IDS } from '../stage/deviceIds'
import { readShownTouchTileRowIds } from './TouchBindingTiles'
import { TouchControls, TouchControlsView } from './TouchControls'

// The touch binding tiles (#474): a fake slice registers rows through withRegistrations, so no real
// slice is imported. `crawler` is a planet 1 gate, so a row anchored on it is exposed at start.

const ITEM_ID = 'touch-probe.item'
const OPEN_ROW = { row: 'crawler' }
const PROBE_MARKUP = '<span data-testid="touch-probe">tile</span>'

function ProbeTile() {
  return createElement('span', { 'data-testid': 'touch-probe' }, 'tile')
}

function probeRow(id: string, anchor: TouchAnchor): TouchBindingRow {
  return { id, anchor, touch: { gesture: 'tap', action: 'use_slot_1' }, Tile: ProbeTile }
}

function probeSlice(...rows: TouchBindingRow[]): SliceDefinition {
  return {
    id: 'touch-probe',
    register: (r) => {
      r.content('vehicle-item', [
        { id: ITEM_ID, iconId: 'icon-panel-slots', slots: [], attach: null },
      ])
      rows.forEach((row) => r.touchBinding(row))
    },
  }
}

function touchMarkupWith(slices: readonly SliceDefinition[]): string {
  const view = createElement(TouchControlsView, {
    situation: readTouchSituation(),
    isLeftHanded: false,
  })
  return withRegistrations(slices, () => renderToString(view))
}

const testIdAt = (html: string, id: string) => html.indexOf(`data-testid="${id}"`)
const game = () => useGameStore.getState()

beforeEach(() => resetGameStore())

describe('touch binding tiles', () => {
  it('draws an exposed row tile inside the touch controls, after the cluster', () => {
    const html = touchMarkupWith([probeSlice(probeRow('touch-probe.open', OPEN_ROW))])
    expect(testIdAt(html, 'touch-probe')).toBeGreaterThan(
      testIdAt(html, DEVICE_UI_IDS.touchCluster),
    )
  })

  it('adds only the tile, and nothing while no row is registered', () => {
    const withTile = touchMarkupWith([probeSlice(probeRow('touch-probe.open', OPEN_ROW))])
    expect(withTile.replace(PROBE_MARKUP, '')).toBe(touchMarkupWith([]))
    expect(touchMarkupWith([])).not.toContain('touch-probe')
  })

  it('draws a tile once for all the rows it serves', () => {
    const slice = probeSlice(
      probeRow('touch-probe.a', OPEN_ROW),
      probeRow('touch-probe.b', OPEN_ROW),
    )
    expect(touchMarkupWith([slice]).split(PROBE_MARKUP)).toHaveLength(2)
  })

  it('exposes no control for an unowned item, and draws it once the item is owned', () => {
    const slice = probeSlice(probeRow('touch-probe.item', { row: ITEM_ID }))
    withRegistrations([slice], () => {
      expect(readShownTouchTileRowIds()).toEqual([])
      submitCommand(game().playerId, setVehicleLoadoutCommand({}, [ITEM_ID]))
      expect(readShownTouchTileRowIds()).toEqual(['touch-probe.item'])
    })
  })

  it('draws nothing while the touch controls are hidden', () => {
    const hidden = withRegistrations([probeSlice(probeRow('touch-probe.open', OPEN_ROW))], () =>
      renderToString(createElement(TouchControls)),
    )
    expect(hidden).toBe('')
  })
})

describe('touch binding seal', () => {
  const refusalOf = (row: TouchBindingRow) => () => withRegistrations([probeSlice(row)], () => 0)

  it('refuses a row anchored on a held item, so a held item never draws', () => {
    expect(refusalOf(probeRow('touch-probe.siphon', { row: 'power.slurry_siphon' }))).toThrow(
      RegistrationRefusedError,
    )
  })

  it('refuses a hold of a key press that names no tap path', () => {
    const hold = {
      ...probeRow('touch-probe.hold', OPEN_ROW),
      touch: { gesture: 'hold' as const, action: 'use_slot_1' as const },
    }
    expect(refusalOf(hold)).toThrow(/no tapPath/)
  })

  it('refuses a row with no tile whose action no kernel control presses', () => {
    const { Tile: _drawn, ...undrawn } = probeRow('touch-probe.undrawn', OPEN_ROW)
    expect(refusalOf(undrawn)).toThrow(/draws no control/)
  })

  it('refuses a slice row anchored on the kernel', () => {
    expect(refusalOf(probeRow('touch-probe.kernel', 'kernel'))).toThrow(/anchors the kernel/)
  })

  it('keeps a row with no tile that rides a kernel control, as the plunger rides plant', () => {
    const { Tile: _drawn, ...rider } = probeRow('touch-probe.rider', OPEN_ROW)
    const plant = { ...rider, touch: { gesture: 'tap' as const, action: 'plant_charge' as const } }
    expect(refusalOf(plant)).not.toThrow()
  })

  it('holds no row on a held item among the loaded slices', () => {
    expect(touchBindingRows().filter((row) => isHeldAnchor(row.anchor))).toEqual([])
  })
})
