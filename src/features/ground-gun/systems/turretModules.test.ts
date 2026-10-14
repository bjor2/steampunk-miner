import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { prepareCorridor, spawnEnemy } from '../../../systems/authority/combat/combatFixtures'
import type { Enemy } from '../../../systems/authority/combat/combatState'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { stepOfMajor } from '../../../systems/economy/upgradeSteps'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { FLUSHING_SHELL_ITEM_ID, SHIPPED_AUTO_GUNS_MODULES } from './autoGunsLane'
import { flushingShellOf } from './flushingShell'
import { placedModulesOf } from './render/armouryMounts'
import { isOnTurretMount, liveTurretModulesOf } from './turretModules'
import { autoGunsProviderOf } from './turretShapes'

const PLAYER = 'p1'
const ALL_MODULES = SHIPPED_AUTO_GUNS_MODULES.map((module) => module.itemId)
const isNeverAttached = () => false
/** The first tick of a shell's shiver: the flushing shell thumps every `flushCooldownTicks`. */
const SHIVER_TICK = 1200

const mountGuns: CommandIntent = { type: 'debug.setGunLevel', payload: { level: stepOfMajor(1) } }

function own(itemIds: readonly string[]): CommandIntent {
  return { type: 'debug.setVehicleLoadout', payload: { slots: {}, owned: itemIds } }
}

/** The planet 1 corridor with the guns mounted, every module owned and a burrower in the rock. */
function corridorWithBurrower(): { session: ScriptedSession; burrower: Enemy } {
  const session = createScriptedSession()
  const start = prepareCorridor(session, FACING.left)
  session.submit(start, mountGuns)
  session.submit(start, own(ALL_MODULES))
  session.submit(start, spawnEnemy('burrower', 1, 4, -2))
  session.advanceTo(start + 1)
  const burrower = session.state().combat.enemies.find(({ kind }) => kind === 'burrower')
  if (burrower === undefined) throw new Error('no burrower')
  return { session, burrower }
}

describe('ground-gun: an unattached auto_guns module never acts (ticket 388, #319 GD Q4)', () => {
  it('hangs every shipped module at a turret mount, so each may act once owned', () => {
    expect(ALL_MODULES.filter((itemId) => !isOnTurretMount(itemId))).toEqual([])
  })

  it('acts only while the guns are mounted and the module is owned and attached', () => {
    const { session } = corridorWithBurrower()
    const state = session.state()

    expect(liveTurretModulesOf(state, PLAYER).map(({ itemId }) => itemId)).toEqual(ALL_MODULES)
    expect(liveTurretModulesOf(state, PLAYER, isNeverAttached)).toEqual([])
  })

  it('never fires: an unattached module asks nothing of the turret shot', () => {
    const { session } = corridorWithBurrower()
    const state = session.state()

    expect(autoGunsProviderOf(isOnTurretMount).turretShapeOf?.(state, PLAYER)).not.toBeNull()
    expect(autoGunsProviderOf(isNeverAttached).turretShapeOf?.(state, PLAYER)).toBeNull()
  })

  it('never fires a flushing shell from an unattached cradle', () => {
    const { session, burrower } = corridorWithBurrower()
    const state = session.state()

    expect(
      flushingShellOf(isOnTurretMount).flushTicksOf(burrower, state, SHIVER_TICK),
    ).not.toBeNull()
    expect(flushingShellOf(isNeverAttached).flushTicksOf(burrower, state, SHIVER_TICK)).toBeNull()
  })

  it('never draws or previews a module with no turret mount', () => {
    const unmounted = [{ itemId: 'weapon.unmounted_turret_module', isMastered: false }]

    expect(placedModulesOf(SHIPPED_ART, 'turret', unmounted)).toEqual([])
    expect(isOnTurretMount(FLUSHING_SHELL_ITEM_ID)).toBe(true)
    expect(isOnTurretMount('weapon.unmounted_turret_module')).toBe(false)
  })
})
