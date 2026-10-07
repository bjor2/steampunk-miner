import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../../logging/runLog'
import { advanceAuthorityTo, readAuthorityState, submitCommand } from '../../store/authorityLink'
import { resetGameStore, useGameStore } from '../../store/gameStore'
import { resetInput } from '../../store/inputRuntime'
import {
  isSlotCardShown,
  pressSlotButton,
  releaseSlotButton,
  resetTouch,
} from '../../store/touchRuntime'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import { GROUND, poseAbove } from '../../systems/authority/scriptedSession'
import { FACING } from '../../systems/vehicle/vehiclePose'
import { isToggleEngaged } from '../power-up-core'

// The drill sockets' touch tile (#244): the slot column's tile for the flank presses
// `use_drill_flank`, so a tap flips the side cutters as KeyF does, and a long-press only shows the
// item card. Played through the touch runtime on the loaded slices, as a finger would.

const CUTTERS = 'gear.side_cutters'
const FLANK_TILE = 'use_drill_flank'

const game = () => useGameStore.getState()
const areCuttersOn = () => isToggleEngaged(readAuthorityState(), game().playerId, CUTTERS)

/** Down on the tile at `atMs` and up `heldMs` later; answers whether the card showed. */
function touchFlankTile(atMs: number, heldMs: number): boolean {
  pressSlotButton(FLANK_TILE, atMs)
  const isCardShown = isSlotCardShown(FLANK_TILE, atMs + heldMs)
  releaseSlotButton(FLANK_TILE, atMs + heldMs)
  return isCardShown
}

/** The next tick, so each press is answered on a tick of its own. */
function stepTick(): void {
  advanceAuthorityTo(readAuthorityState().tick + 1)
}

beforeEach(() => {
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
  resetGameStore()
  resetInput()
  resetTouch()
  submitCommand(game().playerId, setVehicleLoadoutCommand({ 'drill.flank': CUTTERS }))
  submitCommand(game().playerId, poseAbove(GROUND, FACING.down))
  stepTick()
})

afterEach(() => uninstallRunLog())

describe('drill-gear touch tile', () => {
  it('switches the side cutters on with a tap and off with the next', () => {
    expect(areCuttersOn()).toBe(false)
    expect(touchFlankTile(1000, 120)).toBe(false)
    expect(areCuttersOn()).toBe(true)
    stepTick()
    touchFlankTile(2000, 120)
    expect(areCuttersOn()).toBe(false)
  })

  it('shows the card on a long-press and leaves the side cutters as they were', () => {
    expect(touchFlankTile(1000, 400)).toBe(true)
    expect(areCuttersOn()).toBe(false)
  })
})
