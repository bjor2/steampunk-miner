import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../../systems/authority/authorityState'
import { planetParamsOf } from '../../systems/authority/planetOfState'
import { createScriptedSession } from '../../systems/authority/scriptedSession'
import { readSnapshot, takeSnapshot } from '../../systems/authority/sessionSnapshot'
import { fnv1a64Hex } from '../../systems/authority/stateDigest'
import { toCanonical } from '../../systems/money'
import { chunkDigest } from '../../systems/world/chunkDigest'
import { generateChunk } from '../../systems/world/generateChunk'
import {
  GEM_OVERLAY_WALK_ORE_RULES,
  GENERATED_POOLS_ORE_RULES,
  type PlanetParams,
} from '../../systems/world/planetParams'
import { lookGroupAt, poolOreValueAt } from '../solar-systems'
import { ciPlanetsOf, CI_SEEDS, type CiPlanet } from './materialsCiFixtures'
import { generatedPoolOf } from './systems/generatedRoster'
import { planetRosterOf } from './systems/planetRoster'
import { gemOverlayOfPlanet } from './systems/render/kindLookProvider'
import { sharedGemLooksOf, type PlanetGemLook } from './systems/render/sharedGemLooks'
import { planetContactSheetOf } from './systems/render/skinContactSheet'

// Ticket 890 (GD lock of 26 Oct on Q1, the HS's and VS's conditions): ore rules 15 walks each
// generated planet's gem overlay to one no other planet of its look group lays, so no two planets
// of an act share a gem look (HS row 3) on the HS's seeds; rules 14 keeps its picks, its one shared
// pair listed as legacy that is never migrated (HS 7). Rules 15 moves the look alone: the pool, its
// prices and gems, its value and its cells are byte-identical to rules 14's (VS, Systems), and a
// joining client draws the host's cells and looks on a planet stamped 14 and on one stamped 15 (TD).

const RULES_14 = GENERATED_POOLS_ORE_RULES
const RULES_15 = GEM_OVERLAY_WALK_ORE_RULES
/** The HS's edge seeds and the species audit's two (HS 4). */
const HS_SEEDS: readonly number[] = [0, 1, 83921, 4294967295]
/** The pairs rules 14 drew sharing a gem look on the HS seeds (#890 Q1): accepted legacy. */
const RULES_14_SHARED: readonly string[] = [
  'seed 4294967295: 1.25 and 1.26 share gem-cut.brilliant under veil',
]
/** Chunks of band 1 to the core, where rare clusters and gems lie. */
const CHUNKS = [
  [0, 2],
  [-3, 5],
  [7, -9],
] as const

function lookGroupKeyOf(planet: CiPlanet): string {
  return `${planet.system}:${lookGroupAt(planet.system, BigInt(planet.place)).join(',')}`
}

function gemLookOf(planet: CiPlanet): PlanetGemLook {
  const gems = planetContactSheetOf(planet.params).rows.flatMap((row) =>
    row.gemCut === undefined ? [] : [{ cut: row.gemCut, colour: row.colour }],
  )
  const overlay = gemOverlayOfPlanet(planet.params)?.id ?? null
  return { label: planet.label, group: lookGroupKeyOf(planet), overlay, gems }
}

function sharedLooksOnSeed(seed: number, oreRulesVersion: number): string[] {
  const looks = ciPlanetsOf(seed, oreRulesVersion).map(gemLookOf)
  return sharedGemLooksOf(looks).map((pair) => `seed ${seed}: ${pair}`)
}

/** What rules 15 must leave as rules 14 drew it: the pool, roster, gem tiers, value and sheet. */
function economyTraceOf(planet: CiPlanet) {
  const { worldSeed, oreRulesVersion } = planet.params
  const value = poolOreValueAt(worldSeed, planet.system, BigInt(planet.place), oreRulesVersion)
  return {
    pool: generatedPoolOf(planet.params),
    roster: planetRosterOf(planet.params),
    value: toCanonical(value),
    sheet: planetContactSheetOf(planet.params),
  }
}

function chunkDigestsOf(params: PlanetParams): string[] {
  return CHUNKS.map(([cx, cy]) => chunkDigest(generateChunk(params, cx, cy)))
}

/** The look a client draws a planet with: its contact sheet and the overlay over its cuts. */
function lookDigestOf(params: PlanetParams): string {
  const look = { sheet: planetContactSheetOf(params), overlay: gemOverlayOfPlanet(params) }
  return fnv1a64Hex(JSON.stringify(look))
}

/** System 1's `place`, entered fresh, then held under `oreRulesVersion` as a save would hold it. */
function hostOn(place: number, oreRulesVersion: number): AuthorityState {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: place } })
  const state = session.state()
  return { ...state, planet: { ...state.planet, oreRulesVersion } }
}

function joinedClientOf(host: AuthorityState): AuthorityState {
  const joined = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(host))))
  if (!('state' in joined)) throw new Error(joined.problems.join('; '))
  return joined.state
}

function paramsOfState(state: AuthorityState): PlanetParams {
  const params = planetParamsOf(state.planet)
  if (params === null) throw new Error('no world')
  return params
}

const PAIRS = CI_SEEDS.flatMap((seed) => {
  const before = ciPlanetsOf(seed, RULES_14)
  return ciPlanetsOf(seed, RULES_15).map((planet, at): [string, CiPlanet, CiPlanet] => [
    `${planet.label} seed ${seed}`,
    before[at],
    planet,
  ])
})

describe('gem overlay walk on every generated planet (ticket 890)', () => {
  it.each(HS_SEEDS)(
    'lets no two planets of one act share a gem look under ore rules 15 on seed %i',
    (seed) => {
      expect(sharedLooksOnSeed(seed, RULES_15)).toEqual([])
    },
  )

  it('lists the one same-act pair rules 14 drew on the HS seeds, kept and never migrated', () => {
    expect(HS_SEEDS.flatMap((seed) => sharedLooksOnSeed(seed, RULES_14))).toEqual(RULES_14_SHARED)
  })

  it.each(PAIRS)(
    'draws %s under rules 14 and 15 with one pool, roster, gem tiers, value and contact sheet',
    (_, before, after) => {
      expect(economyTraceOf(after)).toEqual(economyTraceOf(before))
    },
  )

  it.each(CI_SEEDS)('cuts the same cells under rules 14 and 15 on seed %i', (seed) => {
    const before = ciPlanetsOf(seed, RULES_14)
    ciPlanetsOf(seed, RULES_15).forEach((planet, at) => {
      expect(chunkDigestsOf(planet.params), planet.label).toEqual(chunkDigestsOf(before[at].params))
    })
  })

  it('moves only overlays, and some of them, between rules 14 and 15', () => {
    const moved = PAIRS.filter(
      ([, before, after]) =>
        gemOverlayOfPlanet(before.params)?.id !== gemOverlayOfPlanet(after.params)?.id,
    )
    expect(moved.length).toBeGreaterThan(0)
    for (const [, before, after] of moved) {
      expect(gemLookOf(after).gems).toEqual(gemLookOf(before).gems)
    }
  })

  it.each([RULES_14, RULES_15])(
    'gives the host and a joining client the same cells and looks on P12 stamped %i',
    (oreRulesVersion) => {
      const host = hostOn(12, oreRulesVersion)
      const client = joinedClientOf(host)
      expect(client.planet.oreRulesVersion).toBe(oreRulesVersion)
      expect(chunkDigestsOf(paramsOfState(client))).toEqual(chunkDigestsOf(paramsOfState(host)))
      expect(lookDigestOf(paramsOfState(client))).toBe(lookDigestOf(paramsOfState(host)))
    },
  )
})
