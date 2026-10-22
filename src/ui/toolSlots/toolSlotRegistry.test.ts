import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { submitCommand } from '../../store/authorityLink'
import { resetGameStore, useGameStore } from '../../store/gameStore'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import type { ToolFace } from '../../systems/input/toolSlots'
import { RegistrationRefusedError } from '../../systems/registries/seal'
import { HUD_BOX_ATTRIBUTE } from '../hud/hudBoxes'
import { UI_IDS } from '../ids'
import { toolSlotRows, type ToolSlotRow } from '../registries/toolSlots'
import { touchBindingRows } from '../registries/touchBindings'
import { ToolSlotBar } from './ToolSlotBar'
import { readShownTools } from './toolSlotReads'

// The tool slot bar's registry (ticket 691): a fake slice registers rows through withRegistrations,
// so no real slice is imported; the seal holds them to the bar's rules and the #474 binding rules.

const ITEM_ID = 'tool-probe.item'
const FACE: ToolFace = {
  iconId: 'icon-panel-slots',
  name: 'Probe',
  cooldownPercent: 40,
  chargesLeft: 2,
  chargesMax: 3,
  isOn: false,
  isActing: false,
}

/** Position 1 is Digit1's, which presses `use_slot_1`; the kernel holds 9-11, so 12 is free. */
function probeRow(overrides: Partial<ToolSlotRow> = {}): ToolSlotRow {
  return {
    id: 'tool-probe.tool',
    anchor: { row: ITEM_ID },
    touch: { gesture: 'tap', action: 'use_slot_1' },
    position: 12,
    faceOf: () => FACE,
    ...overrides,
  }
}

function probeSlice(...rows: ToolSlotRow[]): SliceDefinition {
  return {
    id: 'tool-probe',
    register: (r) => {
      r.content('vehicle-item', [
        { id: ITEM_ID, iconId: 'icon-panel-slots', slots: [], attach: null },
      ])
      rows.forEach((row) => r.toolSlot(row))
    },
  }
}

const game = () => useGameStore.getState()
const ownProbe = () => submitCommand(game().playerId, setVehicleLoadoutCommand({}, [ITEM_ID]))
const refusalOf = (row: ToolSlotRow) => () => withRegistrations([probeSlice(row)], () => 0)
const barMarkup = () =>
  renderToString(
    createElement(ToolSlotBar, {
      kind: 'phone',
      isDetailOpen: false,
      isLeftHanded: false,
      isRaised: false,
    }),
  )
const toolBoxesIn = (html: string) => html.split(`${HUD_BOX_ATTRIBUTE}="tool-slot"`).length - 1

beforeEach(() => resetGameStore())

describe('tool slot bar', () => {
  it('shows a row only once its anchor is owned and its face answers', () => {
    withRegistrations([probeSlice(probeRow())], () => {
      expect(readShownTools()).toEqual([])
      ownProbe()
      expect(readShownTools()).toEqual([{ rowId: 'tool-probe.tool', position: 12, face: FACE }])
    })
  })

  it('shows nothing for a row whose face reads null, owned or not', () => {
    withRegistrations([probeSlice(probeRow({ faceOf: () => null }))], () => {
      ownProbe()
      expect(readShownTools()).toEqual([])
    })
  })

  it('draws only the gear with no tool shown, no bar and no tool box (#173 acceptance 3)', () => {
    const html = barMarkup()
    expect(html).toContain(`data-testid="${UI_IDS.hudGear}"`)
    expect(html).not.toContain(`data-testid="${UI_IDS.hudToolSlots}"`)
    expect(toolBoxesIn(html)).toBe(0)
  })

  it('draws an owned tool as one icon cell with its charges badge and no other text', () => {
    const html = withRegistrations([probeSlice(probeRow())], () => {
      ownProbe()
      return barMarkup()
    })
    expect(html).toContain(`data-testid="${UI_IDS.hudToolSlots}"`)
    expect(toolBoxesIn(html)).toBe(1)
    expect(html).toContain('>2</span>')
  })

  it('lists the kernel rows and the registered ones by position, as touch bindings too', () => {
    withRegistrations([probeSlice(probeRow())], () => {
      expect(toolSlotRows().map((row) => row.position)).toEqual([9, 10, 11, 12])
      expect(touchBindingRows().some((row) => row.id === 'tool-probe.tool')).toBe(true)
    })
  })
})

describe('tool slot seal', () => {
  it('refuses a row at a hotkey position whose number key does not press it', () => {
    expect(refusalOf(probeRow({ position: 2 }))).toThrow(/Digit2 does not press/)
  })

  it('refuses a row taking a position the kernel holds', () => {
    expect(refusalOf(probeRow({ position: 9 }))).toThrow(/position 9, already taken/)
  })

  it('refuses a row that breaks a touch binding rule: a drag of a key press with no tap path', () => {
    const drag = probeRow({ touch: { gesture: 'drag', action: 'use_slot_1' } })
    expect(refusalOf(drag)).toThrow(/no tapPath/)
  })

  it('refuses a slice row anchored on the kernel', () => {
    expect(refusalOf(probeRow({ anchor: 'kernel' }))).toThrow(RegistrationRefusedError)
  })

  it('keeps a row at the first hotkey position that Digit1 presses', () => {
    expect(refusalOf(probeRow({ position: 1 }))).not.toThrow()
  })
})
