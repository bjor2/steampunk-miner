import { beforeEach, describe, expect, it } from 'vitest'
import { readAuthorityState } from '../../store/authorityLink'
import { resetGameStore, useGameStore } from '../../store/gameStore'
import { setVehicleLoadout } from '../../store/loadoutActions'
import { techTreeDebugActions } from './debug'
import { researchedMarkOf } from './systems/itemMarks'
import { markTierOf } from './systems/markNodes'
import { markBearerOfItem, registeredTechTree } from './systems/techTree'
import { withFixtureTree } from './treeTestSession'

const actions = techTreeDebugActions

beforeEach(() => {
  resetGameStore()
})

describe('tech tree: debug actions', () => {
  it('jumps to depth N: every node whose tier is at most N is researched', () => {
    withFixtureTree(() => {
      expect(actions.jumpToDepth(5)).toEqual({ ok: true })
      const result = actions.getUnlocked() as { ok: true; unlocked: string[] }
      expect(result.unlocked).toContain('tech.sensing.threat_periscope')
      expect(result.unlocked).toContain('tech.mark.power.echo_sounder.2')
      expect(result.unlocked).not.toContain('tech.terrain.ore_shifter')
      expect(readAuthorityState().debugApplied).toBe(true)
    })
  })

  it('unlocks the whole authored tree, combos included', () => {
    withFixtureTree(() => {
      expect(actions.unlockAll()).toEqual({ ok: true })
      const { unlocked } = actions.getUnlocked() as { ok: true; unlocked: string[] }
      expect(unlocked).toContain('tech.mobility.escape_thruster')
      expect(unlocked).toContain('tech.combo.ceiling_anchor')
    })
  })

  it('refuses a depth that is not a whole number and changes nothing', () => {
    withFixtureTree(() => {
      const result = actions.jumpToDepth('deep')
      expect(result.ok).toBe(false)
      expect(actions.getUnlocked()).toEqual({ ok: true, unlocked: [] })
    })
  })

  it('prints the shape test of the registered tree', () => {
    expect(actions.shapeProblems()).toEqual({ ok: true, problems: [] })
  })
})

describe('tech tree: the rig debug read (ticket 250)', () => {
  const CRADLED = ['power.steam_shield', 'power.grapple_winch']
  const slotShieldAndWinch = () =>
    setVehicleLoadout(
      useGameStore.getState().playerId,
      { 'powerup.1': 'power.steam_shield', 'powerup.2': 'power.grapple_winch' },
      ['consumable.rivet_patch'],
    )

  it('mounts nothing and hangs no plate on a vehicle that owns no items', () => {
    expect(actions.getRig()).toMatchObject({ ok: true, items: [], mounts: [], plates: [] })
  })

  it('reads the owned mobility gear at its points and a Mark 1 plate on each cradle', () => {
    slotShieldAndWinch()
    const rig = actions.getRig() as {
      ok: true
      mounts: { assetId: string; attachId: string }[]
      plates: unknown[]
    }
    expect(rig.mounts.map(({ assetId, attachId }) => `${attachId} ${assetId}`)).toEqual([
      'hull.arm.right vehicle-item-power-grapple-winch',
      'hull.powerup.1 vehicle-item-power-steam-shield',
      'hull.rear vehicle-rack-crates',
    ])
    expect(rig.plates).toEqual([
      { slot: 'powerup.1', itemId: 'power.steam_shield', mark: 1, isGilded: false, rivets: 1 },
      { slot: 'powerup.2', itemId: 'power.grapple_winch', mark: 1, isGilded: false, rivets: 1 },
    ])
  })

  it('steps each plate up to the Mark its item acts at (#249)', () => {
    slotShieldAndWinch()
    expect(actions.unlockAll()).toEqual({ ok: true })
    const { plates } = actions.getRig() as { ok: true; plates: { itemId: string; mark: number }[] }
    const researched = plates.map(({ itemId }) => researchedMarkOfLocal(itemId))
    expect(researched.every((mark) => mark > 1)).toBe(true)
    expect(plates.map(({ mark }) => mark)).toEqual(researched)
  })

  it('gilds each plate once its item is Mastered at its last Mark', () => {
    slotShieldAndWinch()
    expect(actions.jumpToDepth(masteredDepthOf(CRADLED))).toEqual({ ok: true })
    const { plates } = actions.getRig() as {
      ok: true
      plates: { mark: number; isGilded: boolean }[]
    }
    expect(plates.map(({ mark }) => mark)).toEqual(CRADLED.map(lastMarkOfItem))
    expect(plates.map(({ isGilded }) => isGilded)).toEqual([true, true])
  })

  it('reports no effect drawn while no scene has mounted the effects layer', () => {
    expect(actions.getRig()).toMatchObject({ fx: { isDrawn: false, started: 0, active: [] } })
  })

  it('previews an item with an effect and refuses one without', () => {
    expect(actions.previewPowerUpFx('power.steam_boost')).toEqual({ ok: true })
    expect(actions.previewPowerUpFx('power.grav_anchor')).toMatchObject({ ok: false })
  })
})

function researchedMarkOfLocal(itemId: string): number {
  return researchedMarkOf(readAuthorityState(), useGameStore.getState().playerId, itemId)
}

function lastMarkOfItem(itemId: string): number {
  return markBearerOfItem(registeredTechTree(), itemId)?.lastMark ?? 0
}

/** The planet whose research reaches every item's last Mark. */
function masteredDepthOf(itemIds: readonly string[]): number {
  const tree = registeredTechTree()
  const tiers = itemIds.flatMap((itemId) => {
    const bearer = markBearerOfItem(tree, itemId)
    return bearer === null ? [] : [markTierOf(bearer, bearer.lastMark)]
  })
  return Math.max(...tiers)
}
