import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore, useGameStore } from '../../../store/gameStore'
import { SliceScreenView } from '../../../ui/screens/SliceScreen'
import { readAuthorityState } from '../../../store/authorityLink'
import { resetTreeScreenStore, type TreeZoom } from '../store/treeScreenStore'
import { registeredTechTree } from '../systems/techTree'
import { nodeCardModelOf, treeScreenModelOf } from '../systems/treeScreenModel'
import { LAB_FIXTURE_SLICE } from '../treeFixtureSlice'
import { withFixtureTree, withNoLanes } from '../treeTestSession'
import { NodeCardView } from './NodeCardView'
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
    expect(html.match(/Coming soon/g)).toHaveLength(9)
    expect(html).toContain('data-testid="tech-tree-lane-extraction"')
    expect(html).toContain('data-testid="tech-tree-lane-armoury.bore_gun"')
    expect(html).toContain('Armoury')
  })

  it('draws the registered nodes on their lanes, with the next-up strip', () => {
    withFixtureTree(() => {
      openTreeOnPlanet(3)
      const html = shellMarkup()
      // Only the weapon lanes, which the #161 fixture has no node for, wait for their slices.
      expect(html.match(/Coming soon/g)).toHaveLength(2)
      expect(html).toContain('data-testid="tech-tree-node-tech.sensing.echo_sounder"')
      expect(html).toContain('data-testid="tech-tree-next-up"')
    }, [LAB_FIXTURE_SLICE])
  })

  it('draws the Aetheric science swimlane with the nodes its slice registers', () => {
    openTreeOnPlanet(3)
    const html = shellMarkup()
    const lane = html.slice(
      html.indexOf('data-testid="tech-tree-lane-aetheric"'),
      html.indexOf('data-testid="tech-tree-lane-combo"'),
    )
    expect(lane).toContain('Aetheric science')
    ;[
      'tech.aetheric.resonance_whistle',
      'tech.aetheric.chronometric_governor',
      'tech.aetheric.aether_condenser',
    ].forEach((id) => expect(lane).toContain(`data-testid="tech-tree-node-${id}"`))
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

  it('renders no node card line that names a planet: a locked card shows its price (#411)', () => {
    openTreeOnPlanet(1)
    const playerId = game().playerId
    const tree = registeredTechTree()
    const model = treeScreenModelOf(readAuthorityState(), playerId, tree, EVERYTHING)
    const cards = model.lanes.flatMap((lane) => lane.nodes)
    const lines = cards.map((placed) =>
      textOf(
        renderToString(
          createElement(NodeCardView, {
            card: nodeCardModelOf(readAuthorityState(), playerId, tree, placed.id),
          }),
        ),
      ),
    )
    expect(cards.length).toBeGreaterThan(40)
    expect(lines.filter((line) => /planet \d+|P\d+/i.test(line))).toEqual([])
    expect(lines.some((line) => /Price: /.test(line))).toBe(true)
  })
})

const EVERYTHING = { search: '', filters: [] } as const

/** The card's words as a player reads them: every tag dropped. */
function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, ' ')
}
