import { describe, expect, it } from 'vitest'
import { ledgerIconIdOf, ledgerLineOf, type GateHit } from './ledgerLines'

// The HUD chip's and the refusal's line (ticket 238): #159's ledger voice over gate_hit's words.

const refused = (gateKind: string, required: string, have: string): GateHit => ({
  gateKind,
  outcome: 'refused',
  required,
  have,
})

describe('gate ledger lines', () => {
  it('names the drill tip a cell needs and the major the miner has', () => {
    expect(ledgerLineOf(refused('drill', 'tip:34', 'tip:32'))).toBe(
      'Ledger: drill tip 34 required, the miner has 32.',
    )
    expect(ledgerLineOf({ ...refused('drill', 'tip:22', 'tip:21'), outcome: 'blocked' })).toBe(
      'Ledger: drill tip 22 required, the miner has 21.',
    )
  })

  it('names the charge size a shell needs and the size carried, or none', () => {
    expect(ledgerLineOf(refused('dynamite', 'size:3', 'size:1'))).toBe(
      'Ledger: dynamite size 3 required, the miner carries size 1.',
    )
    expect(ledgerLineOf(refused('dynamite', 'size:2', 'size:0'))).toBe(
      'Ledger: dynamite size 2 required, the miner carries none.',
    )
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
    expect(ledgerLineOf(refused('rig', 'rig.unknown', 'none'))).toBeNull()
    expect(ledgerLineOf(refused('rig', 'rig.resonance:hummed', 'rig.resonance'))).toBeNull()
  })

  it('wears the drill tip, the charge or the missing extractor as its icon', () => {
    expect(ledgerIconIdOf(refused('drill', 'tip:3', 'tip:1'))).toBe('icon-track-drill-tip')
    expect(ledgerIconIdOf(refused('dynamite', 'size:1', 'size:0'))).toBe('icon-blasting-charges')
    expect(ledgerIconIdOf(refused('rig', 'rig.acid_etcher:etched', 'rig.acid_etcher'))).toBe(
      'item-rig-acid-etcher',
    )
  })
})
