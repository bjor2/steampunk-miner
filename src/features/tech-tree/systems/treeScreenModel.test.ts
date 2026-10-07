import { describe, expect, it } from 'vitest'
import {
  PLAYER,
  researchAll,
  sessionOnPlanet,
  withFixtureTree,
  withNoLanes,
} from '../treeTestSession'
import { romanNumeralOf } from './nodeCardModel'
import { registeredTechTree } from './techTree'
import {
  nodeCardModelOf,
  treeScreenModelOf,
  type TreeQuery,
  type TreeScreenModel,
} from './treeScreenModel'

const EVERYTHING: TreeQuery = { search: '', filters: [] }

function modelOn(planetIndex: number, query = EVERYTHING, money = '1e30'): TreeScreenModel {
  const session = sessionOnPlanet(planetIndex, money)
  return treeScreenModelOf(session.state(), PLAYER, registeredTechTree(), query)
}

function laneIds(model: TreeScreenModel, lane: string): string[] {
  return model.lanes.find((candidate) => candidate.lane === lane)!.nodes.map((node) => node.id)
}

describe('tech tree screen: lanes', () => {
  it('shows every lane as coming soon while no lane slice has registered a node', () => {
    const beforeLanes = withNoLanes(() => modelOn(3))
    expect(beforeLanes.lanes.map((lane) => [lane.title, lane.isComingSoon])).toEqual([
      ['Extractors', true],
      ['Terrain', true],
      ['Sensing', true],
      ['Mobility', true],
      ['Drill gear', true],
      ['Combos', true],
    ])
    const withLanes = withFixtureTree(() => modelOn(3))
    expect(withLanes.lanes.every((lane) => !lane.isComingSoon)).toBe(true)
  })

  it('lays each lane out on the planet ruler in tier order, stacking a shared planet', () => {
    withFixtureTree(() => {
      const model = modelOn(3)
      const sensing = model.lanes.find((lane) => lane.lane === 'sensing')!.nodes
      expect(sensing.map((node) => node.tier)).toEqual([2, 5, 7, 7, 13, 21, 26, 30, 33])
      expect(sensing.filter((node) => node.tier === 7).map((node) => node.stack)).toEqual([0, 1])
      expect(model.rulerMarks).toEqual([1, 5, 10, 15, 20, 25, 30, 35])
      expect(model.lastPlanet).toBe(37)
    })
  })

  it('stretches the ruler past planet 40 to show the endless combos coming', () => {
    withFixtureTree(() => {
      const model = modelOn(44)
      expect(model.lastPlanet).toBe(47)
      expect(laneIds(model, 'combo')).toEqual(
        expect.arrayContaining(['tech.combo.gen.41', 'tech.combo.gen.44', 'tech.combo.gen.47']),
      )
    })
  })
})

describe('tech tree screen: node cards', () => {
  it('says which nodes can be researched now, which wait on money and which are locked', () => {
    withFixtureTree(() => {
      const statusOf = (model: TreeScreenModel, id: string) =>
        model.lanes.flatMap((lane) => lane.nodes).find((node) => node.id === id)?.status
      const rich = modelOn(3)
      expect(statusOf(rich, 'tech.sensing.echo_sounder')).toBe('affordable')
      expect(statusOf(rich, 'tech.sensing.threat_periscope')).toBe('locked')
      expect(statusOf(modelOn(3, EVERYTHING, '0'), 'tech.sensing.echo_sounder')).toBe('available')
    })
  })

  it('shows a researched item with its Mark chip, the next Mark and its price', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(9)
      researchAll(session, ['tech.sensing.echo_sounder', 'tech.mark.power.echo_sounder.2'])
      const card = nodeCardModelOf(
        session.state(),
        PLAYER,
        registeredTechTree(),
        'tech.sensing.echo_sounder',
      )!
      expect(card.status).toBe('researched')
      expect(card.markChip).toMatchObject({
        mark: 2,
        text: 'Mk II → III',
        isMastered: false,
        next: { nodeId: 'tech.mark.power.echo_sounder.3', status: 'affordable' },
      })
    })
  })

  it('names the discovery that opens a node a planet early', () => {
    withFixtureTree(() => {
      const card = nodeCardModelOf(
        sessionOnPlanet(3).state(),
        PLAYER,
        registeredTechTree(),
        'tech.extraction.resonance_fork',
      )!
      expect(card.discoveryHint).toBe('Find crystal ore to research it a planet early.')
      expect(card.prereqNames).toEqual([])
    })
  })

  it('writes Marks in Roman numerals', () => {
    expect([1, 4, 7, 9, 14, 18, 40].map(romanNumeralOf)).toEqual([
      'I',
      'IV',
      'VII',
      'IX',
      'XIV',
      'XVIII',
      'XL',
    ])
  })
})

describe('tech tree screen: next up, search and filters', () => {
  it("pins each lane's first researchable node in the next-up strip", () => {
    withFixtureTree(() => {
      expect(modelOn(3).nextUp.map((card) => card.id)).toEqual([
        'tech.terrain.stabiliser_foam',
        'tech.sensing.echo_sounder',
        'tech.mobility.grapple_winch',
      ])
    })
  })

  it('finds nodes by name, item or a word of the flavour line', () => {
    withFixtureTree(() => {
      const found = (search: string) =>
        modelOn(3, { search, filters: [] }).lanes.flatMap((lane) => lane.nodes.map((n) => n.id))
      expect(found('grapple')).toEqual(['tech.mobility.grapple_winch'])
      expect(found('POWER.ECHO')).toEqual(['tech.sensing.echo_sounder'])
      expect(found('  ')).toHaveLength(49)
    })
  })

  it('keeps only the nodes a filter keeps, any of several', () => {
    withFixtureTree(() => {
      const kept = (filters: TreeQuery['filters']) =>
        modelOn(3, { search: '', filters }).lanes.flatMap((lane) => lane.nodes.map((n) => n.id))
      expect(kept(['affordable'])).toEqual([
        'tech.terrain.stabiliser_foam',
        'tech.sensing.echo_sounder',
        'tech.mobility.grapple_winch',
      ])
      expect(kept(['locked'])).toHaveLength(46)
      expect(kept(['affordable', 'locked'])).toHaveLength(49)
      expect(kept(['marks'])).toEqual([])
    })
  })
})
