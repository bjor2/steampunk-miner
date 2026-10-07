import { describe, expect, it } from 'vitest'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { readSnapshot, takeSnapshot } from '../../../systems/authority/sessionSnapshot'
import { sub, toCanonical } from '../../../systems/money'
import type { DiscoveryKey } from '../../../systems/registries/discovery'
import { PLAYER, research, researchAll, sessionOnPlanet, withFixtureTree } from '../treeTestSession'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { nodeCostOf } from './nodeCost'
import type { TechNode } from './techNode'
import { unlockedNodeIdsOf } from './techTreeSection'
import { availableNodes, isUnlocked, unlockedItems } from './unlockRules'

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
  it('researches a reached node, paying its cost on the current planet', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(3)
      const before = session.state().players[PLAYER].wallet
      const cost = nodeCostOf('tech.sensing.echo_sounder', 3)!
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

  it('refuses a node whose tier is not reached, changing nothing', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(1)
      const before = session.state()
      expect(refusalIn(research(session, 'tech.sensing.echo_sounder'))).toBe('locked_tier')
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

  it('refuses a node the wallet cannot pay for', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(3, '1')
      expect(refusalIn(research(session, 'tech.sensing.echo_sounder'))).toBe('money_short')
      expect(unlockedNodeIdsOf(session.state(), PLAYER)).toEqual([])
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

  it('researches Marks in order from their tier, each needing the one before', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(8)
      researchAll(session, ['tech.sensing.echo_sounder'])
      expect(refusalIn(research(session, 'tech.mark.power.echo_sounder.3'))).toBe('missing_prereq')
      expect(refusalIn(research(session, 'tech.mark.power.echo_sounder.4'))).toBe('locked_tier')
      researchAll(session, ['tech.mark.power.echo_sounder.2', 'tech.mark.power.echo_sounder.3'])
      expect(unlockedItems(session.state(), PLAYER)).toEqual([
        { itemId: 'power.echo_sounder', mark: 3 },
      ])
    })
  })
})

describe('tech tree: discovery', () => {
  it('opens a discovery node at its tier while no codex is registered', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(5)
      researchAll(session, ['tech.sensing.echo_sounder', 'tech.sensing.threat_periscope'])
    })
  })

  it('opens it at its tier once the key is met, with the codex present', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(5)
      researchAll(session, ['tech.sensing.echo_sounder', 'tech.sensing.threat_periscope'])
    }, [codexWhoMet(['enemy:tunnel_wrecker'])])
  })

  it('opens a hazard node at its tier once its hazard is met (ticket 252)', () => {
    withFixtureTree(() => {
      const atTier = sessionOnPlanet(7)
      researchAll(atTier, ['tech.sensing.echo_sounder', 'tech.sensing.assay_lens'])
      researchAll(atTier, ['tech.sensing.hazard_barometer'])
    }, [codexWhoMet(['hazard:heat_lava'])])
  })

  it('waits one planet past its tier while the key is not met, then opens anyway', () => {
    withFixtureTree(() => {
      const atTier = sessionOnPlanet(5)
      researchAll(atTier, ['tech.sensing.echo_sounder'])
      expect(refusalIn(research(atTier, 'tech.sensing.threat_periscope'))).toBe('undiscovered')
      const pastGrace = sessionOnPlanet(6)
      researchAll(pastGrace, ['tech.sensing.echo_sounder', 'tech.sensing.threat_periscope'])
    }, [codexWhoMet([])])
  })

  it('opens an extractor node by its availableFromPlanet, discovered or not', () => {
    withFixtureTree(() => {
      expect(refusalIn(research(sessionOnPlanet(4), 'tech.extraction.resonance_fork'))).toBe(
        'undiscovered',
      )
      researchAll(sessionOnPlanet(5), ['tech.extraction.resonance_fork'])
    }, [codexWhoMet([])])
  })

  it('counts any key of an anyOf requirement', () => {
    withFixtureTree(() => {
      researchAll(sessionOnPlanet(11), ['tech.extraction.containment_hood'])
    }, [codexWhoMet(['ore:organic'])])
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
  it('refuses a combo with no_lab while the research lab is not built', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(15)
      researchAll(session, [
        'tech.sensing.echo_sounder',
        'tech.sensing.assay_lens',
        'tech.extraction.resonance_fork',
        'tech.extraction.mineral_drain',
      ])
      expect(refusalIn(research(session, 'tech.combo.assay_drain'))).toBe('no_lab')
    })
  })

  it('has no combo before planet 15, even with every earlier node researched', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(14)
      session.submit({ type: 'debug.tech-tree.unlockThrough', payload: { planetIndex: 14 } })
      const researched = unlockedNodeIdsOf(session.state(), PLAYER)
      expect(researched.length).toBeGreaterThan(20)
      expect(researched.filter((id) => id.startsWith('tech.combo.'))).toEqual([])
      expect(availableNodes(session.state(), PLAYER)).toEqual([])
    })
  })
})

describe('tech tree: available nodes and save', () => {
  it('lists what the player could research now, wallet aside', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(3, '0')
      expect(availableNodes(session.state(), PLAYER).map((node) => node.id)).toEqual([
        'tech.sensing.echo_sounder',
        'tech.mobility.grapple_winch',
        'tech.terrain.stabiliser_foam',
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
