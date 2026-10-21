import { beforeEach, describe, expect, it } from 'vitest'
import { readAuthorityState } from '../../../store/authorityLink'
import { resetGameStore, useGameStore } from '../../../store/gameStore'
import { unlockedNodeIdsOf } from '../systems/techTreeSection'
import { withFixtureTree } from '../treeTestSession'
import { resetTreeScreenStore, useTreeScreenStore } from './treeScreenStore'

const screen = () => useTreeScreenStore.getState()

beforeEach(() => {
  resetGameStore()
  resetTreeScreenStore()
})

describe('patent office store', () => {
  it('bumps its revision on each tree change, so the tab reads the authority again', () => {
    screen().noteTreeChanged()
    screen().noteTreeChanged()
    expect(screen().revision).toBe(2)
  })

  it('researches a node for the local player through the authority', () => {
    withFixtureTree(() => {
      resetGameStore()
      useGameStore.getState().setPlanet(3)
      useGameStore.getState().giveMoney('1e9')
      screen().researchNode('tech.sensing.echo_sounder')
      const playerId = useGameStore.getState().playerId
      expect(unlockedNodeIdsOf(readAuthorityState(), playerId)).toEqual([
        'tech.sensing.echo_sounder',
      ])
    })
  })
})
