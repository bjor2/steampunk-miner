import { describe, expect, it } from 'vitest'
import type { AuthorityCommand, CommandIntent } from '../../../systems/authority/authorityCommand'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  GROUND,
  poseAbove,
  WORLD_SEED,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { replayRun } from '../../../systems/replay/replayRun'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { energyMaxQuantaOf } from '../../../systems/vehicle/vehicleState'
import { contentOf } from '../../../systems/registries/content'
import { itemChargesOf, powerUpStateOf } from './chargeState'
import { powerUpAtMarkOf } from './powerUpMarks'
import { slotButtonsOf } from './slotColumn'
import { intentToUseSlot } from './slotUse'
import type { PowerUp } from './powerUpKind'
import { toggleDrawQuantaOf } from './toggleDraw'

// Marks in play (#249, #162 4.6) on the loaded slices: the mobility lane's steam boost (charged:
// 3 charges, a 240-tick cooldown, a 30-tick burst; unlocked at P12, a Mark every 3 planets) and
// grav anchor (a toggle drawing 1.0%/s; unlocked at P32). Mark 2 steps the cooldown to 221
// (240 x 0.92), Mark 3 the burst to 34 (30 x 1.15, ties to even), Mark 4 the charges to 4.
const STEAM_BOOST = 'power.steam_boost'
const GRAV_ANCHOR = 'power.grav_anchor'
const PRESS_TICK = 10
/** The wind-up is 6 ticks. */
const ACT_TICK = 16

/** A planet-1 field session that records its commands, so a spec can replay them. */
function fieldSession(itemId: string) {
  const session: ScriptedSession = createScriptedSession()
  const commands: AuthorityCommand[] = []
  const submit = (tick: number, intent: CommandIntent) => {
    commands.push({ playerId: 'p1', tick, seq: commands.length + 1, ...intent } as AuthorityCommand)
    return session.submit(tick, intent)
  }
  submit(0, setVehicleLoadoutCommand({ 'powerup.1': itemId }))
  submit(1, poseAbove(GROUND, FACING.right))
  return { session, commands, submit }
}

/** Every node through `planetIndex` researched, as the debug "jump to depth" grants it. */
function researchThrough(planetIndex: number): CommandIntent {
  return { type: 'debug.tech-tree.unlockThrough', payload: { planetIndex } } as CommandIntent
}

function readyAtTickOf(session: ScriptedSession, itemId: string): number {
  return itemChargesOf(powerUpStateOf(session.state(), 'p1'), itemId).readyAtTick
}

function usedLinesOf(session: ScriptedSession) {
  return session.events().filter((event) => event.type === 'power-up-core.PowerUpUsed')
}

describe('power-up marks in play', () => {
  it('reads every registered power-up researched none of at its own numbers, so nothing moves before Mark 2', () => {
    const state = createScriptedSession().state()
    const numbersOf = ({ charges, cooldownTicks, energyDrawPerMillePerSecond }: PowerUp) => ({
      charges,
      cooldownTicks,
      energyDrawPerMillePerSecond,
    })
    contentOf('power-up').forEach((powerUp) => {
      const asBought = powerUpAtMarkOf(state, 'p1', powerUp.itemId)!
      expect({ itemId: powerUp.itemId, mark: asBought.mark, ...numbersOf(asBought) }).toEqual({
        itemId: powerUp.itemId,
        mark: 0,
        ...numbersOf(powerUp),
      })
    })
  })

  it('acts as bought and logs Mark 0 while none of the item is researched', () => {
    const { session, submit } = fieldSession(STEAM_BOOST)
    submit(PRESS_TICK, intentToUseSlot('powerup.1'))
    session.advanceTo(ACT_TICK)
    expect(readyAtTickOf(session, STEAM_BOOST)).toBe(ACT_TICK + 240)
    expect(usedLinesOf(session)).toMatchObject([{ itemId: STEAM_BOOST, mark: 0, chargesLeft: 2 }])
  })

  it('starts the Mark 4 cooldown, holds the Mark 4 charges and logs Mark 4', () => {
    const { session, submit } = fieldSession(STEAM_BOOST)
    submit(2, researchThrough(21))
    submit(PRESS_TICK, intentToUseSlot('powerup.1'))
    session.advanceTo(ACT_TICK)
    expect(readyAtTickOf(session, STEAM_BOOST)).toBe(ACT_TICK + 221)
    expect(usedLinesOf(session)).toMatchObject([{ itemId: STEAM_BOOST, mark: 4, chargesLeft: 3 }])
  })

  it('replays a Mark 4 use to the same cooldown, jumping or at 30 and 144 frames per second', () => {
    const { session, commands, submit } = fieldSession(STEAM_BOOST)
    submit(2, researchThrough(21))
    submit(PRESS_TICK, intentToUseSlot('powerup.1'))
    session.advanceTo(ACT_TICK)
    const jumped = replayRun(WORLD_SEED, commands, { endTick: ACT_TICK })
    const replays = [30, 144].map((framesPerSecond) =>
      replayRun(WORLD_SEED, commands, { endTick: ACT_TICK, framesPerSecond }),
    )
    expect(itemChargesOf(powerUpStateOf(jumped.state, 'p1'), STEAM_BOOST).readyAtTick).toBe(
      ACT_TICK + 221,
    )
    replays.forEach((replay) => expect(replay.digests).toEqual(jumped.digests))
  })

  it('shortens the next cooldown, never the running one, when a Mark is researched mid-cooldown', () => {
    const { session, submit } = fieldSession(STEAM_BOOST)
    submit(2, researchThrough(12))
    submit(PRESS_TICK, intentToUseSlot('powerup.1'))
    session.advanceTo(ACT_TICK)
    submit(100, researchThrough(15))
    expect(readyAtTickOf(session, STEAM_BOOST)).toBe(ACT_TICK + 240)
    const pressAgain = ACT_TICK + 240
    submit(pressAgain, intentToUseSlot('powerup.1'))
    session.advanceTo(pressAgain + 6)
    expect(readyAtTickOf(session, STEAM_BOOST)).toBe(pressAgain + 6 + 221)
    expect(
      usedLinesOf(session).map((line) => line.type === 'power-up-core.PowerUpUsed' && line.mark),
    ).toEqual([1, 2])
  })

  it("lets a scenario set charges up to the Mark's count and no further", () => {
    const { submit } = fieldSession(STEAM_BOOST)
    submit(2, researchThrough(21))
    const setCharges = (chargesLeft: number) =>
      submit(3, {
        type: 'debug.power-up-core.setCharges',
        payload: { itemId: STEAM_BOOST, chargesLeft },
      } as CommandIntent)
    expect(setCharges(4).map((event) => event.type)).not.toContain('CommandRejected')
    expect(setCharges(5).map((event) => event.type)).toContain('CommandRejected')
  })

  it("draws a toggle's energy at its Mark's rate and logs the Mark it switched on at", () => {
    // Mark 3 (P38) draws 8 thousandths a second (10 x 0.92 x 0.92), against Mark 1's 10.
    const drawQuantaAt = (perMille: number, energyMax: number) =>
      Math.ceil((energyMax * perMille) / (1000 * 60))
    const { session, submit } = fieldSession(GRAV_ANCHOR)
    submit(2, researchThrough(38))
    submit(PRESS_TICK, intentToUseSlot('powerup.1'))
    const energyMax = energyMaxQuantaOf(session.vehicle())
    expect(drawQuantaAt(8, energyMax)).toBeLessThan(drawQuantaAt(10, energyMax))
    expect(toggleDrawQuantaOf(session.state(), 'p1')).toBe(drawQuantaAt(8, energyMax))
    expect(usedLinesOf(session)).toMatchObject([{ itemId: GRAV_ANCHOR, mark: 3, toggledOn: true }])
  })

  it('shows the Mark, the Mark’s pips and its cooldown ring on the slot column', () => {
    const { session, submit } = fieldSession(STEAM_BOOST)
    submit(2, researchThrough(21))
    submit(PRESS_TICK, intentToUseSlot('powerup.1'))
    session.advanceTo(ACT_TICK)
    expect(slotButtonsOf(session.state(), 'p1')[0]).toMatchObject({
      itemId: STEAM_BOOST,
      mark: 4,
      isMastered: false,
      chargesLeft: 3,
      chargesMax: 4,
      cooldownPercent: 100,
    })
  })
})
