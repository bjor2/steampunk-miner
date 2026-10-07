import { beforeEach, describe, expect, it } from 'vitest'
import { readAuthorityState } from '../../store/authorityLink'
import { resetGameStore } from '../../store/gameStore'
import { techTreeDebugActions } from './debug'
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
