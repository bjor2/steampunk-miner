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

describe('tech tree screen store', () => {
  it('zooms from the overview to a lane and, with a node selected, to its card and back', () => {
    screen().zoomIn()
    expect(screen().zoom).toBe('lane')
    screen().zoomIn()
    expect(screen().zoom).toBe('lane')
    screen().selectNode('tech.sensing.echo_sounder')
    expect(screen().zoom).toBe('card')
    screen().zoomOut()
    screen().zoomOut()
    screen().zoomOut()
    expect(screen().zoom).toBe('overview')
  })

  it('focuses a lane at the lane zoom', () => {
    screen().focusLane('mobility')
    expect({ lane: screen().lane, zoom: screen().zoom }).toEqual({ lane: 'mobility', zoom: 'lane' })
  })

  it('toggles filters on and off', () => {
    screen().toggleFilter('locked')
    screen().toggleFilter('marks')
    screen().toggleFilter('locked')
    expect(screen().filters).toEqual(['marks'])
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
