import { describe, expect, it } from 'vitest'
import { chargePrice } from '../../../systems/economy/chargeSizes'
import { ECONOMY } from '../../../systems/economy/economy'
import { toCanonical } from '../../../systems/money'
import { oreHardness, signatureHardness } from '../../../systems/economy/oreEconomy'
import { canMine, minTipLevelOf, minTipMajorOfCell } from './canMine'
import {
  gatedCellOn,
  grantItems,
  paramsOn,
  queryOf,
  researchBlastBit,
  sessionOn,
  setCharges,
  setTipMajor,
} from './gateFixtures'
import { GATE_ROWS } from './gateRows'
import type { CellGateKind, GatedEntry } from './gateTable'
import { VERB_ROWS } from './verbRows'

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
  it('refuses a resonance cell to a drill without the Resonance Fork, and asks the fork to tune it', () => {
    const { session, fixture } = gatedOn(7, 'rig')
    expect(canMine(queryOf(session, fixture))).toEqual({
      outcome: 'refused',
      gateKind: 'rig',
      required: 'rig.resonance',
      have: 'none',
    })
    grantItems(session, ['rig.resonance'])
    expect(canMine(queryOf(session, fixture))).toEqual({
      outcome: 'refused',
      gateKind: 'rig',
      required: 'rig.resonance:tuned',
      have: 'rig.resonance',
      opensAfterTicks: VERB_ROWS.tune.tuneTicks,
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

describe('canMine: dynamite (blast-only rock by tier, D4 #863)', () => {
  it('refuses blast-only rock to the drill, naming the charge type and that the miner carries it', () => {
    const { session, fixture } = gatedOn(7, 'dynamite', (gated) => gated.entry.lead === 1)
    setCharges(session, 1)
    expect(canMine(queryOf(session, fixture))).toEqual({
      outcome: 'refused',
      gateKind: 'dynamite',
      required: 'type:1',
      have: 'owned',
    })
  })

  it("names that charge's dock price on this planet when the rack carries none that breaks it", () => {
    const { session, fixture } = gatedOn(7, 'dynamite', (gated) => gated.entry.lead === 2)
    setCharges(session, 4)
    expect(canMine(queryOf(session, fixture))).toEqual({
      outcome: 'refused',
      gateKind: 'dynamite',
      required: 'type:2',
      have: `price:${toCanonical(chargePrice(5, 1, 7))}`,
    })
  })

  it("opens rock to a charge whose type's breaksGate holds its tier, and no other", () => {
    const { session, fixture } = gatedOn(10, 'dynamite', (gated) => gated.entry.lead === 2)
    expect(fixture.gate).toEqual({ kind: 'dynamite', tier: 3 })
    const outcomeOf = (blastSize: number) =>
      canMine(queryOf(session, fixture, { blastSize }))?.outcome
    expect([1, 4, 5, 8, 9, 12].map(outcomeOf)).toEqual([
      'refused',
      'refused',
      'refused',
      'refused',
      'cut',
      'cut',
    ])
    expect(canMine(queryOf(session, fixture, { blastSize: 5 }))).toMatchObject({
      required: 'type:3',
      have: 'type:2',
    })
  })

  it('opens tier-1 rock to every type and tier-2 rock from type 2 on', () => {
    const tierOne = gatedOn(7, 'dynamite', (gated) => gated.entry.lead === 1)
    const tierTwo = gatedOn(7, 'dynamite', (gated) => gated.entry.lead === 2)
    expect(tierTwo.fixture.gate).toEqual({ kind: 'dynamite', tier: 2 })
    const outcomeOf = ({ session, fixture }: typeof tierOne, blastSize: number) =>
      canMine(queryOf(session, fixture, { blastSize }))?.outcome
    expect([1, 5, 9].map((size) => outcomeOf(tierOne, size))).toEqual(['cut', 'cut', 'cut'])
    expect([4, 5, 9].map((size) => outcomeOf(tierTwo, size))).toEqual(['refused', 'cut', 'cut'])
  })

  it('keeps a shell standing against a tool', () => {
    const { session, fixture } = gatedOn(7, 'dynamite')
    expect(canMine(queryOf(session, fixture, { tool: 'probe.drain' }))?.outcome).toBe('refused')
  })
})

describe('canMine: the blast bit (D5 #864)', () => {
  /** Blast-only rock of `lead` on `planet`, the bit researched and the tip scratching the cell. */
  function grindableOn(planet: number, lead: number) {
    const gated = gatedOn(planet, 'dynamite', (entry) => entry.entry.lead === lead)
    researchBlastBit(gated.session)
    const { tile, cell } = gated.fixture
    setTipMajor(gated.session, minTipMajorOfCell(paramsOn(gated.session), tile, cell))
    return gated
  }

  it('lets the drill cut blast-only rock at a quarter of its speed once the bit is researched', () => {
    const { session, fixture } = grindableOn(7, 2)
    expect(GATE_ROWS.blastBitSpeedBp).toBe(2500)
    expect(canMine(queryOf(session, fixture))).toEqual({
      outcome: 'cut',
      gateKind: 'dynamite',
      required: 'type:2',
      have: 'blast_bit',
      drillSpeedBp: GATE_ROWS.blastBitSpeedBp,
    })
  })

  it('cuts tier-3 rock too, whatever the rack carries', () => {
    const { session, fixture } = grindableOn(10, 2)
    expect(fixture.gate).toEqual({ kind: 'dynamite', tier: 3 })
    setCharges(session, 1)
    expect(canMine(queryOf(session, fixture))?.outcome).toBe('cut')
  })

  it('asks the tip of rock it cannot scratch yet, as of any ordinary cell from planet 7', () => {
    const { session, fixture } = gatedOn(7, 'dynamite', (gated) => gated.entry.lead === 2)
    researchBlastBit(session)
    const needed = minTipMajorOfCell(paramsOn(session), fixture.tile, fixture.cell)
    setTipMajor(session, needed - 1)
    expect(canMine(queryOf(session, fixture))).toEqual({
      outcome: 'refused',
      gateKind: 'drill',
      required: `tip:${needed}`,
      have: `tip:${needed - 1}`,
    })
  })

  it('answers a charge and a tool on blast-only rock as without the bit', () => {
    const { session, fixture } = gatedOn(10, 'dynamite', (gated) => gated.entry.lead === 2)
    const answersOf = () =>
      [{ blastSize: 5 }, { blastSize: 9 }, { tool: 'probe.drain' }].map((means) =>
        canMine(queryOf(session, fixture, means)),
      )
    const without = answersOf()
    researchBlastBit(session)
    expect(answersOf()).toEqual(without)
  })
})

describe('canMine: drill-tier gates against a blast (D4 #863 deleted the hardness cap)', () => {
  it('keeps a drill-gated signature standing against every charge, as the band-5 cap kept it', () => {
    const { session, fixture } = gatedOn(4, 'drillSignature')
    expect(canMine(queryOf(session, fixture, { blastSize: 12 }))?.outcome).toBe('refused')
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

describe('canMine: an early buy (#411)', () => {
  const EVERY_RIG = GATE_ROWS.rigs.map((rig) => rig.id)

  it('keeps a tip-locked dense cell shut with every extractor bought: the tip still keys it', () => {
    const { session, fixture } = gatedOn(7, 'dense')
    setTipMajor(session, fixture.entry.tier)
    grantItems(session, EVERY_RIG)
    expect(canMine(queryOf(session, fixture))?.outcome).toBe('refused')
  })

  it('keeps a sealed shell and a drill-gated signature shut with every extractor bought', () => {
    const shell = gatedOn(7, 'dynamite')
    grantItems(shell.session, EVERY_RIG)
    expect(canMine(queryOf(shell.session, shell.fixture))?.outcome).toBe('refused')
    const signature = gatedOn(4, 'drillSignature')
    setTipMajor(signature.session, signature.fixture.entry.tier)
    grantItems(signature.session, EVERY_RIG)
    expect(canMine(queryOf(signature.session, signature.fixture))?.outcome).toBe('blocked')
  })
})
