import { describe, expect, it } from 'vitest'
import { contentOf } from '../../../systems/registries/content'
import { iconUrlOf } from '../../../ui/vectorIcons'
import { flavourProblemsOf } from '../../descriptions'
import { oreFamilies } from '../../ores'
import { AETHERIC_TECH_NODES } from './aethericNodes'

/** The vision features no aetheric node may name before its act (GD lock on #245). */
const VISION_FEATURE_WORDS = /\b(frozen|magnetic|hollow)\b/i

/** Ore families 3-12 come with their acts; only the first two may be named this early. */
function laterFamilyNames(): string[] {
  return oreFamilies()
    .slice(2)
    .map((family) => family.name)
}

describe('aetheric lane nodes', () => {
  it('registers the lane on P15, P24 and P29, each later node needing only the entry node', () => {
    const registered = contentOf('tech-node').filter((node) => node.lane === 'aetheric')
    expect(registered.map((node) => [node.id, node.unlockTier, node.prereqs])).toEqual([
      ['tech.aetheric.aether_condenser', 29, ['tech.aetheric.resonance_whistle']],
      ['tech.aetheric.chronometric_governor', 24, ['tech.aetheric.resonance_whistle']],
      ['tech.aetheric.resonance_whistle', 15, []],
    ])
  })

  it('researches the entry node at the research lab, and the later nodes through it', () => {
    expect(AETHERIC_TECH_NODES.map((node) => node.researchedAt ?? null)).toEqual([
      'research_lab',
      null,
      null,
    ])
  })

  it('unlocks one power-up per node, a capability priced like any lane', () => {
    AETHERIC_TECH_NODES.forEach((node) => {
      expect(node.unlocks, node.id).toMatch(/^power\./)
      expect(node.costKind, node.id).toBe('capability')
    })
  })

  it('gives every node an icon that resolves and a flavour line within the copy rules', () => {
    AETHERIC_TECH_NODES.forEach((node) => {
      expect(iconUrlOf(node.iconId), node.id).not.toBeNull()
      expect(flavourProblemsOf(node.description), node.id).toEqual([])
    })
  })

  it('names no frozen, magnetic or hollow feature and no ore family past the first two', () => {
    const families = laterFamilyNames()
    expect(families).toHaveLength(10)
    AETHERIC_TECH_NODES.forEach((node) => {
      const text = `${node.name} ${node.description}`
      expect(VISION_FEATURE_WORDS.test(text), node.id).toBe(false)
      expect(
        families.filter((family) => text.toLowerCase().includes(family.toLowerCase())),
        node.id,
      ).toEqual([])
    })
  })
})
