import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  continueScriptedSession,
  createScriptedSession,
  mineTile,
  surfaceOreTiles,
} from '../../../systems/authority/scriptedSession'
import {
  readSnapshot,
  takeSnapshot,
  type SessionSnapshot,
} from '../../../systems/authority/sessionSnapshot'
import { oreTypeAtTile } from '../../../systems/authority/tileOre'
import { hasDiscovered, type DiscoveryKey } from '../../../systems/registries/discovery'
import type { OreQuery, OreType, OreTypeProvider } from '../../../systems/registries/oreTypes'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { RESOURCE_FAMILY } from '../../../systems/world/worldCell'
import { slice as CODEX } from '../register'
import { progressTo } from './codexSpecs'
import { CODEX_DISCOVERY_REACTION } from './codexReaction'
import { hasMinedOre } from './codexReads'

// A save written under the kernel ore index loads after the ores slice (#146) takes over: the
// alias table maps each kernel id to its type id, and the codex keeps every discovery, says none
// of them again, and moves the bytes onto the new index at its next write (#178 HS/VS, #207).

const PROBE_TIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const PROBE_INDEX_TAG = 'ores.probe-index'

const familyName = (ore: { cellFamily: number }) =>
  ore.cellFamily === RESOURCE_FAMILY.crystal ? 'crystal' : 'metal'

function probeOreOf({ tier, cellFamily }: OreQuery): OreType {
  const family = familyName({ cellFamily })
  return {
    id: `ores.${family}-${tier}`,
    name: `Probe ${family} ${tier}`,
    family: `probe-${family}`,
    cellFamily,
    tier,
    grade: 0,
    iconId: 'none',
    requires: [],
  }
}

const PROBE_CATALOGUE = PROBE_TIERS.flatMap((tier) => [
  probeOreOf({ tier, cellFamily: RESOURCE_FAMILY.metal }),
  probeOreOf({ tier, cellFamily: RESOURCE_FAMILY.crystal }),
])

/** Deepest tier first, so no ore keeps the bit the kernel index gave it. */
const PROBE_ORES: OreTypeProvider = {
  id: 'ores.probe',
  indexTag: PROBE_INDEX_TAG,
  oreTypeOf: probeOreOf,
  bitIndexOf: (ore) => (20 - ore.tier) * 2 + (familyName(ore) === 'crystal' ? 1 : 0),
  catalogue: () => PROBE_CATALOGUE,
}

const KERNEL_ID_ALIASES = Object.fromEntries(
  PROBE_CATALOGUE.map((ore) => [`ore:kernel.${familyName(ore)}.t${ore.tier}`, `ore:${ore.id}`]),
) as Record<DiscoveryKey, DiscoveryKey>

const ORES_WITH_ALIASES: SliceDefinition = {
  id: 'ores',
  register(r) {
    r.oreTypes(PROBE_ORES)
    r.discoveryAliases({ id: 'ores.kernel-ids', aliases: KERNEL_ID_ALIASES })
  },
}
const ORES_WITHOUT_ALIASES: SliceDefinition = {
  id: 'ores',
  register: (r) => r.oreTypes(PROBE_ORES),
}

const AFTER_146 = [CODEX, ORES_WITH_ALIASES]

const [FIRST_TILE, ...LATER_TILES] = surfaceOreTiles(12)

/**
 * The snapshot text of a session that mined one ore tile before #146 (kernel index, kernel ids),
 * and a tile it left holding the same type.
 */
function savedBefore146(): { text: string; ore: OreType; sameTypeTile: TilePoint } {
  return withRegistrations([CODEX], () => {
    const session = createScriptedSession()
    const ore = oreTypeAtTile(session.state(), FIRST_TILE) as OreType
    const isSameType = (tile: TilePoint) => oreTypeAtTile(session.state(), tile)?.id === ore.id
    mineTile(session, 1, FIRST_TILE)
    const text = JSON.stringify(takeSnapshot(session.state()))
    return { text, ore, sameTypeTile: LATER_TILES.find(isSameType) as TilePoint }
  })
}

function restoredAfter146(text: string): AuthorityState {
  const restored = withRegistrations(AFTER_146, () =>
    readSnapshot(JSON.parse(text) as SessionSnapshot),
  )
  if (!('state' in restored)) throw new Error(restored.problems.join('; '))
  return restored.state
}

const isCodexEvent = (event: DomainEvent) => event.type.startsWith('codex.')

describe('codex across the ores alias table', () => {
  it('keeps the discoveries of a save written under the kernel index', () => {
    const { text, ore } = savedBefore146()
    const state = restoredAfter146(text)
    const typeId = `ores.${ore.family}-${ore.tier}`
    const fallback = { progress: progressTo(1), unlockPlanetIndex: 9 }
    withRegistrations(AFTER_146, () => {
      expect(hasDiscovered(state, 'p1', `ore:${typeId}`, fallback)).toBe(true)
      expect(hasDiscovered(state, 'p1', `ore:${ore.id}`, fallback)).toBe(true)
      expect(hasMinedOre(state, 'p1', typeId)).toBe(true)
      expect(hasDiscovered(state, 'p1', 'ore:ores.crystal-9', fallback)).toBe(false)
    })
  })

  it('shows no repeat plaque when the same type is mined after the move', () => {
    const { text, ore, sameTypeTile } = savedBefore146()
    const events = withRegistrations(AFTER_146, () => {
      const session = continueScriptedSession(restoredAfter146(text))
      return mineTile(session, 200, sameTypeTile)
    })
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'CargoAdded', oreId: `ores.${ore.family}-${ore.tier}` }),
    )
    expect(events.filter(isCodexEvent)).toEqual([])
  })

  it('moves the bytes onto the new index once, at its next write', () => {
    const { text, ore } = savedBefore146()
    const state = restoredAfter146(text)
    const typeId = `ores.${ore.family}-${ore.tier}`
    const newOre = PROBE_CATALOGUE.find(({ id }) => id !== typeId) as OreType
    const written = withRegistrations(AFTER_146, () =>
      CODEX_DISCOVERY_REACTION.react(state, state, [cargoAddedOf(newOre)]),
    )
    expect(state.players.p1.slices?.codex).toMatchObject({
      ore: { codec: 'kernel.tier-family-grade' },
    })
    expect(written.state.players.p1.slices?.codex).toMatchObject({
      ore: { codec: PROBE_INDEX_TAG },
    })
    expect(written.events.filter(({ type }) => type === 'codex.OreDiscovered')).toEqual([
      expect.objectContaining({ oreId: newOre.id }),
    ])
    withRegistrations(AFTER_146, () => {
      expect(hasMinedOre(written.state, 'p1', typeId)).toBe(true)
      expect(hasMinedOre(written.state, 'p1', newOre.id)).toBe(true)
    })
  })

  it('refuses a save whose ore bits no alias places on the new index', () => {
    const { text } = savedBefore146()
    const restored = withRegistrations([CODEX, ORES_WITHOUT_ALIASES], () =>
      readSnapshot(JSON.parse(text) as SessionSnapshot),
    )
    expect(restored.problems).toEqual([
      expect.stringMatching(/codex\.ore bits \d+ under kernel\.tier-family-grade name no ore of/),
    ])
  })
})

function cargoAddedOf(ore: OreType): DomainEvent {
  return {
    playerId: 'p1',
    tick: 300,
    seq: 9,
    type: 'CargoAdded',
    resourceTier: ore.tier,
    amount: 1,
    value: '1e+0',
    oreId: ore.id,
    depthTiles: 0,
    chunk: '0,0',
  }
}
