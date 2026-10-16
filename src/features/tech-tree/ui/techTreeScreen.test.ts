import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore, useGameStore } from '../../../store/gameStore'
import { SliceScreenView } from '../../../ui/screens/SliceScreen'
import { forgetUiTexts, registeredUiTexts } from '../../../systems/views/uiText'
import { uiTextProblemsOf } from '../../../systems/views/uiTextBudget'
import { unregisteredTextsOf } from '../../../systems/views/unregisteredText'
import { readAuthorityState } from '../../../store/authorityLink'
import { resetTreeScreenStore, type TreeZoom } from '../store/treeScreenStore'
import { registeredTechTree } from '../systems/techTree'
import type { TechNodeLane } from '../systems/techNode'
import { nodeCardModelOf, treeScreenModelOf } from '../systems/treeScreenModel'
import { LAB_FIXTURE_SLICE } from '../treeFixtureSlice'
import { withFixtureTree, withNoLanes } from '../treeTestSession'
import { NodeCardView } from './NodeCardView'
import { TechTreeButton, TechTreeButtonView } from './TechTreeButton'
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

describe('tech tree text budget (spec #422, pass #426)', () => {
  it('keeps every lane list and node card within budget, with no text outside an element', () => {
    openTreeOnPlanet(1)
    forgetUiTexts()
    const markup = everyZoomMarkup()
    expect(unregisteredTextsOf(markup)).toEqual([])
    expect(registeredUiTexts().flatMap(uiTextProblemsOf)).toEqual([])
    expect(registeredUiTexts().length).toBeGreaterThan(100)
  })

  it("keeps a locked node's reason and its price on the element, never in the tooltip", () => {
    openTreeOnPlanet(1)
    forgetUiTexts()
    everyZoomMarkup()
    const lines = registeredUiTexts().flatMap((text) => text.lines)
    expect(lines.some((line) => line.holds === 'needs' && line.tag === 'visible')).toBe(true)
    expect(lines.some((line) => line.holds === 'price' && line.tag === 'visible')).toBe(true)
    expect(lines.filter((line) => line.holds !== undefined && line.tag === 'tooltip')).toEqual([])
  })
})

/** The map, every lane's list and every node's card, as one markup. */
function everyZoomMarkup(): string {
  const playerId = game().playerId
  const tree = registeredTechTree()
  const model = treeScreenModelOf(readAuthorityState(), playerId, tree, EVERYTHING)
  const viewOf = (zoom: TreeZoom, lane: TechNodeLane, cardId = '') =>
    renderToString(
      createElement(TechTreeScreenView, {
        view: {
          model,
          card: nodeCardModelOf(readAuthorityState(), playerId, tree, cardId),
          zoom,
          lane,
        },
        onDismiss: () => undefined,
      }),
    )
  const lanes = model.lanes.map((lane) => viewOf('lane', lane.lane))
  const cards = model.lanes.flatMap((lane) =>
    lane.nodes.map((node) => viewOf('card', lane.lane, node.id)),
  )
  return [viewOf('overview', 'extraction'), viewOf('card', 'extraction'), ...lanes, ...cards].join(
    '',
  )
}

const EVERYTHING = { search: '', filters: [] } as const

/** The card's words as a player reads them: every tag dropped. */
function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, ' ')
}

describe('tech tree button on the compact HUD (#500)', () => {
  const draw = (density: 'full' | 'compact') =>
    renderToString(createElement(TechTreeButtonView, { density, onOpen: () => {} }))

  it('draws one glyph button with the tree named for assistive tech, and no Open word', () => {
    const html = draw('compact')
    expect(html).toContain('data-hud="tech-tree"')
    expect(html).toContain('aria-label="Tech tree"')
    expect(html).not.toContain('>Open<')
    expect(html.match(/<button/g)).toHaveLength(1)
  })

  it('keeps the full HUD button as it was, titled with its Open button', () => {
    expect(draw('full')).toContain('>Open<')
  })
})
