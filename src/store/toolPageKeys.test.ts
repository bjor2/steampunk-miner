import { beforeEach, describe, expect, it } from 'vitest'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import { setVehicleLoadoutCommand } from '../systems/authority/loadoutCommands'
import type { ActionId } from '../systems/input/actionMap'
import type { ToolFace } from '../systems/input/toolSlots'
import type { ToolSlotRow } from '../ui/registries/toolSlots'
import { submitCommand } from './authorityLink'
import { resetGameStore, useGameStore } from './gameStore'
import { readActionStream, resetInput, routeKeyChange } from './inputRuntime'

// The number keys on a turned tool tray (spec #678, ticket 768; the HS on the GD lock: hotkeys
// apply to the current page). A fake slice owns one tool past the eight desktop cells, so it waits
// in the tray; its cell presses the bore gun's auto toggle, which no number key is bound to.

const ITEM_ID = 'page-probe.item'
const FACE: ToolFace = {
  iconId: 'icon-panel-slots',
  name: 'Probe',
  cooldownPercent: 0,
  chargesLeft: 0,
  chargesMax: 0,
  isOn: false,
  isActing: false,
}

const PROBE_ROW: ToolSlotRow = {
  id: 'page-probe.tool',
  anchor: { row: ITEM_ID },
  touch: { gesture: 'tap', action: 'toggle_auto_fire' },
  position: 12,
  faceOf: () => FACE,
}

const PAGE_PROBE: SliceDefinition = {
  id: 'page-probe',
  register: (r) => {
    r.content('vehicle-item', [
      { id: ITEM_ID, iconId: 'icon-panel-slots', slots: [], attach: null },
    ])
    r.toolSlot(PROBE_ROW)
  },
}

const game = () => useGameStore.getState()

function tapKey(code: string): void {
  routeKeyChange({ code, isDown: true, isRepeat: false, isShiftHeld: false })
  routeKeyChange({ code, isDown: false, isRepeat: false, isShiftHeld: false })
}

/** The actions the keys pressed, in order, each once on its way down. */
function pressedDuring(run: () => void): ActionId[] {
  resetInput()
  run()
  return readActionStream()
    .filter((edge) => edge.isDown)
    .map((edge) => edge.actionId)
}

function withTrayTool(run: () => void): void {
  withRegistrations([PAGE_PROBE], () => {
    submitCommand(game().playerId, setVehicleLoadoutCommand({}, [ITEM_ID]))
    run()
  })
}

beforeEach(() => {
  resetGameStore()
  resetInput()
})

describe('tool tray number keys', () => {
  it('presses what a number key is bound to while the thumb cells show', () => {
    withTrayTool(() => {
      expect(pressedDuring(() => tapKey('Digit1'))).toEqual(['use_slot_1'])
    })
  })

  it("presses the tool in the key's cell of the tray page shown, as a tap on it would", () => {
    withTrayTool(() => {
      game().turnToolTray(1)
      expect(pressedDuring(() => tapKey('Digit1'))).toEqual(['toggle_auto_fire'])
    })
  })

  it('presses nothing over an empty cell of the page, and leaves other keys to their bindings', () => {
    withTrayTool(() => {
      game().turnToolTray(1)
      expect(pressedDuring(() => tapKey('Digit2'))).toEqual([])
      expect(pressedDuring(() => tapKey('KeyX'))).toEqual(['fire_ground_gun'])
    })
  })

  it('goes back to the bindings once the tray turns back to the thumb cells', () => {
    withTrayTool(() => {
      game().turnToolTray(1)
      game().turnToolTray(0)
      expect(pressedDuring(() => tapKey('Digit1'))).toEqual(['use_slot_1'])
    })
  })
})
