import { describe, expect, it } from 'vitest'
import {
  PLAYER,
  researchAll,
  sessionOnPlanet,
  withFixtureTree as withLanesOnly,
  withNoLanes,
} from '../treeTestSession'
import { ANCHORED_NODE_ID, ANCHORED_NODE_SLICE, LAB_FIXTURE_SLICE } from '../treeFixtureSlice'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { forkNodeIdOf } from './forkIds'
import { forkPairOf, type ForkBranchSpec } from './forkNode'
import { romanNumeralOf } from './nodeCardModel'
import { isArmouryLane } from './techNode'
import { registeredTechTree } from './techTree'
import {
  nodeCardModelOf,
  treeScreenModelOf,
  type TreeQuery,
  type TreeScreenModel,
} from './treeScreenModel'

/** The fixture tree with the research lab's building standing, as the shipped game has it. */
function withFixtureTree<T>(run: () => T, extra: readonly SliceDefinition[] = []): T {
  return withLanesOnly(run, [LAB_FIXTURE_SLICE, ...extra])
}

const EVERYTHING: TreeQuery = { search: '', filters: [] }

function modelOn(planetIndex: number, query = EVERYTHING, money = '1e30'): TreeScreenModel {
  const session = sessionOnPlanet(planetIndex, money)
  return treeScreenModelOf(session.state(), PLAYER, registeredTechTree(), query)
}

function laneIds(model: TreeScreenModel, lane: string): string[] {
  return model.lanes.find((candidate) => candidate.lane === lane)!.nodes.map((node) => node.id)
}

const AETHERIC_ENTRY = 'tech.aetheric.resonance_whistle'

/** The #245 Phase/Arc pair as #261 will author it; a stand-in until that build registers it. */
function aethericBranch(branch: string, itemId: string): ForkBranchSpec {
  return {
    branch,
    iconId: 'node-aetheric-resonance-whistle',
    name: `Stand-in ${branch} branch`,
    prereqs: [AETHERIC_ENTRY],
    unlocks: itemId,
    description: 'A stand-in branch of the aetheric fork.',
    label: 'horizontal',
  }
}

const AETHERIC_FORK_PROBE: SliceDefinition = {
  id: 'aetheric-fork-probe',
  register: (r) =>
    r.content(
      'tech-node',
      forkPairOf('aetheric', [
        aethericBranch('phase', 'power.phase_lantern'),
        aethericBranch('arc', 'power.arc_coil'),
      ]).branches,
    ),
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
      ['Aetheric science', true],
      ['Combos', true],
      ['Bore gun', true],
      ['Auto guns', true],
    ])
    const withLanes = withFixtureTree(() => modelOn(3))
    const swimlanes = withLanes.lanes.filter((lane) => !isArmouryLane(lane.lane))
    expect(swimlanes.every((lane) => !lane.isComingSoon)).toBe(true)
  })

  it('draws the weapon lanes under one Armoury heading, below the combos (#310)', () => {
    const model = withNoLanes(() => modelOn(3))
    expect(model.lanes.map((lane) => [lane.lane, lane.groupHeading])).toEqual([
      ['extraction', null],
      ['terrain', null],
      ['sensing', null],
      ['mobility', null],
      ['drill-gear', null],
      ['aetheric', null],
      ['combo', null],
      ['armoury.bore_gun', 'Armoury'],
      ['armoury.auto_guns', null],
    ])
  })

  it('lays each lane out on the planet ruler in tier order, stacking a shared planet', () => {
    withFixtureTree(() => {
      const model = modelOn(3)
      const sensing = model.lanes.find((lane) => lane.lane === 'sensing')!.nodes
      expect(sensing.map((node) => node.tier)).toEqual([2, 5, 7, 7, 13, 21, 26, 30, 33])
      expect(sensing.filter((node) => node.tier === 7).map((node) => node.stack)).toEqual([0, 1])
      expect(model.rulerMarks).toEqual([
        1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80,
      ])
      expect(model.lastPlanet).toBe(83)
    })
  })

  it('draws Aetheric science as the sixth lane, after drill gear and before the combos', () => {
    withFixtureTree(() => {
      const model = modelOn(3)
      expect(model.lanes.map((lane) => lane.lane)).toEqual([
        'extraction',
        'terrain',
        'sensing',
        'mobility',
        'drill-gear',
        'aetheric',
        'combo',
        'armoury.bore_gun',
        'armoury.auto_guns',
      ])
      const aetheric = model.lanes.find((lane) => lane.lane === 'aetheric')!
      expect(aetheric.title).toBe('Aetheric science')
      expect(aetheric.nodes.map((node) => [node.id, node.tier, node.stack])).toEqual([
        [AETHERIC_ENTRY, 15, 0],
        ['tech.aetheric.chronometric_governor', 24, 0],
        ['tech.aetheric.aether_condenser', 29, 0],
      ])
    })
  })

  it('stacks the aetheric P16 fork pair on one planet, as a shared planet stacks on any lane', () => {
    withFixtureTree(() => {
      const aetheric = modelOn(3).lanes.find((lane) => lane.lane === 'aetheric')!.nodes
      expect(aetheric.map((node) => node.tier)).toEqual([15, 16, 16, 24, 29])
      const fork = aetheric.filter((node) => node.tier === 16)
      expect(fork.map((node) => node.id).sort()).toEqual([
        'tech.aetheric.fork.arc',
        'tech.aetheric.fork.phase',
      ])
      expect(fork.map((node) => node.stack)).toEqual([0, 1])
    }, [AETHERIC_FORK_PROBE])
  })

  it("shows each lane pair's next endless grade from planet 1, the same map on any planet (#411)", () => {
    withFixtureTree(() => {
      const combos = laneIds(modelOn(1), 'combo')
      expect(combos).toEqual(
        expect.arrayContaining(['tech.combo.gen.41', 'tech.combo.gen.44', 'tech.combo.gen.83']),
      )
      expect(laneIds(modelOn(44), 'combo')).toEqual(combos)
      expect(laneIds(modelOn(200), 'combo')).toEqual(combos)
    })
  })

  it("runs the ruler on to the player's planet past the map, as information only", () => {
    withFixtureTree(() => {
      expect(modelOn(3).lastPlanet).toBe(83)
      expect(modelOn(120).lastPlanet).toBe(120)
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

  it('names no discovery: a node keyed to one waits only on its price (#411)', () => {
    withFixtureTree(() => {
      const card = nodeCardModelOf(
        sessionOnPlanet(1, '0').state(),
        PLAYER,
        registeredTechTree(),
        'tech.extraction.resonance_fork',
      )!
      expect(card.refusal).toBe('money_short')
      expect(card.refusalText).toBe(`Price: ${card.costText}`)
      expect(card.prereqNames).toEqual([])
    })
  })

  it("shows a node's card notes under the flavour, each with the Note label (#351)", () => {
    const card = nodeCardModelOf(
      sessionOnPlanet(16).state(),
      PLAYER,
      registeredTechTree(),
      forkNodeIdOf('drill-gear', 'deep'),
    )!
    expect(card.notes).toEqual([
      "Note: doesn't stack with the reach boom; the longer cut ahead wins",
    ])
    const plain = nodeCardModelOf(
      sessionOnPlanet(16).state(),
      PLAYER,
      registeredTechTree(),
      forkNodeIdOf('drill-gear', 'wide'),
    )!
    expect(plain.notes).toEqual([])
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
        'tech.extraction.resonance_fork',
        'tech.terrain.stabiliser_foam',
        'tech.sensing.echo_sounder',
        'tech.mobility.grapple_winch',
        'tech.drill_gear.vibratory_bit',
        'tech.aetheric.resonance_whistle',
      ])
    })
  })

  it('finds nodes by name, item or a word of the flavour line', () => {
    withFixtureTree(() => {
      const found = (search: string) =>
        modelOn(3, { search, filters: [] }).lanes.flatMap((lane) => lane.nodes.map((n) => n.id))
      expect(found('grapple')).toEqual(['tech.mobility.grapple_winch', 'tech.combo.gen.53'])
      expect(found('POWER.ECHO')).toEqual(['tech.sensing.echo_sounder'])
      expect(found('  ')).toHaveLength(67)
    })
  })

  it('keeps only the nodes a filter keeps, any of several', () => {
    withFixtureTree(() => {
      const kept = (filters: TreeQuery['filters']) =>
        modelOn(3, { search: '', filters }).lanes.flatMap((lane) => lane.nodes.map((n) => n.id))
      expect(kept(['affordable'])).toEqual([
        'tech.extraction.resonance_fork',
        'tech.extraction.containment_hood',
        'tech.extraction.acid_etcher',
        'tech.extraction.induction_coil',
        'tech.extraction.aether_tether',
        'tech.terrain.stabiliser_foam',
        'tech.terrain.ore_shifter',
        'tech.sensing.echo_sounder',
        'tech.mobility.grapple_winch',
        'tech.drill_gear.vibratory_bit',
        'tech.aetheric.resonance_whistle',
      ])
      expect(kept(['locked'])).toHaveLength(56)
      expect(kept(['affordable', 'locked'])).toHaveLength(67)
      expect(kept(['marks'])).toEqual([])
    })
  })
})

describe('tech tree screen: anchored nodes (ticket 358)', () => {
  it('leaves a node anchored on a vision row off the screen on every planet', () => {
    withFixtureTree(() => {
      for (const planet of [1, 17, 60]) {
        const state = sessionOnPlanet(planet).state()
        expect(laneIds(modelOn(planet), 'sensing')).not.toContain(ANCHORED_NODE_ID)
        expect(nodeCardModelOf(state, PLAYER, registeredTechTree(), ANCHORED_NODE_ID)).toBeNull()
      }
    }, [ANCHORED_NODE_SLICE])
  })
})
