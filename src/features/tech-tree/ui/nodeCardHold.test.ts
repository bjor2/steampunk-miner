import { beforeEach, describe, expect, it } from 'vitest'
import { readAuthorityState } from '../../../store/authorityLink'
import { resetGameStore, useGameStore } from '../../../store/gameStore'
import { resetTreeScreenStore, useTreeScreenStore } from '../store/treeScreenStore'
import { unlockedNodeIdsOf } from '../systems/techTreeSection'
import { withFixtureTree } from '../treeTestSession'
import { forgetHoldOnNewPress, openCardByHold, swallowClickAfterHold } from './nodeCardHold'

const NODE = 'tech.sensing.echo_sounder'
const screen = () => useTreeScreenStore.getState()

/** A click as the screen's capture handler sees it; it reaches `target` unless swallowed. */
function clickThroughScreen(target: () => void): void {
  let isStopped = false
  swallowClickAfterHold({
    preventDefault: () => undefined,
    stopPropagation: () => {
      isStopped = true
    },
  })
  if (!isStopped) target()
}

const researchOnCard = () => screen().researchNode(NODE)
const unlockedNodes = () =>
  unlockedNodeIdsOf(readAuthorityState(), useGameStore.getState().playerId)

function standOnPlanetWithMoney(): void {
  resetGameStore()
  useGameStore.getState().setPlanet(3)
  useGameStore.getState().giveMoney('1e9')
}

beforeEach(() => {
  resetGameStore()
  resetTreeScreenStore()
  forgetHoldOnNewPress()
})

describe('tree node long press', () => {
  it('opens the node card without researching it, even with Research under the finger', () => {
    withFixtureTree(() => {
      standOnPlanetWithMoney()
      openCardByHold(NODE)
      expect({ zoom: screen().zoom, node: screen().selectedNodeId }).toEqual({
        zoom: 'card',
        node: NODE,
      })
      clickThroughScreen(researchOnCard)
      expect(unlockedNodes()).toEqual([])
    })
  })

  it('lets the next tap on the card research once the hold has ended', () => {
    withFixtureTree(() => {
      standOnPlanetWithMoney()
      openCardByHold(NODE)
      clickThroughScreen(() => undefined)
      forgetHoldOnNewPress()
      clickThroughScreen(researchOnCard)
      expect(unlockedNodes()).toEqual([NODE])
    })
  })

  it('never eats the next tap when the click ending a hold was dropped', () => {
    withFixtureTree(() => {
      standOnPlanetWithMoney()
      openCardByHold(NODE)
      forgetHoldOnNewPress()
      clickThroughScreen(researchOnCard)
      expect(unlockedNodes()).toEqual([NODE])
    })
  })

  it('leaves a tap with no hold to act as a click does today', () => {
    let wasClicked = false
    clickThroughScreen(() => {
      wasClicked = true
    })
    expect(wasClicked).toBe(true)
    expect(screen().zoom).toBe('overview')
  })
})
