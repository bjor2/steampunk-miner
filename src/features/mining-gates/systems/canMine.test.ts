import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../../../systems/economy/economy'
import { oreHardness, signatureHardness } from '../../../systems/economy/oreEconomy'
import { canMine, minTipLevelOf } from './canMine'
import {
  gatedCellOn,
  grantItems,
  paramsOn,
  queryOf,
  sessionOn,
  setCharges,
  setTipMajor,
} from './gateFixtures'
import type { CellGateKind, GatedEntry } from './gateTable'

const TIERS = Array.from({ length: 200 }, (_, at) => at + 1)
const PIPS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

/** A session on `planet` and the first cell of its table with a gate of `kind` that `also` picks. */
function gatedOn(
  planet: number,
  kind: CellGateKind,
  also: (gated: GatedEntry) => boolean = () => true,
) {
  const session = sessionOn(planet)
  const fixture = gatedCellOn(paramsOn(session), (gated) => gated.gate.kind === kind && also(gated))
  return { session, fixture }
}

describe('canMine: drill tiers', () => {
  it('needs a dense cell tip one major past its tier, for tiers 1 to 200', () => {
    const floor = ECONOMY.drill.denseScratchFloor
    expect(TIERS.filter((t) => minTipLevelOf(oreHardness(t), floor) !== t + 1)).toEqual([])
  })

  it('needs a drill-gated signature tip four majors past its tier, for tiers 1 to 200', () => {
    const floor = ECONOMY.drill.gateScratchFloor
    expect(TIERS.filter((t) => minTipLevelOf(signatureHardness(t), floor) !== t + 4)).toEqual([])
  })

  it('keeps the ordinary cell where the quarter floor puts it: seven majors below its tier', () => {
    const floor = ECONOMY.drill.scratchFloor
    const late = TIERS.filter((t) => t > 7)
    expect(late.filter((t) => minTipLevelOf(oreHardness(t), floor) !== t - 7)).toEqual([])
  })

  it('refuses a dense cell below the major one past its tier, naming both majors', () => {
    const { session, fixture } = gatedOn(7, 'dense')
    const tier = fixture.entry.tier
    setTipMajor(session, tier)
    expect(canMine(queryOf(session, fixture))).toEqual({
      outcome: 'refused',
      gateKind: 'drill',
      required: `tip:${tier + 1}`,
      have: `tip:${tier}`,
    })
    setTipMajor(session, tier + 1)
    expect(canMine(queryOf(session, fixture))).toBeNull()
  })

  it('reads the last completed major: a dense cell stays refused at every pip below the gate', () => {
    const { session, fixture } = gatedOn(7, 'dense')
    const outcomes = PIPS.map((pips) => {
      setTipMajor(session, fixture.entry.tier, pips)
      return canMine(queryOf(session, fixture))?.outcome
    })
    expect(new Set(outcomes)).toEqual(new Set(['refused']))
  })

  it('blocks a drill-gated signature below its tip and lets the drill have it at that major', () => {
    const { session, fixture } = gatedOn(4, 'drillSignature')
    const tier = fixture.entry.tier
    setTipMajor(session, tier + 3, 9)
    expect(canMine(queryOf(session, fixture))).toMatchObject({
      outcome: 'blocked',
      gateKind: 'drill',
      required: `tip:${tier + 4}`,
    })
    setTipMajor(session, tier + 4)
    expect(canMine(queryOf(session, fixture))).toBeNull()
  })

  it('gates no common cell before planet 7, even one the tip cannot scratch', () => {
    const { session, fixture } = gatedOn(5, 'none')
    setTipMajor(session, 0)
    expect(canMine(queryOf(session, fixture))).toBeNull()
  })

  it('reports an ordinary cell the tip cannot scratch from planet 7 as a drill gate', () => {
    const { session, fixture } = gatedOn(7, 'none')
    setTipMajor(session, 0)
    expect(canMine(queryOf(session, fixture))).toMatchObject({
      outcome: 'refused',
      gateKind: 'drill',
    })
  })
})

describe('canMine: extractors', () => {
  it('refuses a resonance cell to a drill without the Resonance Fork, and cuts it with one', () => {
    const { session, fixture } = gatedOn(7, 'rig')
    expect(canMine(queryOf(session, fixture))).toEqual({
      outcome: 'refused',
      gateKind: 'rig',
      required: 'rig.resonance',
      have: 'none',
    })
    grantItems(session, ['rig.resonance'])
    expect(canMine(queryOf(session, fixture))).toMatchObject({
      outcome: 'cut',
      have: 'rig.resonance',
    })
  })

  it('loses a containment cell to a drill without the hood, so the ore vents', () => {
    const { session, fixture } = gatedOn(12, 'rig', (gated) => gated.entry.signature)
    expect(canMine(queryOf(session, fixture))).toMatchObject({
      outcome: 'lost',
      required: 'rig.containment',
    })
  })

  it('keeps an extractor-gated cell standing against a blast and a tool, extractor or not', () => {
    const { session, fixture } = gatedOn(7, 'rig')
    grantItems(session, ['rig.resonance'])
    expect(canMine(queryOf(session, fixture, { blastSize: 10 }))?.outcome).toBe('refused')
    expect(canMine(queryOf(session, fixture, { tool: 'probe.drain' }))?.outcome).toBe('refused')
  })
})

describe('canMine: dynamite', () => {
  it('refuses a sealed shell to the drill, naming the charge it needs and the one carried', () => {
    const { session, fixture } = gatedOn(7, 'dynamite')
    setCharges(session, 1)
    expect(canMine(queryOf(session, fixture))).toEqual({
      outcome: 'refused',
      gateKind: 'dynamite',
      required: 'size:1',
      have: 'size:1',
    })
  })

  it('frees a shell to a charge of at least its minCharge and refuses a smaller one', () => {
    const { session, fixture } = gatedOn(10, 'dynamite', (gated) => gated.entry.lead === 2)
    expect(fixture.gate).toEqual({ kind: 'dynamite', minCharge: 2 })
    expect(canMine(queryOf(session, fixture, { blastSize: 1 }))?.outcome).toBe('refused')
    expect(canMine(queryOf(session, fixture, { blastSize: 2 }))?.outcome).toBe('cut')
  })

  it('keeps a shell standing against a tool', () => {
    const { session, fixture } = gatedOn(7, 'dynamite')
    expect(canMine(queryOf(session, fixture, { tool: 'probe.drain' }))?.outcome).toBe('refused')
  })
})

describe('canMine: dense cells and tools', () => {
  it('keeps a dense cell standing against every blast and every tool', () => {
    const { session, fixture } = gatedOn(7, 'dense')
    setTipMajor(session, fixture.entry.tier + 5)
    expect(canMine(queryOf(session, fixture, { blastSize: 10 }))?.outcome).toBe('refused')
    expect(canMine(queryOf(session, fixture, { tool: 'probe.drain' }))?.outcome).toBe('refused')
  })

  it('lets a tool take a common cell', () => {
    const { session, fixture } = gatedOn(7, 'none')
    expect(canMine(queryOf(session, fixture, { tool: 'probe.drain' }))).toBeNull()
  })
})
