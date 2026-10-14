import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import { STEAM_SEAR_ITEM_ID } from '../../../systems/authority/bore/boreFire'
import { LONG_BARREL_ITEM_ID } from './boreGunLane'
import { boughtModulesOf } from './boughtModules'

const PLAYER = 'p1'
/** The long barrel's Mark 1 planet and its Mastered Mark 11's (boreGunModules.test.ts). */
const LONG_BARREL_PLANET = 12
const LONG_BARREL_MASTERED_PLANET = 42

function owning(itemIds: readonly string[], planetIndex: number) {
  const session = createScriptedSession()
  const intents: CommandIntent[] = [
    { type: 'debug.setVehicleLoadout', payload: { slots: {}, owned: itemIds } },
    { type: 'debug.tech-tree.unlockThrough', payload: { planetIndex } },
  ]
  for (const intent of intents) session.submit(0, intent)
  session.advanceTo(1)
  return session.state()
}

describe('ground-gun: the modules on the gun (ticket 321)', () => {
  it('lists no module before one is bought', () => {
    expect(boughtModulesOf(owning([], LONG_BARREL_MASTERED_PLANET), PLAYER, 'bore')).toEqual([])
  })

  it('lists every owned module of the gun, and none of the other gun', () => {
    const state = owning([STEAM_SEAR_ITEM_ID, LONG_BARREL_ITEM_ID], LONG_BARREL_PLANET)
    expect(boughtModulesOf(state, PLAYER, 'bore').map((module) => module.itemId)).toEqual([
      STEAM_SEAR_ITEM_ID,
      LONG_BARREL_ITEM_ID,
    ])
    expect(boughtModulesOf(state, PLAYER, 'turret')).toEqual([])
  })

  it('gilds a module only once it acts at its Mastered Mark', () => {
    const isGilded = (planetIndex: number) =>
      boughtModulesOf(owning([LONG_BARREL_ITEM_ID], planetIndex), PLAYER, 'bore')[0]?.isMastered
    expect(isGilded(LONG_BARREL_PLANET)).toBe(false)
    expect(isGilded(LONG_BARREL_MASTERED_PLANET)).toBe(true)
  })
})
