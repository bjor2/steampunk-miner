import { beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore, useGameStore } from '../../store/gameStore'
import { toCanonical, ZERO_MONEY } from '../../systems/money'
import { readAuthorityState } from '../../store/authorityLink'
import { workshopDebugActions } from './debug'
import { resetWorkshopStore, useWorkshopStore } from './store/workshopStore'

const game = () => useGameStore.getState()

beforeEach(() => {
  resetGameStore()
  resetWorkshopStore()
})

describe('workshop: debug actions', () => {
  it('previews a held chain at the Upgrade bay with money as canonical strings', () => {
    game().teleportToDock('upgrade')
    game().giveMoney('1e6')

    const preview = workshopDebugActions.chainPreview('drill_power') as Record<string, unknown>

    expect(preview).toMatchObject({
      ok: true,
      upgradeId: 'drill_power',
      reserve: toCanonical(ZERO_MONEY),
    })
    expect(preview.steps).toBeGreaterThanOrEqual(10)
    expect(preview.majors).toBeGreaterThanOrEqual(1)
    expect(typeof preview.spent).toBe('string')
  })

  it('answers away from the bay with the refusal a click would get', () => {
    expect(workshopDebugActions.chainPreview('hull')).toMatchObject({
      ok: true,
      steps: 0,
      stoppedBy: 'not_docked',
    })
  })

  it('refuses a name that is not a track', () => {
    expect(workshopDebugActions.chainPreview('jet_pack')).toEqual({
      ok: false,
      problems: ['jet_pack is not a track'],
    })
  })

  it('holds a track until the asked steps have landed, through the real controller', () => {
    game().teleportToDock('upgrade')
    game().giveMoney('1e9')

    expect(workshopDebugActions.holdBuy('engine', 3)).toEqual({ ok: true, chainId: 1 })
    for (let tick = 0; tick < 200; tick++) {
      game().advanceOneTick()
      useWorkshopStore.getState().advanceHoldTo(readAuthorityState().tick)
    }
    expect(workshopDebugActions.getChain()).toMatchObject({
      ok: true,
      selected: 'engine',
      hold: { upgradeId: 'engine', steps: 3, end: 'release' },
      tally: { steps: 3, cue: 'ka_chunk' },
    })
  })

  it('refuses a hold of no whole step count', () => {
    expect(workshopDebugActions.holdBuy('engine', 0)).toMatchObject({ ok: false })
    expect(workshopDebugActions.holdBuy('engine', 2.5)).toMatchObject({ ok: false })
  })
})
