import { describe, expect, it } from 'vitest'
import { formatAmount, formatPrice } from '../../../systems/displayAmount'
import { fromCanonical } from '../../../systems/money'
import { ledgerIconIdOf, ledgerLineOf, type GateHit } from './ledgerLines'

// The HUD chip's and the refusal's line (ticket 238): #159's ledger voice over gate_hit's words.

const refused = (gateKind: string, required: string, have: string): GateHit => ({
  gateKind,
  outcome: 'refused',
  required,
  have,
})

const amountShown = (count: string) => formatAmount(fromCanonical(count))

/** The line with each shown amount taken out once, in order; an amount it lacks fails here. */
function withoutAmounts(line: string, amounts: string[]): string {
  return amounts.reduce((rest, amount) => {
    expect(rest).toContain(amount)
    return rest.replace(amount, '')
  }, line)
}

describe('gate ledger lines', () => {
  it('names the drill tip a cell needs and the major the miner has', () => {
    expect(ledgerLineOf(refused('drill', 'tip:34', 'tip:32'))).toBe(
      'Ledger: drill tip 34 required, the miner has 32.',
    )
    expect(ledgerLineOf({ ...refused('drill', 'tip:22', 'tip:21'), outcome: 'blocked' })).toBe(
      'Ledger: drill tip 22 required, the miner has 21.',
    )
  })

  it('prints its numbers the way every count on screen prints', () => {
    expect(ledgerLineOf(refused('drill', 'tip:1234', 'tip:999'))).toBe(
      'Ledger: drill tip 1,234 required, the miner has 999.',
    )
    expect(ledgerLineOf(refused('drill', 'tip:034', 'tip:32'))).toBeNull()
  })

  it('prints every amount in every line through formatAmount, and no other number (ticket 299)', () => {
    const hits = [
      refused('drill', 'tip:123456789', 'tip:1000000'),
      refused('dynamite', 'type:12345', 'owned'),
      refused('rig', 'rig.resonance', 'none'),
      refused('rig', 'rig.resonance:tuned', 'rig.resonance'),
    ]
    for (const hit of hits) {
      const counts = [hit.required, hit.have].map((word) => word.split(':')[1] ?? '')
      const formatted = counts.filter((count) => /^\d+$/.test(count)).map(amountShown)
      const line = ledgerLineOf(hit) ?? ''
      expect(line).not.toBe('')
      expect(withoutAmounts(line, formatted)).not.toMatch(/\d/)
    }
  })

  it('names the charge type blast-only rock needs, and says the miner carries one (D4 #863)', () => {
    expect(ledgerLineOf(refused('dynamite', 'type:2', 'owned'))).toBe(
      'Ledger: a type 2 charge breaks this rock, the miner carries one.',
    )
  })

  it('names the dock price of that charge when none is carried, rounded up, never "locked"', () => {
    const line = ledgerLineOf(refused('dynamite', 'type:3', 'price:1234567.891'))
    expect(line).toBe(
      `Ledger: a type 3 charge breaks this rock, ${formatPrice(fromCanonical('1234567.891'))} at the dock.`,
    )
    expect(
      withoutAmounts(line ?? '', ['3', formatPrice(fromCanonical('1234567.891'))]),
    ).not.toMatch(/\d/)
    expect(line).not.toMatch(/lock/i)
  })

  it('names the missing extractor by its player name, never rig', () => {
    expect(ledgerLineOf(refused('rig', 'rig.resonance', 'none'))).toBe(
      'Ledger: Resonance Fork required.',
    )
    expect(ledgerLineOf({ ...refused('rig', 'rig.aether_tether', 'none'), outcome: 'lost' })).toBe(
      'Ledger: Aether Tether required, the lump drifted off.',
    )
    expect(ledgerLineOf({ ...refused('rig', 'rig.containment', 'none'), outcome: 'lost' })).toBe(
      'Ledger: Containment Hood required, the ore vented.',
    )
  })

  it('says what an owned extractor still waits for', () => {
    expect(ledgerLineOf(refused('rig', 'rig.resonance:tuned', 'rig.resonance'))).toBe(
      'Ledger: Resonance Fork tuning, hold the miner still.',
    )
    expect(
      ledgerLineOf({
        ...refused('rig', 'rig.containment:canister', 'rig.containment'),
        outcome: 'lost',
      }),
    ).toBe('Ledger: Containment Hood canisters spent, the ore vented.')
  })

  it('has no line for a gate kind or words it does not know', () => {
    expect(ledgerLineOf(refused('quicksand', 'tip:3', 'tip:1'))).toBeNull()
    expect(ledgerLineOf(refused('drill', 'size:3', 'tip:1'))).toBeNull()
    expect(ledgerLineOf(refused('dynamite', 'size:3', 'size:1'))).toBeNull()
    expect(ledgerLineOf(refused('dynamite', 'type:2', 'price:01'))).toBeNull()
    expect(ledgerLineOf(refused('rig', 'rig.unknown', 'none'))).toBeNull()
    expect(ledgerLineOf(refused('rig', 'rig.resonance:hummed', 'rig.resonance'))).toBeNull()
  })

  it('wears the drill tip, the charge or the missing extractor as its icon', () => {
    expect(ledgerIconIdOf(refused('drill', 'tip:3', 'tip:1'))).toBe('icon-track-drill-tip')
    expect(ledgerIconIdOf(refused('dynamite', 'type:1', 'owned'))).toBe('icon-blasting-charges')
    expect(ledgerIconIdOf(refused('rig', 'rig.acid_etcher:etched', 'rig.acid_etcher'))).toBe(
      'item-rig-acid-etcher',
    )
  })
})
