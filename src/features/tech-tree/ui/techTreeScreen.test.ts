import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore, useGameStore } from '../../../store/gameStore'
import { SliceScreenView } from '../../../ui/screens/SliceScreen'
import { readAuthorityState } from '../../../store/authorityLink'
import { resetTreeScreenStore, type TreeZoom } from '../store/treeScreenStore'
import { registeredTechTree } from '../systems/techTree'
import { nodeCardModelOf, treeScreenModelOf } from '../systems/treeScreenModel'
import { withFixtureTree, withNoLanes } from '../treeTestSession'
import { TechTreeButton } from './TechTreeButton'
import { TECH_TREE_SCREEN_ID, TechTreeScreenView } from './TechTreeScreen'

const game = () => useGameStore.getState()

function shellMarkup(): string {
  return renderToString(
    createElement(SliceScreenView, {
      openScreenId: game().openScreenId,
      onDismiss: game().dismissScreen,
    }),
  )
}

function openTreeOnPlanet(planetIndex: number): void {
  game().setPlanet(planetIndex)
  game().giveMoney('1e9')
  game().openScreen(TECH_TREE_SCREEN_ID)
}

beforeEach(() => {
  resetGameStore()
  resetTreeScreenStore()
})

describe('tech tree screen', () => {
  it('opens from its HUD button into the kernel screen slot, and Back dismisses it', () => {
    expect(renderToString(createElement(TechTreeButton))).toContain('data-testid="tech-tree-open"')
    game().openScreen(TECH_TREE_SCREEN_ID)
    expect(shellMarkup()).toContain('data-testid="tech-tree-screen"')
    game().dismissScreen()
    expect(shellMarkup()).toBe('')
  })

  it('shows every swimlane as coming soon until the lane slices land', () => {
    const html = withNoLanes(() => {
      openTreeOnPlanet(3)
      return shellMarkup()
    })
    expect(html.match(/Coming soon/g)).toHaveLength(6)
    expect(html).toContain('data-testid="tech-tree-lane-extraction"')
  })

  it('draws the registered nodes on their lanes, with the next-up strip', () => {
    withFixtureTree(() => {
      openTreeOnPlanet(3)
      const html = shellMarkup()
      expect(html).not.toContain('Coming soon')
      expect(html).toContain('data-testid="tech-tree-node-tech.sensing.echo_sounder"')
      expect(html).toContain('data-testid="tech-tree-next-up"')
    })
  })

  it("focuses one lane's cards, then one node's card with its Research button", () => {
    withFixtureTree(() => {
      openTreeOnPlanet(3)
      const playerId = game().playerId
      const model = treeScreenModelOf(readAuthorityState(), playerId, registeredTechTree(), {
        search: '',
        filters: [],
      })
      const card = nodeCardModelOf(
        readAuthorityState(),
        playerId,
        registeredTechTree(),
        'tech.sensing.echo_sounder',
      )
      const viewAt = (zoom: TreeZoom) =>
        renderToString(
          createElement(TechTreeScreenView, {
            view: { model, card, zoom, lane: 'sensing' },
            onDismiss: () => undefined,
          }),
        )
      expect(viewAt('lane')).toContain('data-testid="tech-tree-lane-focus-sensing"')
      expect(viewAt('card')).toContain('data-node-id="tech.sensing.echo_sounder"')
      expect(viewAt('card')).toContain('Research for')
    })
  })
})
