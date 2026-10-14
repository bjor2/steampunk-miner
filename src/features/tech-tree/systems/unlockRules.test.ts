import { describe, expect, it } from 'vitest'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { readSnapshot, takeSnapshot } from '../../../systems/authority/sessionSnapshot'
import { sub, toCanonical } from '../../../systems/money'
import type { DiscoveryKey } from '../../../systems/registries/discovery'
import { ANCHORED_NODE_ID, ANCHORED_NODE_SLICE, LAB_FIXTURE_SLICE } from '../treeFixtureSlice'
import { PLAYER, research, researchAll, sessionOnPlanet, withFixtureTree } from '../treeTestSession'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { nodeCostOf } from './nodeCost'
import type { TechNode } from './techNode'
import { unlockedNodeIdsOf } from './techTreeSection'
import { availableNodes, isUnlocked, unlockedItems } from './unlockRules'

const ASSAY_DRAIN_PARENTS = [
  'tech.sensing.echo_sounder',
  'tech.sensing.assay_lens',
  'tech.extraction.resonance_fork',
  'tech.extraction.mineral_drain',
]

function refusalIn(events: readonly DomainEvent[]): string | null {
  const refused = events.find((event) => event.type === 'tech-tree.TechNodeRefused')
  return refused?.type === 'tech-tree.TechNodeRefused' ? refused.reason : null
}

/** A codex stand-in that has met exactly `met`. */
function codexWhoMet(met: readonly DiscoveryKey[]): SliceDefinition {
  return {
    id: 'codex-probe',
    register: (r) =>
      r.discovery({ id: 'codex-probe.met', hasDiscovered: (_s, _p, key) => met.includes(key) }),
  }
}

describe('tech tree: researching a node', () => {
  it('researches a node, paying its price', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(3)
      const before = session.state().players[PLAYER].wallet
      const cost = nodeCostOf('tech.sensing.echo_sounder')!
      const events = research(session, 'tech.sensing.echo_sounder')
      expect(events.map((event) => event.type)).toEqual([
        'tech-tree.TechNodeUnlocked',
        'MoneyChanged',
      ])
      expect(events[0]).toMatchObject({
        nodeId: 'tech.sensing.echo_sounder',
        lane: 'sensing',
        kind: 'capability',
        mark: 1,
        cost: toCanonical(cost),
      })
      expect(session.state().players[PLAYER].wallet).toEqual(sub(before, cost))
      expect(isUnlocked(session.state(), PLAYER, 'tech.sensing.echo_sounder')).toBe(true)
    })
  })

  it('refuses a node the wallet is short for, changing nothing but the sequence', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(1, '1')
      const before = session.state()
      expect(refusalIn(research(session, 'tech.sensing.echo_sounder'))).toBe('money_short')
      expect(session.state().players).toEqual({
        ...before.players,
        [PLAYER]: { ...before.players[PLAYER], lastSeq: before.players[PLAYER].lastSeq + 1 },
      })
    })
  })

  it('refuses a node whose prerequisite is not researched', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(6)
      expect(refusalIn(research(session, 'tech.sensing.threat_periscope'))).toBe('missing_prereq')
      researchAll(session, ['tech.sensing.echo_sounder', 'tech.sensing.threat_periscope'])
    })
  })

  it('refuses an unknown id and a node already researched', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(3)
      expect(refusalIn(research(session, 'tech.sensing.nothing'))).toBe('unknown_node')
      researchAll(session, ['tech.sensing.echo_sounder'])
      expect(refusalIn(research(session, 'tech.sensing.echo_sounder'))).toBe('already_unlocked')
    })
  })

  it('researches Marks in order on any planet, each needing the one before', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(1)
      researchAll(session, ['tech.sensing.echo_sounder'])
      expect(refusalIn(research(session, 'tech.mark.power.echo_sounder.3'))).toBe('missing_prereq')
      researchAll(session, [
        'tech.mark.power.echo_sounder.2',
        'tech.mark.power.echo_sounder.3',
        'tech.mark.power.echo_sounder.4',
      ])
      expect(unlockedItems(session.state(), PLAYER)).toEqual([
        { itemId: 'power.echo_sounder', mark: 4 },
      ])
    })
  })
})

describe('tech tree: anchored nodes (ticket 358)', () => {
  it('holds a node anchored on a vision row on every planet: a held item is never sold', () => {
    withFixtureTree(() => {
      for (const planet of [1, 17, 60]) {
        const session = sessionOnPlanet(planet)
        expect(refusalIn(research(session, ANCHORED_NODE_ID))).toBe('held_feature')
        expect(availableNodes(session.state(), PLAYER).map((node) => node.id)).not.toContain(
          ANCHORED_NODE_ID,
        )
      }
    }, [ANCHORED_NODE_SLICE])
  })
})

describe('tech tree: discovery', () => {
  it('researches a node keyed to a discovery on planet 1, the key unmet (#411)', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(1)
      researchAll(session, [
        'tech.sensing.echo_sounder',
        'tech.sensing.threat_periscope',
        'tech.extraction.resonance_fork',
      ])
    }, [codexWhoMet([])])
  })
})

describe('tech tree: owned requirements (ticket 233, #162 acceptance 8)', () => {
  const FLASK = 'own-probe.flask'
  const TWIST = 'own-probe.twist'
  const BASE_ITEM = 'own-probe.anchor'

  /** A flask node that waits on refractory lining and a twist that waits on its base item. */
  const OWN_PROBE: SliceDefinition = {
    id: 'own-probe',
    register: (r) => {
      r.content('vehicle-item', [
        { id: BASE_ITEM, iconId: 'icon-panel-slots', slots: ['powerup.1'], attach: null },
      ])
      r.content('tech-node', [
        probeNode(FLASK, 'consumable.flask_probe', ['refractory_lining']),
        probeNode(TWIST, 'power.twist_probe', [BASE_ITEM]),
      ])
    },
  }

  function probeNode(id: string, unlocks: string, requiresOwned: readonly string[]): TechNode {
    return {
      id,
      iconId: 'icon-panel-slots',
      lane: 'mobility',
      name: id,
      unlockTier: 1,
      prereqs: [],
      requiresOwned,
      unlocks,
      description: 'A probe node.',
      label: 'horizontal',
      costKind: 'capability',
    }
  }

  it('refuses a node with not_owned until the player owns refractory lining', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(1)
      expect(refusalIn(research(session, FLASK))).toBe('not_owned')
      expect(availableNodes(session.state(), PLAYER).map((node) => node.id)).not.toContain(FLASK)
      session.submit({ type: 'debug.setLiningType', payload: { liningType: 'refractory' } })
      expect(refusalIn(research(session, FLASK))).toBeNull()
      expect(isUnlocked(session.state(), PLAYER, FLASK)).toBe(true)
    }, [OWN_PROBE])
  })

  it('refuses a twist until its base vehicle item is owned', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(1)
      expect(refusalIn(research(session, TWIST))).toBe('not_owned')
      session.submit(setVehicleLoadoutCommand({}, [BASE_ITEM]))
      expect(refusalIn(research(session, TWIST))).toBeNull()
    }, [OWN_PROBE])
  })
})

describe('tech tree: combos', () => {
  it('holds a combo while no building stands for the research lab', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(15)
      researchAll(session, ASSAY_DRAIN_PARENTS)
      expect(refusalIn(research(session, 'tech.combo.assay_drain'))).toBe('held_feature')
    })
  })

  it('researches a combo on planet 1 once its parents are, the lab standing (#411)', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(1)
      expect(refusalIn(research(session, 'tech.combo.assay_drain'))).toBe('missing_prereq')
      researchAll(session, [...ASSAY_DRAIN_PARENTS, 'tech.combo.assay_drain'])
    }, [LAB_FIXTURE_SLICE])
  })
})

describe('tech tree: available nodes and save', () => {
  it('lists what the player could research now, wallet aside: every root node, any planet', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(1, '0')
      expect(availableNodes(session.state(), PLAYER).map((node) => node.id)).toEqual([
        'tech.sensing.echo_sounder',
        'tech.mobility.grapple_winch',
        'tech.terrain.stabiliser_foam',
        'tech.drill_gear.vibratory_bit',
        'tech.extraction.resonance_fork',
        'tech.terrain.ore_shifter',
        'tech.extraction.containment_hood',
        'tech.extraction.acid_etcher',
        'tech.extraction.induction_coil',
        'tech.extraction.aether_tether',
      ])
    })
  })

  it('round-trips the researched nodes through a snapshot', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(8)
      session.submit({ type: 'debug.tech-tree.unlockThrough', payload: { planetIndex: 8 } })
      const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
      if (!('state' in restored)) throw new Error(restored.problems.join('; '))
      expect(unlockedNodeIdsOf(restored.state, PLAYER)).toEqual(
        unlockedNodeIdsOf(session.state(), PLAYER),
      )
      expect(unlockedNodeIdsOf(restored.state, PLAYER).length).toBeGreaterThan(10)
    })
  })

  it('keeps the save section out of the state until a node is researched', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(3)
      expect('slices' in session.state().players[PLAYER]).toBe(false)
      researchAll(session, ['tech.sensing.echo_sounder'])
      expect(session.state().players[PLAYER].slices).toEqual({
        'tech-tree': { unlocked: ['tech.sensing.echo_sounder'] },
      })
    })
  })
})
