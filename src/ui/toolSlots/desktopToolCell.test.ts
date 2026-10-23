import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { submitCommand } from '../../store/authorityLink'
import { resetGameStore, useGameStore } from '../../store/gameStore'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import type { ActionId } from '../../systems/input/actionMap'
import type { ToolFace } from '../../systems/input/toolSlots'
import type { LayoutKind } from '../../systems/views/designSystem'
import type { ToolSlotRow } from '../registries/toolSlots'
import { ToolSlotBar } from './ToolSlotBar'

// Desktop's tool cells (spec #678, ticket 768) rendered on the server: each cell holding a tool
// wears the brass tag of its key, and a phone's bar draws none. The hover plate needs a resting
// mouse and a turned tray needs the live store, so the browser spec and keyTags.test check those.

const ITEM_ID = 'key-probe.item'
const FACE: ToolFace = {
  iconId: 'icon-panel-slots',
  name: 'Probe',
  cooldownPercent: 0,
  chargesLeft: 0,
  chargesMax: 0,
  isOn: false,
  isActing: false,
}

function probeSlice(position: number, action: ActionId): SliceDefinition {
  const row: ToolSlotRow = {
    id: 'key-probe.tool',
    anchor: { row: ITEM_ID },
    touch: { gesture: 'tap', action },
    position,
    faceOf: () => FACE,
  }
  return {
    id: 'key-probe',
    register: (r) => {
      r.content('vehicle-item', [
        { id: ITEM_ID, iconId: 'icon-panel-slots', slots: [], attach: null },
      ])
      r.toolSlot(row)
    },
  }
}

function barHtml(slice: SliceDefinition, kind: LayoutKind): string {
  return withRegistrations([slice], () => {
    submitCommand(useGameStore.getState().playerId, setVehicleLoadoutCommand({}, [ITEM_ID]))
    return renderToString(
      createElement(ToolSlotBar, {
        kind,
        isDetailOpen: false,
        isLeftHanded: false,
        isRaised: false,
      }),
    )
  })
}

beforeEach(() => resetGameStore())

describe('desktop tool cell key tags', () => {
  it('tags a cell with the number key that presses its tool', () => {
    expect(barHtml(probeSlice(1, 'use_slot_1'), 'desktop')).toContain('data-key-tag="1"')
  })

  it('draws no key tag on a phone’s bar', () => {
    expect(barHtml(probeSlice(1, 'use_slot_1'), 'phone')).not.toContain('data-key-tag')
  })

  it('draws no hover plate before a mouse rests on a cell', () => {
    expect(barHtml(probeSlice(1, 'use_slot_1'), 'desktop')).not.toContain('data-hover-plate')
  })
})
