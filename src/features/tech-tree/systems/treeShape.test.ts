import { describe, expect, it } from 'vitest'
import LOCKED_SCHEDULE_FILE from '../../../../docs/scaling/horizontal/stats.json'
import { iconUrlOf } from '../../../ui/vectorIcons'
import { ABSORBED_SCHEDULE_ROWS, researchLabPlanet, unlocksOnPlanet } from './scheduleAbsorber'
import type { TechNode } from './techNode'
import { AUTHORED_TREE_FIXTURE } from './treeFixtures'
import { registeredTreeShapeProblems, treeShapeProblems } from './treeShape'

const RULES = { isIconKnown: () => true, firstComboPlanet: 15 }

function nodeOf(id: string): TechNode {
  const node = AUTHORED_TREE_FIXTURE.find((candidate) => candidate.id === id)
  if (node === undefined) throw new Error(`no fixture node ${id}`)
  return node
}

/** The fixture tree with one node replaced. */
function treeWith(id: string, change: Partial<TechNode>): TechNode[] {
  return AUTHORED_TREE_FIXTURE.map((node) => (node.id === id ? { ...node, ...change } : node))
}

function shapeOf(nodes: readonly TechNode[]): string[] {
  return treeShapeProblems(nodes, RULES)
}

describe('tech tree: shape test', () => {
  it('passes the #161 authored tree', () => {
    expect(shapeOf(AUTHORED_TREE_FIXTURE)).toEqual([])
  })

  it('passes whatever the lane slices have registered, so it turns on as they land', () => {
    expect(registeredTreeShapeProblems((iconId) => iconUrlOf(iconId) !== null)).toEqual([])
  })

  it('takes the first combo planet from the research lab row of Schedule C', () => {
    expect(researchLabPlanet()).toBe(15)
  })

  it('finds a repeated id', () => {
    expect(shapeOf([...AUTHORED_TREE_FIXTURE, nodeOf('tech.sensing.echo_sounder')])).toEqual([
      'node id tech.sensing.echo_sounder is registered more than once',
    ])
  })

  it('finds a prerequisite cycle and one that opens later than its node', () => {
    const cyclic = treeWith('tech.sensing.echo_sounder', {
      prereqs: ['tech.sensing.threat_periscope'],
    })
    expect(shapeOf(cyclic)).toEqual(
      expect.arrayContaining([
        'tech.sensing.echo_sounder (P2) needs tech.sensing.threat_periscope, which opens later',
        'tech.sensing.echo_sounder is its own prerequisite through a cycle',
      ]),
    )
  })

  it('finds a combo before the lab, a combo of one lane, and a capability crossing lanes', () => {
    const early = treeWith('tech.combo.assay_drain', { unlockTier: 14 })
    const oneLane = treeWith('tech.combo.magnetic_survey', {
      prereqs: ['tech.sensing.echo_sounder', 'tech.sensing.assay_lens'],
    })
    const crossing = treeWith('tech.mobility.steam_boost', {
      prereqs: ['tech.terrain.ore_shifter'],
    })
    expect(shapeOf(early)).toContain("combo tech.combo.assay_drain is on P14, before the lab's P15")
    expect(shapeOf(oneLane)).toEqual([
      'combo tech.combo.magnetic_survey needs prerequisites in exactly two lanes',
    ])
    expect(shapeOf(crossing)).toEqual([
      'tech.mobility.steam_boost needs a node of another lane; only combos cross lanes',
    ])
  })

  it('finds an extractor node with a prerequisite', () => {
    const tethered = treeWith('tech.extraction.aether_tether', {
      prereqs: ['tech.extraction.induction_coil'],
    })
    expect(shapeOf(tethered)).toEqual([
      'extractor node tech.extraction.aether_tether has prerequisites',
    ])
  })

  it('finds a planet with more than two capabilities and a gap of three planets', () => {
    const crowded = treeWith('tech.sensing.hazard_barometer', { unlockTier: 5 })
    const gapped = AUTHORED_TREE_FIXTURE.filter(
      (node) => node.unlockTier !== 29 && node.unlockTier !== 30,
    ).map((node) =>
      node.prereqs.some((id) => id.endsWith('shoring_props')) ? { ...node, prereqs: [] } : node,
    )
    expect(shapeOf(crowded)).toContain('P5 brings 3 capabilities, more than two')
    expect(shapeOf(gapped)).toContain('P28-P31 bring no new capability, more than two planets')
  })

  it('leaves the cadence alone while a lane has not landed', () => {
    const noMobility = AUTHORED_TREE_FIXTURE.filter(
      (node) =>
        node.lane !== 'mobility' && !node.prereqs.some((id) => id.startsWith('tech.mobility.')),
    ).filter((node) => node.lane !== 'combo')
    expect(shapeOf(noMobility)).toEqual([])
  })

  it('finds an icon that does not resolve and a flavour line with a digit', () => {
    const counted = treeWith('tech.sensing.echo_sounder', { description: 'Pings 3 times.' })
    expect(shapeOf(counted)).toEqual([
      'tech.sensing.echo_sounder: the flavour line is empty or has a digit',
    ])
    const unknownIcon = treeShapeProblems(AUTHORED_TREE_FIXTURE.slice(0, 1), {
      ...RULES,
      isIconKnown: () => false,
    })
    expect(unknownIcon).toEqual([
      'tech.extraction.resonance_fork: icon node-extraction-resonance-fork does not resolve',
    ])
  })
})

describe('tech tree: Schedule C absorber', () => {
  const rows = LOCKED_SCHEDULE_FILE.features as readonly {
    id: string
    planetIndex: number
    unlockVia?: string
    treeLane?: string
  }[]

  it('maps exactly the tech_tree rows of the locked schedule, each to its node on its planet', () => {
    const treeRows = rows.filter((row) => row.unlockVia === 'tech_tree')
    expect(treeRows.map((row) => row.id).sort()).toEqual(Object.keys(ABSORBED_SCHEDULE_ROWS).sort())
    for (const row of treeRows) {
      const node = nodeOf(ABSORBED_SCHEDULE_ROWS[row.id])
      expect({ row: row.id, planet: node.unlockTier, lane: node.lane }).toEqual({
        row: row.id,
        planet: row.planetIndex,
        lane: row.treeLane,
      })
    }
  })

  it('counts each absorbed row once on its planet: as its node, never beside it', () => {
    for (const [rowId, nodeId] of Object.entries(ABSORBED_SCHEDULE_ROWS)) {
      const planet = nodeOf(nodeId).unlockTier
      const unlocks = unlocksOnPlanet(planet, AUTHORED_TREE_FIXTURE)
      expect(unlocks.filter((unlock) => unlock === nodeId)).toHaveLength(1)
      expect(unlocks).not.toContain(`row:${rowId}`)
    }
  })

  it('finds an absorbed node off its row planet or not claiming its row', () => {
    const moved = treeWith('tech.mobility.grav_anchor', { unlockTier: 31 })
    expect(shapeOf(moved)).toContain(
      'tech.mobility.grav_anchor sits on P31, its row "grav_anchor" on P32',
    )
    const unclaimed = treeWith('tech.mobility.steam_shield', { scheduleRowId: undefined })
    expect(shapeOf(unclaimed)).toEqual([
      'tech.mobility.steam_shield must claim schedule row "shields"',
    ])
    const stray = treeWith('tech.mobility.smoke_canister', { scheduleRowId: 'shields' })
    expect(shapeOf(stray)).toEqual([
      'tech.mobility.smoke_canister claims "shields", which the map does not give it',
    ])
  })

  it('finds a Mark milestone off Marks 3, 6 and 9 of its ladder', () => {
    const boost = nodeOf('tech.mobility.steam_boost')
    const marks = boost.marks ?? { isIncomeItem: false }
    const offMark = treeWith(boost.id, {
      marks: { ...marks, milestones: [{ mark: 4, pattern: 'hold', verb: 'a longer burn' }] },
    })
    expect(shapeOf(offMark)).toEqual([`${boost.id}: milestone at Mark 4, not 3, 6 or 9`])
  })
})
