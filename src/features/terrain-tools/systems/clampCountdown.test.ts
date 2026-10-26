import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import {
  buildWeakTunnel,
  WEAK_TUNNEL_HOLD_TICKS,
} from '../../../systems/authority/collapse/collapseFixtures'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { NEW_FIXED_STEP_CLOCK, stepsForFrame } from '../../../systems/fixedStepClock'
import { frozenTicksLeftAt } from '../../../systems/registries/collapseBraces'
import {
  createTelegraphSlots,
  writeTelegraphBlocks,
} from '../../../systems/render/collapseTelegraph'
import { intentToReleaseSlot } from '../../power-up-core'
import { press } from '../terrainTestSession'
import { clampLatticeOf } from './clampLattice'
import { LODE_CLAMP_ID } from './lodeClamp'

// The drawn crack countdown under a lode clamp (ticket 357, #285 follow-up 2): "the countdown
// freezes while braced and is back at 60 after", where the full countdown is now the block's own
// burst hold (ticket 829). The collapse specs' weak band-2 tunnel warns on tick 10 and, one grade
// short, holds 1200 ticks; the clamp acts on tick 1166, so each braced block is caught with 44 ticks
// left, and is let go on tick 1240. The telegraph reads the frozen value through the kernel's
// collapseBraces seam, as the scene does each frame.

const WARN_TICK = 10
const REFILL_TICK = WARN_TICK + WEAK_TUNNEL_HOLD_TICKS
const PRESS_TICK = REFILL_TICK - 50
const ACT_TICK = PRESS_TICK + 6
const RELEASE_TICK = REFILL_TICK + 30
const CAUGHT_LEFT = REFILL_TICK - ACT_TICK
const AFTER_TICKS = 40

function heldClamp(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, setVehicleLoadoutCommand({ 'powerup.1': LODE_CLAMP_ID }))
  buildWeakTunnel(session, WARN_TICK)
  session.submit(PRESS_TICK, press())
  session.advanceTo(ACT_TICK)
  return session
}

/** The drawn countdown, in warning ticks left, of each of `blocks`, as the scene writes it now. */
function drawnTicksLeftOf(session: ScriptedSession, blocks: readonly string[]): number[] {
  const state = session.state()
  const slots = createTelegraphSlots(state.collapse.blocks.length)
  writeTelegraphBlocks(slots, state.collapse, state.tick, (block) =>
    frozenTicksLeftAt(state, block),
  )
  return state.collapse.blocks
    .map((entry, at) => ({ block: entry.block, slot: slots[at] }))
    .filter(({ block }) => blocks.includes(block))
    .map(({ slot }) => Math.round(slot.holdTicks * (1 - slot.progress)))
}

/** Steps the session frame by frame to `untilTick`, noting each frame's tick and drawn countdown. */
function drawnByFrame(
  session: ScriptedSession,
  blocks: readonly string[],
  framesPerSecond: number,
  untilTick: number,
): { tick: number; left: number[] }[] {
  const frames: { tick: number; left: number[] }[] = []
  let clock = NEW_FIXED_STEP_CLOCK
  while (session.state().tick < untilTick) {
    const frame = stepsForFrame(clock, 1 / framesPerSecond, 1 / TICKS_PER_SECOND, 8)
    clock = frame.clock
    session.advanceTo(Math.min(untilTick, session.state().tick + frame.steps))
    frames.push({ tick: session.state().tick, left: drawnTicksLeftOf(session, blocks) })
  }
  return frames
}

const bracedBlocksOf = (session: ScriptedSession) =>
  clampLatticeOf(session.state(), 'p1').map(({ block }) => block)

describe('lode clamp: the drawn crack countdown (ticket 357)', () => {
  it('stands at what each block had left when the brace caught it, on every tick of the hold', () => {
    const session = heldClamp()
    const braced = bracedBlocksOf(session)
    expect(braced.length).toBeGreaterThan(0)
    for (let tick = ACT_TICK; tick < RELEASE_TICK; tick++) {
      session.advanceTo(tick)
      expect(drawnTicksLeftOf(session, braced)).toEqual(braced.map(() => CAUGHT_LEFT))
    }
  })

  it('shows the full countdown on the tick the brace ends, then counts down', () => {
    const session = heldClamp()
    const braced = bracedBlocksOf(session)
    session.submit(RELEASE_TICK, intentToReleaseSlot('powerup.1'))
    expect(drawnTicksLeftOf(session, braced)).toEqual(braced.map(() => WEAK_TUNNEL_HOLD_TICKS))
    for (let after = 1; after <= AFTER_TICKS; after++) {
      session.advanceTo(RELEASE_TICK + after)
      expect(drawnTicksLeftOf(session, braced)).toEqual(
        braced.map(() => WEAK_TUNNEL_HOLD_TICKS - after),
      )
    }
  })

  it.each([30, 144])('draws the same countdown at %i frames a second', (framesPerSecond) => {
    const session = heldClamp()
    const braced = bracedBlocksOf(session)
    const held = drawnByFrame(session, braced, framesPerSecond, RELEASE_TICK - 1)
    expect(held.every(({ left }) => left.every((ticks) => ticks === CAUGHT_LEFT))).toBe(true)
    session.submit(RELEASE_TICK, intentToReleaseSlot('powerup.1'))
    const after = drawnByFrame(session, braced, framesPerSecond, RELEASE_TICK + AFTER_TICKS)
    for (const { tick, left } of after) {
      expect(left).toEqual(braced.map(() => WEAK_TUNNEL_HOLD_TICKS - (tick - RELEASE_TICK)))
    }
  })
})
