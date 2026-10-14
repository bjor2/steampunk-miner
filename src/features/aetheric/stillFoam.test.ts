import { describe, expect, it } from 'vitest'
import { MM_PER_METRE } from '../../constants/physics'
import {
  CORRIDOR_MIDDLE,
  poseAt,
  prepareCorridor,
  spawnEnemy,
} from '../../systems/authority/combat/combatFixtures'
import type { Enemy } from '../../systems/authority/combat/combatState'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { FACING } from '../../systems/vehicle/vehiclePose'
import { intentToUseSlot } from '../power-up-core'
import { AETHERIC_ECONOMY } from './systems/aethericEconomy'
import { STILL_FOAM_ID } from './systems/aethericCombos'
import { GOVERNOR_ID } from './systems/governorItem'
import { isInHeldPocket } from './systems/governorPockets'
import { pocketOf } from './systems/pocketSection'

// Still foam (ticket 373, aetheric × terrain): foam sprayed from inside the player's open pocket
// carries it, so an enemy on the foam is slowed even past the pocket's reach, until the pocket ends
// as usual. In the corridor fight of `combatFixtures.ts`: the governor opens its pocket on the
// corridor's middle, the vehicle drives four tiles right, still inside it, and sprays foam right.

const FOAM_ID = 'consumable.stabiliser_foam'
const GOVERNOR = AETHERIC_ECONOMY.chronometricGovernor
const SLOTS = { 'powerup.1': GOVERNOR_ID, 'powerup.2': FOAM_ID }
/** Inside the pocket's 6 tiles, so the spray's foam reaches past them. */
const SPRAY_TILE = { tx: CORRIDOR_MIDDLE.tx + 4, ty: CORRIDOR_MIDDLE.ty }
/** On the spray's block (4 m blocks from x 24 m), seven tiles from the pocket's centre. */
const PAST_REACH_TILE = { tx: CORRIDOR_MIDDLE.tx + 7, ty: CORRIDOR_MIDDLE.ty }

interface FoamFight {
  session: ScriptedSession
  actTick: number
  sprayTick: number
}

function foamFight(
  owned: readonly string[] = [STILL_FOAM_ID],
  pocketOn = CORRIDOR_MIDDLE,
): FoamFight {
  const session = createScriptedSession()
  const start = prepareCorridor(session, FACING.right)
  session.submit(start, setVehicleLoadoutCommand(SLOTS, owned))
  session.submit(start, spawnEnemy('crawler', 1, -5))
  const pressTick = start + 1
  session.submit(pressTick, poseAt(pocketOn, { facing: FACING.right }))
  session.submit(pressTick, intentToUseSlot('powerup.1'))
  const actTick = pressTick + GOVERNOR.windupTicks
  session.advanceTo(actTick + 1)
  const sprayTick = actTick + 2
  session.submit(sprayTick, poseAt(SPRAY_TILE, { facing: FACING.right }))
  session.submit(sprayTick, intentToUseSlot('powerup.2'))
  return { session, actTick, sprayTick }
}

/** The fight's crawler moved onto a tile's centre, as the step modifier reads it. */
function enemyOn(session: ScriptedSession, tile: { tx: number; ty: number }): Enemy {
  const [crawler] = session.state().combat.enemies
  const half = MM_PER_METRE / 2
  return { ...crawler, x: tile.tx * MM_PER_METRE + half, y: tile.ty * MM_PER_METRE + half }
}

const stilledOf = (session: ScriptedSession) =>
  session.events().filter((event) => event.type === 'aetheric.FoamStilled')

describe('still foam', () => {
  it('carries the pocket onto foam sprayed inside it, logging foam_stilled beside the spray', () => {
    const { session, actTick } = foamFight()
    const [stilled] = stilledOf(session)
    expect(stilled).toMatchObject({
      playerId: 'p1',
      itemId: STILL_FOAM_ID,
      lastTick: actTick + GOVERNOR.durationTicks,
    })
    expect(stilled.type === 'aetheric.FoamStilled' && stilled.blocks).toBeGreaterThan(0)
    const used = session.events().filter((event) => event.type === 'power-up-core.PowerUpUsed')
    expect(used.map((event) => 'itemId' in event && event.itemId)).toEqual([GOVERNOR_ID, FOAM_ID])
  })

  it('slows an enemy on the foam past the pocket reach, and none there without the combo', () => {
    const stilled = foamFight()
    const plain = foamFight([])
    const tick = stilled.sprayTick + 1
    const past = enemyOn(stilled.session, PAST_REACH_TILE)
    expect(isInHeldPocket(stilled.session.state(), past, tick)).toBe(true)
    expect(isInHeldPocket(plain.session.state(), past, tick)).toBe(false)
    expect(stilledOf(plain.session)).toEqual([])
  })

  it('ends with the pocket: never longer, and the pocket never longer for it', () => {
    const { session, actTick } = foamFight()
    const lastTick = actTick + GOVERNOR.durationTicks
    const past = enemyOn(session, PAST_REACH_TILE)
    expect(pocketOf(session.state(), 'p1').pocket?.lastTick).toBe(lastTick)
    session.advanceTo(lastTick + 1)
    expect(isInHeldPocket(session.state(), past, lastTick + 1)).toBe(false)
    expect(pocketOf(session.state(), 'p1')).toEqual({ pocket: null })
  })

  it('stills nothing for foam sprayed from outside the pocket', () => {
    const farLeft = { tx: SPRAY_TILE.tx - GOVERNOR.rangeTiles - 1, ty: CORRIDOR_MIDDLE.ty }
    const { session } = foamFight([STILL_FOAM_ID], farLeft)
    expect(session.events().some((event) => event.type === 'terrain-tools.FoamSet')).toBe(true)
    expect(stilledOf(session)).toEqual([])
  })
})
