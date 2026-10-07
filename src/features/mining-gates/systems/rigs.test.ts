import { describe, expect, it } from 'vitest'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { contentOf } from '../../../systems/registries/content'
import { flavourProblemsOf } from '../../descriptions'
import { actOf, familyRows } from '../../planet-mix'
import { GATE_ROWS } from './gateRows'
import { fillLedgerTemplate, ledgerTemplatesOf } from './ledgerLines'
import {
  availableFromPlanet,
  iconIdOfRig,
  rigPriceOf,
  signatureRigOf,
  vehicleItemOfRig,
} from './rigs'

const ENDLESS = Array.from({ length: 25 }, (_, at) => 41 + at)

describe('extractors', () => {
  it('arrive one every seven planets from planet 5, in their arrival order', () => {
    expect(GATE_ROWS.rigs.map((rig) => [rig.id, availableFromPlanet(rig)])).toEqual([
      ['rig.resonance', 5],
      ['rig.containment', 12],
      ['rig.acid_etcher', 19],
      ['rig.induction', 26],
      ['rig.aether_tether', 33],
    ])
  })

  it('give a campaign signature the newest extractor on its planet, and none before planet 5', () => {
    expect(signatureRigOf(4)).toBeNull()
    expect([5, 11, 12, 18, 19, 26, 33, 40].map((p) => signatureRigOf(p)?.id)).toEqual([
      'rig.resonance',
      'rig.resonance',
      'rig.containment',
      'rig.containment',
      'rig.acid_etcher',
      'rig.induction',
      'rig.aether_tether',
      'rig.aether_tether',
    ])
  })

  it('give every endless planet from P41 to P65 an extractor, and all 25 act-and-extractor pairs once', () => {
    const pairs = ENDLESS.map((p) => `${actOf(p).id} × ${signatureRigOf(p)?.id}`)
    expect(ENDLESS.every((p) => signatureRigOf(p) !== null)).toBe(true)
    expect(new Set(pairs).size).toBe(25)
    expect(new Set(ENDLESS.map((p) => actOf(p).id)).size).toBe(5)
  })

  it('cost 40 band-5 ore at their own planet, through bandOrePriceAt', () => {
    for (const rig of GATE_ROWS.rigs) {
      const planet = availableFromPlanet(rig)
      expect(rigPriceOf(rig)).toEqual(bandOrePriceAt(GATE_ROWS.rigPrice, planet, planet))
    }
    expect(GATE_ROWS.rigPrice).toMatchObject({ band: 5 })
  })

  it('open a gate class the family rows name, and every class a family wears is opened by something', () => {
    const classes = new Set(familyRows().map((row) => row.gateClass))
    const opened = new Set(['drill', 'dynamite', ...GATE_ROWS.rigs.map((rig) => rig.gateClass)])
    expect([...classes].filter((gateClass) => !opened.has(gateClass))).toEqual([])
    expect([...opened].filter((gateClass) => !classes.has(gateClass))).toEqual([])
  })

  it('carry an icon, a mount, a tree node and player text with no digits that never says rig', () => {
    for (const rig of GATE_ROWS.rigs) {
      expect(iconIdOfRig(rig)).toMatch(/^item-rig-[a-z-]+$/)
      expect(rig.unlockedBy).toMatch(/^tech\.extraction\./)
      expect(rig.description.length).toBeLessThanOrEqual(80)
      expect(`${rig.name} ${rig.description}`).not.toMatch(/\d|\brigs?\b/i)
    }
  })

  it('word their ledger lines inside the #159 flavour rules, with the longest name filled in', () => {
    const longestName = GATE_ROWS.rigs.map((rig) => rig.name).sort((a, b) => b.length - a.length)[0]
    const lines = ledgerTemplatesOf().map((template) =>
      fillLedgerTemplate(template, { extractor: longestName }),
    )
    expect(lines.flatMap((line) => flavourProblemsOf(line).map((p) => `${line}: ${p}`))).toEqual([])
  })

  it('register as slotless vehicle items, mounted once owned', () => {
    const registered = contentOf('vehicle-item').filter((item) => item.id.startsWith('rig.'))
    expect(registered).toHaveLength(GATE_ROWS.rigs.length)
    expect(registered).toEqual(expect.arrayContaining(GATE_ROWS.rigs.map(vehicleItemOfRig)))
  })
})
